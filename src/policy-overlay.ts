/**
 * The policy overlay: restriction-type settings that an agent may edit, without hand-editing the config.
 *
 * Only two kinds of field can be overlaid: `authProfiles` (allowed domains, persistState, storageStatePath, and
 * creating or removing a profile) and the `usagePolicy` throttle values. The panel's configuration stays the
 * baseline; the overlay is a small managed file next to the plugin's other data (`$DSH_HOME/data/browser/`) that is
 * merged on top of it, with a revision for optimistic locking and a bounded audit trail.
 *
 * Everything an agent may put in the overlay is validated here, strictly, by the same functions that re-validate the
 * file when it is loaded: a file that does not parse, fails its checksum or holds a value the validators refuse is
 * ignored as a whole (the baseline applies) and reported, never half-applied.
 * @module dsh-browser/policy-overlay
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { domainToASCII } from 'node:url'
import { ActionArgError } from './actions/types.ts'
import type { AuthProfileConfig } from './auth-profiles.ts'
import type { UsagePolicy } from './usage-policy.ts'
import { USAGE_POLICY_BOUNDS, USAGE_POLICY_KEYS } from './policy-keys.ts'

// -- limits --

export const MAX_DOMAINS_PER_PROFILE = 50
export const MAX_PROFILES = 30
export const MAX_AUDIT_ENTRIES = 50
const MAX_REASON = 300
const MAX_DOMAIN_LENGTH = 253

const PROFILE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/
const FORBIDDEN_IDS = new Set(['__proto__', 'constructor', 'prototype'])
const CONTROL_OR_SPACE = /[\u0000-\u0020\u007f-\u009f\u00a0\u2028\u2029\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/

// -- domain rules --

/**
 * Suffixes under which unrelated parties register names. Allowing one as a login scope would send a login state to
 * every tenant of the platform. This is a small built-in list (the platforms people actually hit) plus a structural
 * rule for ccTLD second levels; it is not the full public suffix list.
 */
const PUBLIC_SUFFIXES = new Set([
  'github.io', 'gitlab.io', 'pages.dev', 'workers.dev', 'vercel.app', 'netlify.app', 'herokuapp.com', 'blogspot.com',
  'wordpress.com', 'appspot.com', 'azurewebsites.net', 'cloudfront.net', 'amazonaws.com', 's3.amazonaws.com',
  'firebaseapp.com', 'web.app', 'onrender.com', 'fly.dev', 'surge.sh', 'glitch.me', 'repl.co', 'ngrok.io',
  'ngrok-free.app', 'trycloudflare.com', 'myshopify.com', 'weebly.com', 'wixsite.com', 'tumblr.com', 'neocities.org',
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'me.uk', 'ltd.uk', 'plc.uk', 'sch.uk', 'nhs.uk',
])
const GENERIC_SECOND_LEVEL = new Set(['co', 'com', 'org', 'net', 'gov', 'edu', 'ac', 'ne', 'or', 'go', 'mil', 'gob', 'nom', 'ltd', 'plc', 'sch', 'ind'])
const PRIVATE_SUFFIXES = ['localhost', 'local', 'internal', 'lan', 'home.arpa', 'intranet', 'corp', 'localdomain', 'private', 'home']

/** Whether a (non-wildcard) name is a TLD or a registry/platform suffix, which can never be a login scope. */
export function isPublicSuffix(name: string): boolean {
  const labels = name.split('.')
  if (labels.length < 2) return true
  if (PUBLIC_SUFFIXES.has(name)) return true
  const top = labels[labels.length - 1]!
  const second = labels[labels.length - 2]!
  return labels.length === 2 && top.length === 2 && GENERIC_SECOND_LEVEL.has(second)
}

function privateSuffix(name: string): boolean {
  return PRIVATE_SUFFIXES.some(suffix => name === suffix || name.endsWith('.' + suffix))
}

/** Plain dotted IPv4 (each octet 0-255, no leading zeros games). */
function ipv4Octets(name: string): number[] | undefined {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(name)
  if (!match) return undefined
  const octets = match.slice(1).map(Number)
  if (octets.some((octet, index) => octet > 255 || String(octet) !== match[index + 1])) return undefined
  return octets
}

/** Loopback, RFC 1918. Link-local (169.254/16, which holds the cloud metadata address) and 0.0.0.0 are never private-allowed. */
function privateIpv4(octets: number[]): boolean {
  const [a, b] = octets as [number, number]
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}

export interface DomainEnv {
  allowPrivateHosts: boolean
}

/**
 * Normalize one allowed-domain entry to its stored form (lower-case punycode, `*.` kept) or throw
 * {@link ActionArgError} saying exactly why it is refused.
 */
export function normalizeAllowedDomain(raw: unknown, env: DomainEnv): string {
  const fail = (why: string): never => { throw new ActionArgError(`allowedDomains entry ${JSON.stringify(typeof raw === 'string' ? raw.slice(0, 80) : raw)}: ${why}`, 'Use a bare registrable domain such as example.com, or *.example.com.') }
  if (typeof raw !== 'string') return fail('must be a string')
  if (raw.length === 0 || raw.length > MAX_DOMAIN_LENGTH + 2) return fail('must be 1 to 253 characters')
  if (CONTROL_OR_SPACE.test(raw)) return fail('must not contain whitespace or control characters')
  if (/[:/\\?#@%\[\]]/.test(raw)) return fail('must be a host name only, without a scheme, port, path, query, credentials or brackets')
  if (raw.endsWith('.')) return fail('must not end with a dot')
  let host = raw
  let wildcard = false
  if (host.startsWith('*.')) { wildcard = true; host = host.slice(2) }
  if (host.includes('*')) return fail('a wildcard is only allowed as the leading label of *.example.com')
  if (host === '') return fail('is empty')
  const ascii = domainToASCII(host)
  if (!ascii) return fail('is not a valid host name')
  host = ascii.toLowerCase()
  if (host.length > MAX_DOMAIN_LENGTH) return fail('is too long')
  const labels = host.split('.')
  if (labels.some(label => label.length === 0 || label.length > 63 || !/^[a-z0-9_-]+$/.test(label) || label.startsWith('-') || label.endsWith('-'))) return fail('has an invalid label')
  const last = labels[labels.length - 1]!
  // WHATWG "ends in a number": 127.1, 0x7f.0.0.1, 2130706433 all reach loopback and are IP literals by another spelling.
  if (/^(0x[0-9a-f]*|\d+)$/i.test(last)) {
    const octets = ipv4Octets(host)
    if (wildcard) return fail('a wildcard IP address is never allowed')
    if (!octets) return fail('is an IP literal in a non-standard spelling; IP literals are not accepted')
    if (octets[0] === 169 && octets[1] === 254) return fail('link-local and cloud metadata addresses are never allowed')
    if (octets.every(octet => octet === 0)) return fail('0.0.0.0 is never allowed')
    if (!privateIpv4(octets)) return fail('public IP literals are not accepted; use the host name')
    if (!env.allowPrivateHosts) return fail('loopback and private-network addresses need allowPrivateHosts=true in the configuration')
    return host
  }
  if (privateSuffix(host) || host === 'metadata' || host === 'metadata.google.internal') {
    if (host === 'metadata.google.internal') return fail('cloud metadata hosts are never allowed')
    if (wildcard && labels.length === 1) return fail('a wildcard on a bare TLD is never allowed')
    if (!env.allowPrivateHosts) return fail('localhost, .local, .internal and other private-network names need allowPrivateHosts=true in the configuration')
    return wildcard ? '*.' + host : host
  }
  if (labels.length === 1) return fail('a bare top-level name (com, org, ...) is not a registrable domain')
  if (isPublicSuffix(host)) return fail(`"${host}" is a public suffix: it would cover unrelated sites. Use a registrable domain under it`)
  return wildcard ? '*.' + host : host
}

/** The name an entry matches (`*.a.com` and `a.com` scope the same hosts, see hostAllowed). */
export function domainBase(entry: string): string {
  return entry.startsWith('*.') ? entry.slice(2) : entry
}

export function normalizeAllowedDomains(raw: unknown, env: DomainEnv): string[] {
  if (!Array.isArray(raw)) throw new ActionArgError('allowedDomains must be an array of domain names')
  if (raw.length === 0) throw new ActionArgError('allowedDomains must hold at least one domain: a profile that matches nothing is removed with runtime.remove_auth_profile')
  if (raw.length > MAX_DOMAINS_PER_PROFILE) throw new ActionArgError(`allowedDomains holds ${raw.length} entries; at most ${MAX_DOMAINS_PER_PROFILE} are allowed`)
  const seen = new Map<string, string>()
  for (const entry of raw) {
    const normalized = normalizeAllowedDomain(entry, env)
    const base = domainBase(normalized)
    if (seen.has(base)) throw new ActionArgError(`allowedDomains lists ${base} twice (${seen.get(base)} and ${normalized}; they scope the same hosts)`)
    seen.set(base, normalized)
  }
  return [...seen.values()]
}

export function checkProfileId(id: unknown): string {
  if (typeof id !== 'string' || !PROFILE_ID.test(id) || FORBIDDEN_IDS.has(id) || id in Object.prototype) {
    throw new ActionArgError(`profile id ${JSON.stringify(typeof id === 'string' ? id.slice(0, 60) : id)} must start with a letter or digit, use only letters, digits, _ and -, and be at most 40 characters (not a reserved object key)`)
  }
  return id
}

export function checkReason(reason: unknown): string {
  if (typeof reason !== 'string') throw new ActionArgError('reason is required: say why the policy changes')
  const clean = reason.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim()
  if (clean.length < 3 || clean.length > MAX_REASON) throw new ActionArgError(`reason must be 3 to ${MAX_REASON} characters`)
  return clean
}

// -- storage state paths --

export interface PathEnv {
  /** The only directory an agent-set storageStatePath may live in. */
  authDir: string
  /** Directories no auth file may be inside of. */
  forbidden: readonly string[]
  /** Set when the auth directory overlaps one of {@link forbidden}: every agent-set path is refused. */
  authDirProblem?: string
}

/** `realpath` of the deepest existing ancestor, with the not-yet-existing rest appended: resolves symlinks without needing the file. */
function realpathDeep(target: string): string {
  const resolved = path.resolve(target)
  let current = resolved
  const rest: string[] = []
  for (let guard = 0; guard < 64; guard++) {
    try {
      return path.join(fs.realpathSync(current), ...rest.reverse())
    } catch {
      const parent = path.dirname(current)
      if (parent === current) return resolved
      rest.push(path.basename(current))
      current = parent
    }
  }
  return resolved
}

function inside(child: string, parent: string): boolean {
  const normalize = (value: string) => process.platform === 'win32' || process.platform === 'darwin' ? value.toLowerCase() : value
  const c = normalize(child)
  const p = normalize(parent)
  return c === p || c.startsWith(p.endsWith(path.sep) ? p : p + path.sep)
}

/** The absolute path of an agent-set auth state file, or an {@link ActionArgError} saying why not. */
export function checkStorageStatePath(raw: unknown, env: PathEnv, takenByOthers: readonly string[] = []): string {
  const fail = (why: string): never => { throw new ActionArgError(`storageStatePath ${why}`, `The file must be a .json file inside ${env.authDir}.`) }
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 500) return fail('must be a path of 1 to 500 characters')
  if (/[\u0000-\u001f\u007f]/.test(raw)) return fail('must not contain control characters')
  if (!path.isAbsolute(raw)) return fail('must be an absolute path')
  if (raw.split(/[\\/]/).includes('..')) return fail('must not contain ..')
  if (env.authDirProblem) return fail(env.authDirProblem)
  const resolved = path.resolve(raw)
  if (path.extname(resolved).toLowerCase() !== '.json') return fail('must end in .json')
  const realAuth = realpathDeep(env.authDir)
  const real = realpathDeep(resolved)
  if (!inside(real, realAuth) || real === realAuth) return fail(`is outside the auth directory (${env.authDir}); symbolic links are followed`)
  for (const dir of env.forbidden) {
    if (inside(real, realpathDeep(dir))) return fail(`is inside ${dir}, which holds other plugin data`)
  }
  let stat: fs.Stats | undefined
  try { stat = fs.lstatSync(resolved) } catch { stat = undefined }
  if (stat?.isSymbolicLink()) return fail('must not be a symbolic link')
  if (stat && !stat.isFile()) return fail('exists and is not a regular file')
  if (takenByOthers.some(other => inside(realpathDeep(other), real) && inside(real, realpathDeep(other)))) return fail('is already the state file of another profile')
  return resolved
}

/** Whether the auth directory overlaps the directories that hold downloads or screenshots (then no agent path is trusted). */
export function authDirConflict(authDir: string, forbidden: readonly string[]): string | undefined {
  const real = realpathDeep(authDir)
  for (const dir of forbidden) {
    const other = realpathDeep(dir)
    if (inside(real, other) || inside(other, real)) return `the auth directory overlaps ${dir}`
  }
  return undefined
}

// -- usage policy --

/** How each throttle value moves when it gets stricter. */
const STRICTER: Record<keyof typeof USAGE_POLICY_BOUNDS, 'higher' | 'lower'> = {
  minDelayMs: 'higher', maxConcurrency: 'lower', burst: 'lower', maxPagesPerRun: 'lower',
  maxDepth: 'lower', retryLimit: 'lower', backoffBaseMs: 'higher', cooldownMs: 'higher',
}

export function checkUsagePatch(raw: unknown): Partial<UsagePolicy> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ActionArgError('usage policy values must be an object of numbers')
  const patch: Record<string, number> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (value === undefined) continue
    const bounds = (USAGE_POLICY_BOUNDS as Record<string, readonly [number, number]>)[key]
    if (!bounds || !Object.hasOwn(USAGE_POLICY_BOUNDS, key)) throw new ActionArgError(`unknown usage policy key "${key}" (allowed: ${USAGE_POLICY_KEYS.join(', ')})`)
    if (typeof value !== 'number' || !Number.isInteger(value) || value < bounds[0] || value > bounds[1]) {
      throw new ActionArgError(`usagePolicy.${key} must be an integer from ${bounds[0]} to ${bounds[1]}`)
    }
    patch[key] = value
  }
  return patch as Partial<UsagePolicy>
}

// -- model --

/** What an overlay entry may hold for a profile: only the fields that differ from the baseline (all of them for a new profile). */
export interface OverlayProfile {
  allowedDomains?: string[]
  persistState?: boolean
  storageStatePath?: string
}

export type Direction = 'tighten' | 'loosen' | 'none'

export interface AuditEntry {
  revision: number
  at: string
  /** `agent` (an action), `panel` (the settings card's clear button). */
  source: 'agent' | 'panel'
  /** The session that asked, for an agent change. */
  session?: string
  action: string
  reason: string
  direction: Direction
  /** One line per change. */
  changes: string[]
}

export interface PolicyOverlay {
  version: 1
  revision: number
  updatedAt: string
  /** `null` removes a baseline profile. */
  authProfiles: Record<string, OverlayProfile | null>
  usagePolicy: Partial<UsagePolicy>
  audit: AuditEntry[]
}

export interface EffectivePolicy {
  authProfiles: Record<string, AuthProfileConfig>
  usagePolicy: UsagePolicy
}

export interface Baseline {
  authProfiles: Record<string, AuthProfileConfig>
  usagePolicy: UsagePolicy
}

export function emptyOverlay(): PolicyOverlay {
  return { version: 1, revision: 0, updatedAt: new Date(0).toISOString(), authProfiles: {}, usagePolicy: {}, audit: [] }
}

const cloneProfile = (profile: AuthProfileConfig): AuthProfileConfig => ({ storageStatePath: profile.storageStatePath, allowedDomains: [...profile.allowedDomains ?? []], persistState: profile.persistState ?? false })

function nullRecord<T>(): Record<string, T> { return Object.create(null) as Record<string, T> }

/** The baseline with the overlay merged on top. Never mutates its inputs. */
export function mergeOverlay(baseline: Baseline, overlay: PolicyOverlay): EffectivePolicy {
  const profiles = nullRecord<AuthProfileConfig>()
  for (const [id, profile] of Object.entries(baseline.authProfiles)) profiles[id] = cloneProfile(profile)
  for (const [id, entry] of Object.entries(overlay.authProfiles)) {
    if (entry === null) { delete profiles[id]; continue }
    const base = profiles[id]
    profiles[id] = {
      storageStatePath: entry.storageStatePath ?? base?.storageStatePath ?? '',
      allowedDomains: [...entry.allowedDomains ?? base?.allowedDomains ?? []],
      persistState: entry.persistState ?? base?.persistState ?? false,
    }
  }
  return { authProfiles: profiles, usagePolicy: { ...baseline.usagePolicy, ...overlay.usagePolicy } as UsagePolicy }
}

// -- diff and risk --

export interface ProfileDiff {
  id: string
  change: 'added' | 'removed' | 'changed'
  domainsAdded: string[]
  domainsRemoved: string[]
  persistState?: { before: boolean; after: boolean }
  storageStatePath?: { before: string; after: string }
}

export interface PolicyDiff {
  profiles: ProfileDiff[]
  usage: { key: string; before: number; after: number; direction: Direction }[]
  direction: Direction
  /** One human-readable line per change. */
  lines: string[]
}

const sortedBases = (domains: readonly string[]) => new Map(domains.map(domain => [domainBase(domain), domain]))

export function diffPolicy(before: EffectivePolicy, after: EffectivePolicy): PolicyDiff {
  const profiles: ProfileDiff[] = []
  const lines: string[] = []
  let loosen = false
  let tighten = false
  const ids = new Set([...Object.keys(before.authProfiles), ...Object.keys(after.authProfiles)])
  for (const id of [...ids].sort()) {
    const was = before.authProfiles[id]
    const now = after.authProfiles[id]
    if (was && !now) {
      profiles.push({ id, change: 'removed', domainsAdded: [], domainsRemoved: [...was.allowedDomains], })
      lines.push(`remove auth profile ${id} (had: ${was.allowedDomains.join(', ')})`)
      tighten = true
      continue
    }
    if (!was && now) {
      profiles.push({ id, change: 'added', domainsAdded: [...now.allowedDomains], domainsRemoved: [], persistState: { before: false, after: now.persistState ?? false }, storageStatePath: { before: '', after: now.storageStatePath } })
      lines.push(`create auth profile ${id}: domains ${now.allowedDomains.join(', ')}; persistState=${now.persistState ?? false}; state file ${now.storageStatePath}`)
      loosen = true
      continue
    }
    if (!was || !now) continue
    const wasBases = sortedBases(was.allowedDomains)
    const nowBases = sortedBases(now.allowedDomains)
    const added = [...nowBases].filter(([base]) => !wasBases.has(base)).map(([, entry]) => entry)
    const removed = [...wasBases].filter(([base]) => !nowBases.has(base)).map(([, entry]) => entry)
    const diff: ProfileDiff = { id, change: 'changed', domainsAdded: added, domainsRemoved: removed }
    if ((was.persistState ?? false) !== (now.persistState ?? false)) diff.persistState = { before: was.persistState ?? false, after: now.persistState ?? false }
    if (was.storageStatePath !== now.storageStatePath) diff.storageStatePath = { before: was.storageStatePath, after: now.storageStatePath }
    if (added.length || removed.length || diff.persistState || diff.storageStatePath) {
      profiles.push(diff)
      if (added.length) { lines.push(`profile ${id}: allow ${added.join(', ')}`); loosen = true }
      if (removed.length) { lines.push(`profile ${id}: stop allowing ${removed.join(', ')}`); tighten = true }
      if (diff.persistState) {
        lines.push(`profile ${id}: persistState ${diff.persistState.before} -> ${diff.persistState.after}`)
        if (diff.persistState.after) loosen = true; else tighten = true
      }
      if (diff.storageStatePath) { lines.push(`profile ${id}: state file ${diff.storageStatePath.before} -> ${diff.storageStatePath.after}`); loosen = true }
    }
  }
  const usage: PolicyDiff['usage'] = []
  for (const key of USAGE_POLICY_KEYS) {
    const was = before.usagePolicy[key]!
    const now = after.usagePolicy[key]!
    if (was === now) continue
    const stricter = STRICTER[key] === 'higher' ? now > was : now < was
    usage.push({ key, before: was, after: now, direction: stricter ? 'tighten' : 'loosen' })
    lines.push(`usagePolicy.${key}: ${was} -> ${now} (${stricter ? 'stricter' : 'looser'})`)
    if (stricter) tighten = true; else loosen = true
  }
  return { profiles, usage, direction: loosen ? 'loosen' : tighten ? 'tighten' : 'none', lines }
}

// -- store --

export interface PolicyStoreOptions {
  /** `$DSH_HOME/data/browser/policy-overlay.json`. */
  file: string
  authDir: string
  snapshotDir: string
  downloadDir: string
  allowPrivateHosts: boolean
  baseline: Baseline
}

export type PolicyChange =
  | { kind: 'setAuthProfile'; id: string; allowedDomains?: unknown; persistState?: unknown; storageStatePath?: unknown }
  | { kind: 'removeAuthProfile'; id: string }
  | { kind: 'setUsagePolicy'; values: unknown }
  | { kind: 'reset'; scope: 'all' | 'usagePolicy' | 'authProfile'; id?: string }

export interface ChangeMeta {
  source: 'agent' | 'panel'
  session?: string
  reason: string
  action: string
  /** When given, the change only applies if the overlay is still at this revision. */
  expectedRevision?: number
}

export interface PlannedChange {
  before: EffectivePolicy
  after: EffectivePolicy
  overlay: PolicyOverlay
  diff: PolicyDiff
}

export interface AppliedChange extends PlannedChange {
  revision: number
  audit: AuditEntry
}

export class PolicyConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PolicyConflictError'
  }
}

export function checksumOf(overlay: PolicyOverlay): string {
  const canonical = JSON.stringify({ version: overlay.version, revision: overlay.revision, updatedAt: overlay.updatedAt, authProfiles: overlay.authProfiles, usagePolicy: overlay.usagePolicy, audit: overlay.audit })
  return crypto.createHash('sha256').update(canonical).digest('hex')
}

export class PolicyOverlayStore {
  private overlay: PolicyOverlay = emptyOverlay()
  private signature = ''
  private problem: string | undefined
  private readonly pathEnv: PathEnv

  constructor(private readonly options: PolicyStoreOptions) {
    const forbidden = [options.snapshotDir, options.downloadDir]
    const conflict = authDirConflict(options.authDir, forbidden)
    this.pathEnv = { authDir: options.authDir, forbidden, ...conflict ? { authDirProblem: conflict } : {} }
    this.reload(true)
  }

  get file(): string { return this.options.file }
  get authDir(): string { return this.options.authDir }
  get allowPrivateHosts(): boolean { return this.options.allowPrivateHosts }
  get baseline(): Baseline { return this.options.baseline }

  /** Why the overlay file was ignored, if it was. */
  get warning(): string | undefined { return this.problem }

  current(): PolicyOverlay { return this.overlay }

  effective(): EffectivePolicy { return mergeOverlay(this.options.baseline, this.overlay) }

  private stat(): string {
    try {
      const stat = fs.statSync(this.options.file)
      return `${stat.mtimeMs}:${stat.size}`
    } catch { return 'missing' }
  }

  /** Re-read the file when it changed on disk. Returns whether the effective policy may have changed. */
  refresh(): boolean {
    return this.stat() === this.signature ? false : this.reload(false)
  }

  private reload(initial: boolean): boolean {
    const signature = this.stat()
    this.signature = signature
    const previous = JSON.stringify(this.overlay)
    const previousProblem = this.problem
    this.problem = undefined
    if (signature === 'missing') {
      this.overlay = emptyOverlay()
    } else {
      try {
        this.overlay = this.parse(fs.readFileSync(this.options.file, 'utf8'))
      } catch (error) {
        // Not fail-open: the baseline applies and the problem is visible. The file is left in place for inspection.
        this.overlay = emptyOverlay()
        this.problem = `policy overlay ${this.options.file} was ignored (the baseline configuration applies): ${String(error instanceof Error ? error.message : error).slice(0, 300)}. Clear it with runtime.reset_policy or the settings card.`
      }
    }
    return initial || previous !== JSON.stringify(this.overlay) || previousProblem !== this.problem
  }

  /** Strict parse: unknown keys, wrong types, a failed checksum or any value the validators refuse reject the whole file. */
  private parse(text: string): PolicyOverlay {
    let raw: any
    try { raw = JSON.parse(text) } catch { throw new Error('the file is not valid JSON') }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('the file is not an object')
    const allowed = new Set(['version', 'revision', 'updatedAt', 'authProfiles', 'usagePolicy', 'audit', 'checksum'])
    for (const key of Object.keys(raw)) if (!allowed.has(key)) throw new Error(`unknown key "${key}"`)
    if (raw.version !== 1) throw new Error('unsupported version')
    if (!Number.isInteger(raw.revision) || raw.revision < 0) throw new Error('bad revision')
    if (typeof raw.updatedAt !== 'string') throw new Error('bad updatedAt')
    if (!raw.authProfiles || typeof raw.authProfiles !== 'object' || Array.isArray(raw.authProfiles)) throw new Error('bad authProfiles')
    if (!raw.usagePolicy || typeof raw.usagePolicy !== 'object' || Array.isArray(raw.usagePolicy)) throw new Error('bad usagePolicy')
    if (!Array.isArray(raw.audit) || raw.audit.length > MAX_AUDIT_ENTRIES) throw new Error('bad audit')
    const overlay: PolicyOverlay = { version: 1, revision: raw.revision, updatedAt: raw.updatedAt, authProfiles: nullRecord<OverlayProfile | null>(), usagePolicy: {}, audit: raw.audit as AuditEntry[] }
    if (typeof raw.checksum !== 'string' || raw.checksum !== checksumOf({ ...overlay, authProfiles: raw.authProfiles, usagePolicy: raw.usagePolicy })) throw new Error('the checksum does not match: the file was edited outside the plugin')
    for (const entry of raw.audit) {
      if (!entry || typeof entry !== 'object' || typeof entry.action !== 'string' || typeof entry.reason !== 'string' || !Array.isArray(entry.changes)) throw new Error('bad audit entry')
    }
    overlay.usagePolicy = checkUsagePatch(raw.usagePolicy)
    if (Object.keys(raw.authProfiles).length > MAX_PROFILES) throw new Error('too many profiles')
    const env: DomainEnv = { allowPrivateHosts: this.options.allowPrivateHosts }
    for (const [id, entry] of Object.entries(raw.authProfiles as Record<string, any>)) {
      checkProfileId(id)
      if (entry === null) { overlay.authProfiles[id] = null; continue }
      if (typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`bad entry for ${id}`)
      for (const key of Object.keys(entry)) if (!['allowedDomains', 'persistState', 'storageStatePath'].includes(key)) throw new Error(`unknown key "${key}" in ${id}`)
      const clean: OverlayProfile = {}
      if (entry.allowedDomains !== undefined) {
        const normalized = normalizeAllowedDomains(entry.allowedDomains, env)
        if (JSON.stringify(normalized) !== JSON.stringify(entry.allowedDomains)) throw new Error(`domains of ${id} are not in normalized form`)
        clean.allowedDomains = normalized
      }
      if (entry.persistState !== undefined) {
        if (typeof entry.persistState !== 'boolean') throw new Error(`persistState of ${id} is not a boolean`)
        clean.persistState = entry.persistState
      }
      if (entry.storageStatePath !== undefined) {
        const baselinePath = this.options.baseline.authProfiles[id]?.storageStatePath
        // A path equal to the baseline's was not chosen by the overlay; any other must be a valid auth-directory file.
        clean.storageStatePath = entry.storageStatePath === baselinePath ? entry.storageStatePath : checkStorageStatePath(entry.storageStatePath, this.pathEnv)
      }
      overlay.authProfiles[id] = clean
    }
    for (const [id, entry] of Object.entries(overlay.authProfiles)) {
      if (entry && !this.options.baseline.authProfiles[id] && (!entry.allowedDomains || !entry.storageStatePath)) throw new Error(`new profile ${id} is incomplete`)
    }
    return overlay
  }

  /** Compute a change without writing anything. Throws {@link ActionArgError} for an invalid change. */
  plan(change: PolicyChange): PlannedChange {
    if (this.problem && change.kind !== 'reset') throw new ActionArgError('the policy overlay file is unreadable and is being ignored; clear it with runtime.reset_policy before changing the policy', this.problem)
    const before = this.effective()
    const next: PolicyOverlay = { ...this.overlay, authProfiles: Object.assign(nullRecord<OverlayProfile | null>(), this.overlay.authProfiles), usagePolicy: { ...this.overlay.usagePolicy } }
    const env: DomainEnv = { allowPrivateHosts: this.options.allowPrivateHosts }
    const baselineProfiles = this.options.baseline.authProfiles
    switch (change.kind) {
      case 'setAuthProfile': {
        const id = checkProfileId(change.id)
        const current = before.authProfiles[id]
        if (!current && Object.keys(before.authProfiles).length >= MAX_PROFILES) throw new ActionArgError(`at most ${MAX_PROFILES} auth profiles are allowed`)
        const known = ['allowedDomains', 'persistState', 'storageStatePath'].filter(key => (change as Record<string, unknown>)[key] !== undefined)
        if (!current && change.allowedDomains === undefined) throw new ActionArgError(`creating profile ${id} requires allowedDomains`)
        if (known.length === 0) throw new ActionArgError('give at least one of allowedDomains, persistState, storageStatePath')
        const domains = change.allowedDomains !== undefined ? normalizeAllowedDomains(change.allowedDomains, env) : current!.allowedDomains
        let persist = current?.persistState ?? false
        if (change.persistState !== undefined) {
          if (typeof change.persistState !== 'boolean') throw new ActionArgError('persistState must be true or false')
          persist = change.persistState
        }
        let storage = current?.storageStatePath ?? path.join(this.options.authDir, `${id}.json`)
        const others = Object.entries(before.authProfiles).filter(([other]) => other !== id).map(([, profile]) => profile.storageStatePath)
        if (change.storageStatePath !== undefined) storage = checkStorageStatePath(change.storageStatePath, this.pathEnv, others)
        else if (!current) storage = checkStorageStatePath(storage, this.pathEnv, others)
        // A profile that only reads its state needs the file to exist; the agent cannot create it, so say so now.
        if (!persist && !fs.existsSync(storage)) {
          throw new ActionArgError(`the state file ${storage} does not exist and persistState is false, so the profile could never load a login state`, 'Ask the user to place the state file there, or set persistState=true to have it created from the session after login.')
        }
        // Store only what differs from the baseline (everything for a profile the baseline does not have).
        const base = baselineProfiles[id]
        const entry: OverlayProfile = {}
        if (!base || JSON.stringify(domains.map(domainBase).sort()) !== JSON.stringify(base.allowedDomains.map(domainBase).sort()) || JSON.stringify(domains) !== JSON.stringify(base.allowedDomains)) entry.allowedDomains = domains
        if (!base || persist !== (base.persistState ?? false)) entry.persistState = persist
        if (!base || storage !== base.storageStatePath) entry.storageStatePath = storage
        if (base && Object.keys(entry).length === 0) delete next.authProfiles[id]
        else next.authProfiles[id] = entry
        break
      }
      case 'removeAuthProfile': {
        const id = checkProfileId(change.id)
        if (!before.authProfiles[id]) throw new ActionArgError(`unknown auth profile: ${id}`)
        if (baselineProfiles[id]) next.authProfiles[id] = null
        else delete next.authProfiles[id]
        break
      }
      case 'setUsagePolicy': {
        const patch = checkUsagePatch(change.values)
        if (Object.keys(patch).length === 0) throw new ActionArgError(`give at least one of: ${USAGE_POLICY_KEYS.join(', ')}`)
        for (const [key, value] of Object.entries(patch)) {
          if (value === (this.options.baseline.usagePolicy as Record<string, number>)[key]) delete (next.usagePolicy as Record<string, number>)[key]
          else (next.usagePolicy as Record<string, number>)[key] = value as number
        }
        break
      }
      case 'reset': {
        if (change.scope === 'all') { next.authProfiles = nullRecord<OverlayProfile | null>(); next.usagePolicy = {} }
        else if (change.scope === 'usagePolicy') next.usagePolicy = {}
        else {
          const id = checkProfileId(change.id)
          if (!Object.hasOwn(next.authProfiles, id)) throw new ActionArgError(`profile ${id} has no overlay to reset`)
          delete next.authProfiles[id]
        }
        break
      }
    }
    const after = mergeOverlay(this.options.baseline, next)
    return { before, after, overlay: next, diff: diffPolicy(before, after) }
  }

  /** Plan and write a change: re-reads the file first, checks the revision, writes atomically (0600) and appends the audit entry. */
  apply(change: PolicyChange, meta: ChangeMeta): AppliedChange {
    // A reset must work on a corrupt file; anything else was refused by plan() above.
    this.refresh()
    if (this.problem && change.kind === 'reset') this.quarantine()
    if (meta.expectedRevision !== undefined && meta.expectedRevision !== this.overlay.revision) {
      throw new PolicyConflictError(`the policy overlay is at revision ${this.overlay.revision}, not ${meta.expectedRevision}: it changed since it was read; call inspect.policy and decide again`)
    }
    const planned = this.plan(change)
    const audit: AuditEntry = {
      revision: this.overlay.revision + 1,
      at: new Date().toISOString(),
      source: meta.source,
      ...meta.session ? { session: meta.session } : {},
      action: meta.action,
      reason: checkReason(meta.reason),
      direction: planned.diff.direction,
      changes: planned.diff.lines.slice(0, 20),
    }
    const written: PolicyOverlay = {
      ...planned.overlay,
      revision: audit.revision,
      updatedAt: audit.at,
      audit: [...this.overlay.audit, audit].slice(-MAX_AUDIT_ENTRIES),
    }
    fs.mkdirSync(path.dirname(this.options.file), { recursive: true, mode: 0o700 })
    const temporary = `${this.options.file}.tmp-${crypto.randomUUID().slice(0, 8)}`
    fs.writeFileSync(temporary, JSON.stringify({ ...written, checksum: checksumOf(written) }, null, 2), { encoding: 'utf8', mode: 0o600 })
    fs.renameSync(temporary, this.options.file)
    this.overlay = written
    this.signature = this.stat()
    this.problem = undefined
    return { ...planned, overlay: written, revision: written.revision, audit }
  }

  /** Move an unreadable file aside (kept for inspection) so a fresh overlay can start. */
  private quarantine(): void {
    try { fs.renameSync(this.options.file, `${this.options.file}.corrupt-${Date.now()}`) } catch { /* nothing to move */ }
    this.overlay = emptyOverlay()
    this.problem = undefined
    this.signature = this.stat()
  }
}
