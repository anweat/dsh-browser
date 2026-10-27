/**
 * Download saving: file-name rules, collision-free placement inside `downloadDir`, and size-capped streaming.
 *
 * Everything that decides where a byte lands lives here, apart from the browser, so the rules are testable
 * on their own: a name is reduced to a plain file name, a file never overwrites another, and the only
 * directory a file can end up in is the configured one.
 * @module dsh-browser/downloads
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { ActionArgError } from './actions/types.ts'

/** How many download records a session keeps in memory (oldest dropped first). */
export const DOWNLOAD_HISTORY_LIMIT = 50

/** What `inspect.downloads` reports for one download. The file itself is on disk; this record only lives in memory. */
export interface DownloadRecord {
  /** `d1`, `d2`, ... within the session. */
  id: string
  /** The URL the download came from, with credential-looking query parameters masked. */
  url: string
  /** `saved`, or `failed` (nothing is left on disk for a failed one). */
  status: 'saved' | 'failed'
  /** `request`: fetched by `target.download` with the session's cookies. `browser`: a download event of a page (navigation or click). */
  source: 'request' | 'browser'
  /** The name the server or page suggested. */
  suggestedFilename: string
  /** Absolute path of the saved file (saved only). */
  path?: string
  bytes?: number
  sha256?: string
  /** Why it failed (failed only). */
  error?: string
  timestamp: string
}

/** A download was cut because it passed `downloadMaxBytes`. */
export class DownloadLimitError extends Error {
  constructor(readonly maxBytes: number) {
    super(`the download is larger than downloadMaxBytes (${maxBytes} bytes) ; the transfer was stopped and nothing was saved`)
    this.name = 'DownloadLimitError'
  }
}

// Control characters, the bidirectional overrides that make "txt.exe" read as "exe.txt", and line separators.
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g
// What Windows refuses in a name; refused everywhere so a file is portable.
const WINDOWS_INVALID = /[<>:"|?*]/
const WINDOWS_INVALID_ALL = /[<>:"|?*]/g
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i
const MAX_NAME_CHARS = 180

function limitLength(name: string): string {
  if (name.length <= MAX_NAME_CHARS) return name
  const extension = path.extname(name)
  const keep = extension.length > 0 && extension.length <= 20 ? extension : ''
  return name.slice(0, MAX_NAME_CHARS - keep.length) + keep
}

/**
 * Reduce a file name to a plain, portable one.
 *
 * `strict` is for a name the caller chose (`target.download` `filename`): anything that is not already a plain
 * name is refused with INVALID_ARGS, so a path or a traversal never turns into a different file silently.
 * Lenient is for a name a server or page suggested: only the last path segment is kept and unusable characters
 * are replaced. Control characters are stripped in both. Returns '' when nothing usable is left (lenient only).
 */
export function sanitizeDownloadName(raw: string, strict: boolean): string {
  const fail = (message: string): never => { throw new ActionArgError(`filename ${message}`, 'Pass a plain file name such as report.pdf; the directory is the downloadDir configuration.') }
  let name = String(raw).replace(INVISIBLE, '')
  if (strict && /[\\/]/.test(name)) fail('must be a plain file name, not a path (no / or \\)')
  if (!strict) name = name.split(/[\\/]/).pop() ?? ''
  if (strict && WINDOWS_INVALID.test(name)) fail('must not contain any of < > : " | ? *')
  name = name.replace(WINDOWS_INVALID_ALL, '_')
  // Trailing dots and spaces are dropped by Windows, so "a.pdf." and "a.pdf" would otherwise be two names for one file.
  name = name.trim().replace(/[. ]+$/, '')
  if (!name || name === '.' || name === '..' || /^\.+$/.test(name)) {
    if (strict) fail('must not be empty, "." or ".."')
    return ''
  }
  if (WINDOWS_RESERVED.test(name.split('.')[0]!)) {
    if (strict) fail(`"${name}" is a reserved device name`)
    name = '_' + name
  }
  return limitLength(name)
}

/** The name a download is saved under: the caller's (strict), else what the server suggested, else the URL's last segment. */
export function resolveDownloadFilename(input: { requested?: string; suggested?: string; url?: string }): string {
  if (input.requested !== undefined) return sanitizeDownloadName(input.requested, true)
  return sanitizeDownloadName(input.suggested ?? '', false)
    || sanitizeDownloadName(downloadNameFromUrl(input.url ?? ''), false)
    || 'download'
}

/** The last path segment of a URL, percent-decoded; '' when there is none. */
export function downloadNameFromUrl(url: string): string {
  try {
    const last = new URL(url).pathname.split('/').filter(Boolean).pop() ?? ''
    return decodeURIComponent(last)
  } catch {
    return ''
  }
}

/** The file name of a Content-Disposition header (`filename*=UTF-8''...` first, then `filename=`); '' when absent. */
export function contentDispositionFilename(header: string | undefined): string {
  if (!header) return ''
  const extended = /filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i.exec(header)
  if (extended) {
    try { return decodeURIComponent(extended[2]!.trim().replace(/^"|"$/g, '')) } catch { /* fall through to the plain form */ }
  }
  const quoted = /filename\s*=\s*"((?:[^"\\]|\\.)*)"/i.exec(header)
  if (quoted) return quoted[1]!.replace(/\\(.)/g, '$1')
  const bare = /filename\s*=\s*([^;]+)/i.exec(header)
  return bare ? bare[1]!.trim() : ''
}

/**
 * Move a finished temporary file to its final name inside `dir`, never overwriting: a taken name gets
 * `-1`, `-2`, ... before the extension. `name` must already be a plain file name (see {@link sanitizeDownloadName});
 * this checks it again, because it is the last line before bytes become a path. Returns the absolute path.
 */
export function claimDownloadPath(dir: string, name: string, temporary: string): string {
  const root = path.resolve(dir)
  if (name !== path.basename(name) || name === '' || name === '.' || name === '..' || /[\\/]/.test(name)) {
    throw new Error(`refusing to save outside the download directory: ${JSON.stringify(name)}`)
  }
  const extension = path.extname(name)
  const stem = extension ? name.slice(0, -extension.length) : name
  for (let attempt = 0; attempt < 10_000; attempt++) {
    const candidate = path.join(root, attempt === 0 ? name : `${stem}-${attempt}${extension}`)
    if (path.dirname(candidate) !== root) throw new Error(`refusing to save outside the download directory: ${JSON.stringify(name)}`)
    try {
      // A hard link either takes the name or fails: it is the one atomic "create unless it exists".
      fs.linkSync(temporary, candidate)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'EEXIST') continue
      // File systems without hard links: an exclusive copy gives the same guarantee.
      try {
        fs.copyFileSync(temporary, candidate, fs.constants.COPYFILE_EXCL)
      } catch (copyError) {
        if ((copyError as NodeJS.ErrnoException).code === 'EEXIST') continue
        throw copyError
      }
    }
    fs.unlinkSync(temporary)
    return candidate
  }
  throw new Error(`could not find a free file name for ${JSON.stringify(name)} in the download directory`)
}

/** A fresh temporary file path inside `dir` (dot-prefixed, so a half-written file is not mistaken for a result). */
export function temporaryDownloadPath(dir: string): string {
  return path.join(path.resolve(dir), `.part-${crypto.randomUUID().slice(0, 12)}`)
}

/**
 * Write a stream to `file`, counting bytes and hashing as they pass. Past `maxBytes` the source is destroyed
 * and {@link DownloadLimitError} is thrown, so the caller deletes the partial file.
 */
export async function streamToFile(source: NodeJS.ReadableStream & { destroy?: (error?: Error) => void }, file: string, maxBytes: number): Promise<{ bytes: number; sha256: string }> {
  const hash = crypto.createHash('sha256')
  const handle = await fs.promises.open(file, 'wx')
  let bytes = 0
  try {
    for await (const chunk of source as AsyncIterable<Buffer | string>) {
      const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
      bytes += buffer.length
      if (bytes > maxBytes) {
        source.destroy?.()
        throw new DownloadLimitError(maxBytes)
      }
      hash.update(buffer)
      await handle.write(buffer)
    }
  } finally {
    await handle.close()
  }
  return { bytes, sha256: hash.digest('hex') }
}

/** Write an in-memory body to `file` with the same result shape as {@link streamToFile}. */
export function writeBufferToFile(body: Buffer, file: string, maxBytes: number): { bytes: number; sha256: string } {
  if (body.length > maxBytes) throw new DownloadLimitError(maxBytes)
  fs.writeFileSync(file, body, { flag: 'wx' })
  return { bytes: body.length, sha256: crypto.createHash('sha256').update(body).digest('hex') }
}

/** Remove a file that may not exist; never throws. */
export function removeQuietly(file: string | undefined): void {
  if (!file) return
  try { fs.unlinkSync(file) } catch { /* already gone */ }
}
