/**
 * Tampermonkey-compatible metadata validation and bounded userscript execution.
 * Only `@grant none` is supported; GM_* APIs are intentionally not emulated.
 * @module dsh-browser/scripts
 */

import crypto from 'node:crypto'

export interface UserscriptMetadata {
  name: string
  description?: string
  matches: string[]
  excludes: string[]
  grants: string[]
}
export interface UserscriptValidation {
  valid: boolean
  sha256: string
  bytes: number
  metadata: UserscriptMetadata
  capabilities: string[]
  errors: string[]
  warnings: string[]
}

export interface BuiltinScript {
  id: string
  name: string
  description: string
  source: string
}

const header = (name: string, description: string): string => `// ==UserScript==
// @name ${name}
// @description ${description}
// @match *://*/*
// @grant none
// ==/UserScript==`

export const BUILTIN_SCRIPTS: readonly BuiltinScript[] = [
  {
    id: 'article-clean',
    name: 'Article Clean Reader',
    description: 'Extract title, canonical URL, headings, and readable article text.',
    source: `${header('Article Clean Reader', 'Extract readable article content without mutating the page.')}
const root = document.querySelector('article, main, [role="main"]') || document.body
return {
  title: document.title,
  canonicalUrl: document.querySelector('link[rel="canonical"]')?.href || location.href,
  headings: [...root.querySelectorAll('h1,h2,h3')].slice(0, 100).map(el => (el.textContent || '').trim()).filter(Boolean),
  text: (root.innerText || root.textContent || '').trim().slice(0, 50000),
}`,
  },
  {
    id: 'links',
    name: 'Link Inventory',
    description: 'Extract up to 200 visible links with absolute URLs.',
    source: `${header('Link Inventory', 'Extract visible links without clicking them.')}
return [...document.querySelectorAll('a[href]')].slice(0, 200).map(a => ({
  text: (a.textContent || '').trim().slice(0, 500),
  url: a.href,
})).filter(item => item.url)`,
  },
  {
    id: 'jsonld',
    name: 'JSON-LD Extractor',
    description: 'Read structured JSON-LD blocks from the page.',
    source: `${header('JSON-LD Extractor', 'Extract JSON-LD structured data.')}
return [...document.querySelectorAll('script[type="application/ld+json"]')].slice(0, 20).map(node => {
  try { return JSON.parse(node.textContent || 'null') } catch { return { invalid: true, text: (node.textContent || '').slice(0, 2000) } }
})`,
  },
  {
    id: 'forms',
    name: 'Form Structure',
    description: 'Describe forms and controls without returning current values.',
    source: `${header('Form Structure', 'Describe form controls without exposing entered values.')}
return [...document.forms].slice(0, 30).map((form, formIndex) => ({
  form: formIndex,
  action: form.action,
  method: form.method,
  controls: [...form.elements].slice(0, 100).map(el => ({
    tag: el.tagName.toLowerCase(), type: el.type || '', name: el.name || '', id: el.id || '', required: !!el.required,
  })),
}))`,
  },
]

function metadataOf(source: string): UserscriptMetadata & { requires: string[] } {
  const start = source.indexOf('// ==UserScript==')
  const end = source.indexOf('// ==/UserScript==')
  const rows = start >= 0 && end > start ? source.slice(start, end).split(/\r?\n/) : []
  const values = new Map<string, string[]>()
  for (const row of rows) {
    const match = row.match(/^\s*\/\/\s*@([\w-]+)\s*(.*?)\s*$/)
    if (!match) continue
    const key = match[1].toLowerCase()
    const list = values.get(key) ?? []
    list.push(match[2])
    values.set(key, list)
  }
  return {
    name: values.get('name')?.[0] || 'External userscript',
    ...values.get('description')?.[0] ? { description: values.get('description')![0] } : {},
    matches: values.get('match') ?? [],
    excludes: values.get('exclude-match') ?? [],
    grants: values.get('grant') ?? [],
    requires: values.get('require') ?? [],
  }
}

function globPath(pattern: string): RegExp {
  return new RegExp('^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$')
}

export function matchUserscriptPattern(pattern: string, targetUrl: string): boolean {
  const parsed = pattern.match(/^(\*|https?|file|ftp):\/\/([^/]+)(\/.*)$/i)
  if (!parsed) return false
  const url = new URL(targetUrl)
  if (parsed[1] === '*' ? !/^https?:$/.test(url.protocol) : url.protocol !== parsed[1].toLowerCase() + ':') return false
  const wantedHost = parsed[2].toLowerCase()
  const host = url.hostname.toLowerCase()
  const hostMatches = wantedHost === '*'
    || (wantedHost.startsWith('*.') ? host === wantedHost.slice(2) || host.endsWith('.' + wantedHost.slice(2)) : host === wantedHost)
  return hostMatches && globPath(parsed[3]).test(url.pathname + url.search + url.hash)
}

function capabilitiesOf(source: string): string[] {
  const capabilities = new Set<string>(['dom-read'])
  if (/\b(fetch|XMLHttpRequest|WebSocket|sendBeacon)\b/.test(source)) capabilities.add('network')
  if (/\b(localStorage|sessionStorage|indexedDB|document\.cookie)\b/.test(source)) capabilities.add('storage')
  if (/\.click\s*\(|dispatchEvent\s*\(|\.submit\s*\(|\blocation\s*=|history\.(pushState|replaceState)/.test(source)) capabilities.add('interaction')
  if (/\b(remove|append|prepend|replaceWith|insertAdjacentHTML)\s*\(|\.innerHTML\s*=|\.textContent\s*=/.test(source)) capabilities.add('dom-write')
  return [...capabilities]
}

export function validateUserscript(source: string, targetUrl?: string): UserscriptValidation {
  const bytes = Buffer.byteLength(source, 'utf8')
  const sha256 = crypto.createHash('sha256').update(source, 'utf8').digest('hex')
  const parsed = metadataOf(source)
  const errors: string[] = []
  const warnings: string[] = []
  if (bytes < 1 || bytes > 64 * 1024) errors.push('source must contain between 1 and 65536 UTF-8 bytes')
  if (!source.includes('// ==UserScript==') || !source.includes('// ==/UserScript==')) errors.push('userscript metadata block is required')
  if (parsed.matches.length < 1) errors.push('at least one @match is required')
  if (parsed.matches.some(pattern => !/^(\*|https?):\/\//i.test(pattern))) errors.push('only HTTP(S) @match patterns are supported')
  if (parsed.requires.length > 0) errors.push('@require is not supported; external code must be supplied inline for approval')
  const invalidGrants = parsed.grants.filter(grant => grant !== 'none')
  if (invalidGrants.length > 0) errors.push('unsupported @grant values: ' + invalidGrants.join(', '))
  if (parsed.grants.length === 0) warnings.push('missing @grant; execution still provides no GM_* APIs')
  if (targetUrl !== undefined) {
    let matched = false
    try {
      matched = parsed.matches.some(pattern => matchUserscriptPattern(pattern, targetUrl))
        && !parsed.excludes.some(pattern => matchUserscriptPattern(pattern, targetUrl))
    } catch { errors.push('target URL is invalid') }
    if (!matched) errors.push('target URL is outside the userscript @match scope')
  }
  return {
    valid: errors.length === 0,
    sha256,
    bytes,
    metadata: {
      name: parsed.name,
      ...parsed.description ? { description: parsed.description } : {},
      matches: parsed.matches,
      excludes: parsed.excludes,
      grants: parsed.grants,
    },
    capabilities: capabilitiesOf(source),
    errors,
    warnings,
  }
}

export function builtinScript(id: string): BuiltinScript {
  const script = BUILTIN_SCRIPTS.find(candidate => candidate.id === id)
  if (!script) throw new Error('unknown built-in script: ' + id)
  return script
}

export async function executeUserscript(page: any, source: string, maxResultChars = 100_000): Promise<{ resultJson: string; truncated: boolean }> {
  const result = await page.evaluate(`(async () => {\n${source}\n})()`)
  let resultJson: string
  try { resultJson = JSON.stringify(result ?? null) }
  catch { resultJson = JSON.stringify({ unserializable: true, text: String(result) }) }
  const truncated = resultJson.length > maxResultChars
  if (truncated) resultJson = resultJson.slice(0, maxResultChars) + '…'
  return { resultJson, truncated }
}
