/** Loopback-only Host RPC for the automation asset review UI. */

import type { Context } from '@deepseek-ai/cordis'
import type { ConnectionRpcHandler } from '@deepseek-ai/dsh-client-connection'
import { ActivationRefusedError, type AutomationAsset, type AutomationAssetStatus, type AutomationAssetStore } from './automation-assets.ts'
import type { BrowserService } from './browser-service.ts'
import { executeAutomationAsset } from './automation-execution.ts'

/**
 * This plugin's own logical RPC channel.
 *
 * NOT the shared `/api`: `intercept('/api', …)` does not share that channel, it
 * REPLACES its fallback — the interceptor's `matches` gate becomes the only
 * route resolution, so every other plugin's endpoint (`settings/describe`,
 * `session/list`, …) starts returning 404 and the whole Web UI loses its API.
 * A plugin that owns its endpoints registers a private channel instead.
 */
const CHANNEL = '/dsh-browser-assets'
const PREFIX = 'dsh-browser-assets'
const ENDPOINTS = ['snapshot', 'get', 'save', 'fork', 'summarize', 'dismiss', 'validate', 'test', 'status'] as const

function record(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('request payload must be an object')
  if (JSON.stringify(payload).length > 100_000) throw new Error('request payload exceeds 100000 characters')
  return payload as Record<string, unknown>
}

function stringField(payload: Record<string, unknown>, name: string): string {
  const value = payload[name]
  if (typeof value !== 'string' || value.length < 1 || value.length > 200) throw new Error(`${name} must be a non-empty string`)
  return value
}

/** A failure the review UI should tell apart from a transport or storage error. `details.errorCode` names it. */
export class AssetRpcFailure extends Error {
  constructor(message: string, readonly details: Record<string, unknown>) {
    super(message)
    this.name = 'AssetRpcFailure'
  }
}

function expectedRevision(payload: Record<string, unknown>): number | undefined {
  const value = payload.expectedRevision
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'number' || !Number.isInteger(value)) throw new Error('expectedRevision must be an integer')
  return value
}

export function registerAutomationAssetRpc(ctx: Context, store: AutomationAssetStore, service: BrowserService): void {
  ctx.inject(['connection', 'webServer'], (connectionCtx) => {
    // Register the channel with the Host transport rather than hand-rolling the
    // client-request/server-response envelope on an exact Fetch route. The
    // transport owns envelope decoding, the admission/authentication fence, the
    // cancellation signal, and the Peer scope the handler receives — none of
    // which a manual route can reconstruct.
    // The dedicated registrar mounts its Web route through the Context that
    // reads it. The root Context owns webServer; the plugin effect owns cleanup.
    const connection = (connectionCtx.root as unknown as {
      connection: {
        rpc: {
          /** Register one authenticated absolute channel prefix owned by this plugin. */
          handle(channel: string, handler: ConnectionRpcHandler): () => Promise<void>
        }
      }
    }).connection
    const handler: ConnectionRpcHandler = async (endpoint, rawPayload) => {
      try {
        // The transport hands the handler the endpoint relative to the channel,
        // so a request to `/dsh-browser-assets/snapshot` arrives as `snapshot`.
        // Accept a prefixed form too, so either address style keeps working.
        const leaf = endpoint.startsWith(PREFIX + '/') ? endpoint.slice(PREFIX.length + 1) : endpoint
        const payload = record(rawPayload)
        let value: unknown
        switch (leaf) {
          case 'snapshot': value = store.snapshot(); break
          case 'get': value = store.get(stringField(payload, 'id')) ?? null; break
          case 'save': value = store.saveDraft(payload.asset as Partial<AutomationAsset> & Pick<AutomationAsset, 'kind' | 'name'>); break
          case 'fork': value = store.fork(stringField(payload, 'id')); break
          case 'summarize': value = store.summarizeCandidate(stringField(payload, 'id')); break
          case 'dismiss': store.dismissCandidate(stringField(payload, 'id')); value = store.snapshot(); break
          case 'validate': value = store.validate(stringField(payload, 'id')); break
          case 'test': {
            const result = await executeAutomationAsset(service, store, stringField(payload, 'id'), stringField(payload, 'url'), payload.inputs, 'draft', { expectedRevision: expectedRevision(payload) })
            // The review UI shows a failed replay as an error, as it did when a failure threw. The errorCode lets it
            // say "the result did not hold" (VALIDATION_FAILED / VALIDATION_MISSING) apart from a backend problem.
            if (!result.succeeded) {
              const execution = result.execution
              const errorCode = result.verifierMissing ? 'VALIDATION_MISSING' : execution.failedStep?.errorCode ?? (execution.validationStatus === 'failed' ? 'VALIDATION_FAILED' : 'ACTION_FAILED')
              throw new AssetRpcFailure(
                result.verifierMissing?.message ?? execution.failedStep?.message ?? execution.message ?? 'Runtime replay did not complete.',
                { errorCode, executionStatus: execution.executionStatus, validationStatus: execution.validationStatus, effects: execution.effects, revision: result.asset.revision },
              )
            }
            value = result.asset
            break
          }
          case 'status': value = store.setStatus(stringField(payload, 'id'), stringField(payload, 'status') as AutomationAssetStatus, { expectedRevision: expectedRevision(payload) }); break
          default: return { ok: false, error: { code: 'not-found' as const, message: `unknown automation asset endpoint: ${endpoint}`, details: {} } }
        }
        return { ok: true, value }
      } catch (error) {
        const details = error instanceof AssetRpcFailure ? error.details : error instanceof ActivationRefusedError ? { errorCode: 'ACTIVATION_REFUSED', reason: error.reason } : {}
        return { ok: false, error: { code: 'bad-request' as const, message: String(error instanceof Error ? error.message : error).slice(0, 500), details } }
      }
    }
    connectionCtx.effect(
      () => connection.rpc.handle(CHANNEL, handler),
      'dsh-browser: automation asset RPC channel',
    )
  })
}
