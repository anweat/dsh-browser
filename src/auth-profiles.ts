export interface AuthProfileConfig {
  storageStatePath: string
  allowedDomains: string[]
  /** Persist cookies/localStorage back after a transient context closes. Defaults to false. */
  persistState?: boolean
}

export interface ResolvedAuthProfile extends AuthProfileConfig {
  id: string
  persistState: boolean
}

export function hostAllowed(hostname: string, domains: readonly string[]): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  return domains.some(value => {
    const domain = value.toLowerCase().trim().replace(/^\*\./, '').replace(/\.$/, '')
    return domain.length > 0 && (host === domain || host.endsWith('.' + domain))
  })
}

export class AuthProfileStore {
  constructor(private readonly profiles: Record<string, AuthProfileConfig> = {}) {}

  resolve(id: string, targetUrl: string): ResolvedAuthProfile {
    const profile = this.profiles[id]
    if (!profile) throw new Error('unknown auth profile: ' + id)
    const url = new URL(targetUrl)
    if (!hostAllowed(url.hostname, profile.allowedDomains ?? [])) throw new Error('auth profile ' + id + ' is not allowed for ' + url.hostname)
    if (!profile.storageStatePath?.trim()) throw new Error('auth profile ' + id + ' has no storageStatePath')
    const persistState = profile.persistState ?? false
    if (!fs.existsSync(profile.storageStatePath)) {
      if (!persistState) throw new Error('auth profile ' + id + ' storageState file does not exist: ' + profile.storageStatePath)
    } else if (!fs.statSync(profile.storageStatePath).isFile()) {
      throw new Error('auth profile ' + id + ' storageState path is not a file: ' + profile.storageStatePath)
    }
    return { id, ...profile, persistState }
  }

  list(): { id: string; allowedDomains: string[]; persistState: boolean }[] {
    return Object.entries(this.profiles).sort(([a], [b]) => a.localeCompare(b)).map(([id, profile]) => ({ id, allowedDomains: [...(profile.allowedDomains ?? [])], persistState: profile.persistState ?? false }))
  }
}
import fs from 'node:fs'
