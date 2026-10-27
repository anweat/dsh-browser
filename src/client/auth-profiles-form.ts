/**
 * Pure helpers of the login-profile list and its dialog: reading the staged `authProfiles` JSON, the rules for a new
 * profile's name and for a domain, and the path a new profile gets. Nothing here touches the Host or the DOM.
 * @module dsh-browser/client/auth-profiles-form
 */

import { AUTH_PROFILE_ID } from '../policy-keys.ts'

/** One login profile as the configuration holds it. */
export interface AuthProfileEntry {
  storageStatePath: string
  allowedDomains: string[]
  persistState: boolean
}

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)

/** The profiles in a staged `authProfiles` text; entries that are not profiles are left out, and unparsable text is no profiles. */
export function parseProfiles(text: string): Record<string, AuthProfileEntry> {
  if (text.trim() === '') return {}
  let root: unknown
  try { root = JSON.parse(text) } catch { return {} }
  if (!isRecord(root)) return {}
  const out: Record<string, AuthProfileEntry> = {}
  for (const [id, entry] of Object.entries(root)) {
    if (!isRecord(entry)) continue
    out[id] = {
      storageStatePath: typeof entry.storageStatePath === 'string' ? entry.storageStatePath : '',
      allowedDomains: Array.isArray(entry.allowedDomains) ? entry.allowedDomains.filter((domain): domain is string => typeof domain === 'string') : [],
      persistState: entry.persistState === true,
    }
  }
  return out
}

/** Whether a value is a map of well-formed profiles: what a save may write for `authProfiles`. */
export function validAuthProfiles(value: Record<string, unknown>): boolean {
  return Object.entries(value).every(([id, entry]) => id !== '' && isRecord(entry)
    && typeof entry.storageStatePath === 'string' && entry.storageStatePath.trim() !== ''
    && (entry.allowedDomains === undefined || (Array.isArray(entry.allowedDomains) && entry.allowedDomains.every(domain => typeof domain === 'string' && domain.trim() !== '')))
    && (entry.persistState === undefined || typeof entry.persistState === 'boolean'))
}

/** Why a name is refused for a NEW profile: not a usable name, or taken. */
export function idProblem(id: string, existing: readonly string[]): 'authIdInvalid' | 'authIdExists' | undefined {
  if (!AUTH_PROFILE_ID.test(id) || id in Object.prototype) return 'authIdInvalid'
  return existing.includes(id) ? 'authIdExists' : undefined
}

/** Why a domain entry is refused: a host name only, optionally with a leading `*.`; no scheme, path, port or whitespace. */
export function domainProblem(domain: string): 'authDomainInvalid' | undefined {
  const text = domain.trim()
  if (text === '' || text.length > 253 || /[\s/\\:@?#]/.test(text)) return 'authDomainInvalid'
  const host = text.replace(/^\*\./, '')
  return /^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)*$/.test(host) ? undefined : 'authDomainInvalid'
}

/** Whether a name is one the policy overlay refuses for agents unless private hosts are allowed (a note for the person; their own config may list it). */
export function isPrivateName(domain: string): boolean {
  const host = domain.trim().toLowerCase().replace(/^\*\./, '')
  return host === 'localhost' || /(^|\.)(local|internal|lan|home\.arpa|intranet|corp|localdomain|private|home|localhost)$/.test(host) || /^(\d{1,3}\.){3}\d{1,3}$/.test(host)
}

/** The state-file path a new profile gets: `<login-state directory>/<name>.json`, with the directory's own separator. */
export function profilePathFor(authDir: string, id: string): string {
  const separator = authDir.includes('\\') && !authDir.includes('/') ? '\\' : '/'
  return `${authDir.replace(/[\\/]+$/, '')}${separator}${id}.json`
}
