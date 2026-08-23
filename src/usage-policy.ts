/** Bounded, approval-independent buffering for browser and crawler traffic. */

export interface UsagePolicyInput {
  minDelayMs?: number
  maxConcurrency?: number
  burst?: number
  maxPagesPerRun?: number
  maxDepth?: number
  retryLimit?: number
  backoffBaseMs?: number
  cooldownMs?: number
}

export interface UsagePolicy extends Record<string, number> {
  minDelayMs: number
  maxConcurrency: number
  burst: number
  maxPagesPerRun: number
  maxDepth: number
  retryLimit: number
  backoffBaseMs: number
  cooldownMs: number
}

const DEFAULT_POLICY: UsagePolicy = {
  minDelayMs: 750,
  maxConcurrency: 2,
  burst: 3,
  maxPagesPerRun: 20,
  maxDepth: 2,
  retryLimit: 2,
  backoffBaseMs: 1_000,
  cooldownMs: 30_000,
}

function boundedInteger(name: string, value: unknown, fallback: number, min: number, max: number): number {
  const resolved = value ?? fallback
  if (!Number.isInteger(resolved) || Number(resolved) < min || Number(resolved) > max) {
    throw new Error(`usagePolicy.${name} must be an integer from ${min} to ${max}`)
  }
  return Number(resolved)
}

export function resolveUsagePolicy(input: UsagePolicyInput | undefined): UsagePolicy {
  return {
    minDelayMs: boundedInteger('minDelayMs', input?.minDelayMs, DEFAULT_POLICY.minDelayMs, 0, 60_000),
    maxConcurrency: boundedInteger('maxConcurrency', input?.maxConcurrency, DEFAULT_POLICY.maxConcurrency, 1, 8),
    burst: boundedInteger('burst', input?.burst, DEFAULT_POLICY.burst, 1, 20),
    maxPagesPerRun: boundedInteger('maxPagesPerRun', input?.maxPagesPerRun, DEFAULT_POLICY.maxPagesPerRun, 1, 100),
    maxDepth: boundedInteger('maxDepth', input?.maxDepth, DEFAULT_POLICY.maxDepth, 0, 5),
    retryLimit: boundedInteger('retryLimit', input?.retryLimit, DEFAULT_POLICY.retryLimit, 0, 5),
    backoffBaseMs: boundedInteger('backoffBaseMs', input?.backoffBaseMs, DEFAULT_POLICY.backoffBaseMs, 1, 60_000),
    cooldownMs: boundedInteger('cooldownMs', input?.cooldownMs, DEFAULT_POLICY.cooldownMs, 100, 300_000),
  }
}

interface HostState {
  starts: number[]
  blockedUntil: number
  consecutiveFailures: number
}

function abortedError(): Error {
  return new Error('usage policy wait aborted')
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortedError())
  if (ms <= 0) return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      reject(abortedError())
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export class UsageGovernor {
  private active = 0
  private readonly globalWaiters: (() => void)[] = []
  private readonly hosts = new Map<string, HostState>()
  private queued = 0
  private totalRuns = 0
  private totalWaitMs = 0
  private backoffEvents = 0

  constructor(readonly policy: UsagePolicy) {}

  private host(url: string): { key: string; state: HostState } {
    let key: string
    try { key = new URL(url).hostname.toLowerCase() } catch { throw new Error('usage policy requires an absolute HTTP(S) URL') }
    if (!key) throw new Error('usage policy requires a URL hostname')
    let state = this.hosts.get(key)
    if (!state) {
      state = { starts: [], blockedUntil: 0, consecutiveFailures: 0 }
      this.hosts.set(key, state)
    }
    return { key, state }
  }

  private async acquireGlobal(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw abortedError()
    if (this.active < this.policy.maxConcurrency) {
      this.active++
      return
    }
    this.queued++
    await new Promise<void>((resolve, reject) => {
      const resume = () => {
        signal?.removeEventListener('abort', onAbort)
        this.queued--
        resolve()
      }
      const onAbort = () => {
        const index = this.globalWaiters.indexOf(resume)
        if (index >= 0) this.globalWaiters.splice(index, 1)
        signal?.removeEventListener('abort', onAbort)
        this.queued--
        reject(abortedError())
      }
      this.globalWaiters.push(resume)
      signal?.addEventListener('abort', onAbort, { once: true })
    })
  }

  private releaseGlobal(): void {
    const next = this.globalWaiters.shift()
    if (next) next()
    else this.active--
  }

  private async acquireHost(state: HostState, signal?: AbortSignal): Promise<void> {
    while (true) {
      const now = Date.now()
      const windowStart = now - this.policy.minDelayMs
      state.starts = state.starts.filter(start => start > windowStart)
      const burstReady = state.starts.length < this.policy.burst
      const readyAt = Math.max(
        state.blockedUntil,
        burstReady ? now : (state.starts[0] ?? now) + this.policy.minDelayMs,
      )
      if (readyAt <= now) {
        state.starts.push(now)
        return
      }
      const waitMs = readyAt - now
      this.totalWaitMs += waitMs
      await delay(waitMs, signal)
    }
  }

  async run<T>(url: string, operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const { state } = this.host(url)
    await this.acquireGlobal(signal)
    try {
      await this.acquireHost(state, signal)
      this.totalRuns++
      return await operation()
    } finally {
      this.releaseGlobal()
    }
  }

  /** Record server pressure. Returns the applied host cooldown in milliseconds. */
  noteResponse(url: string, status: number, retryAfterMs?: number): number {
    const { state } = this.host(url)
    if (status >= 200 && status < 400) {
      state.consecutiveFailures = 0
      return 0
    }
    if (![429, 502, 503, 504].includes(status)) return 0
    state.consecutiveFailures++
    this.backoffEvents++
    const exponential = this.policy.backoffBaseMs * (2 ** Math.max(0, state.consecutiveFailures - 1))
    const applied = Math.min(Math.max(retryAfterMs ?? exponential, 0), this.policy.cooldownMs)
    state.blockedUntil = Math.max(state.blockedUntil, Date.now() + applied)
    return applied
  }

  snapshot(): { active: number; queued: number; trackedHosts: number; coolingHosts: number; totalRuns: number; totalWaitMs: number; backoffEvents: number } {
    const now = Date.now()
    return {
      active: this.active,
      queued: this.queued,
      trackedHosts: this.hosts.size,
      coolingHosts: [...this.hosts.values()].filter(state => state.blockedUntil > now).length,
      totalRuns: this.totalRuns,
      totalWaitMs: this.totalWaitMs,
      backoffEvents: this.backoffEvents,
    }
  }
}
