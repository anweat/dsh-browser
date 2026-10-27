/**
 * Download saving: file-name rules, collision-free placement inside `downloadDir`, and size-capped streaming.
 *
 * Everything that decides where a byte lands lives here, apart from the browser, so the rules are testable
 * on their own: a name is reduced to a plain file name, a file never overwrites another, and the only
 * directory a file can end up in is the configured one.
 * @module dsh-browser/downloads
 */
/** How many download records a session keeps in memory (oldest dropped first). */
export declare const DOWNLOAD_HISTORY_LIMIT = 50;
/** What `inspect.downloads` reports for one download. The file itself is on disk; this record only lives in memory. */
export interface DownloadRecord {
    /** `d1`, `d2`, ... within the session. */
    id: string;
    /** The URL the download came from, with credential-looking query parameters masked. */
    url: string;
    /** `saved`, or `failed` (nothing is left on disk for a failed one). */
    status: 'saved' | 'failed';
    /** `request`: fetched by `target.download` with the session's cookies. `browser`: a download event of a page (navigation or click). */
    source: 'request' | 'browser';
    /** The name the server or page suggested. */
    suggestedFilename: string;
    /** Absolute path of the saved file (saved only). */
    path?: string;
    bytes?: number;
    sha256?: string;
    /** Why it failed (failed only). */
    error?: string;
    timestamp: string;
}
/** A download was cut because it passed `downloadMaxBytes`. */
export declare class DownloadLimitError extends Error {
    readonly maxBytes: number;
    constructor(maxBytes: number);
}
/**
 * Reduce a file name to a plain, portable one.
 *
 * `strict` is for a name the caller chose (`target.download` `filename`): anything that is not already a plain
 * name is refused with INVALID_ARGS, so a path or a traversal never turns into a different file silently.
 * Lenient is for a name a server or page suggested: only the last path segment is kept and unusable characters
 * are replaced. Control characters are stripped in both. Returns '' when nothing usable is left (lenient only).
 */
export declare function sanitizeDownloadName(raw: string, strict: boolean): string;
/** The name a download is saved under: the caller's (strict), else what the server suggested, else the URL's last segment. */
export declare function resolveDownloadFilename(input: {
    requested?: string;
    suggested?: string;
    url?: string;
}): string;
/** The last path segment of a URL, percent-decoded; '' when there is none. */
export declare function downloadNameFromUrl(url: string): string;
/** The file name of a Content-Disposition header (`filename*=UTF-8''...` first, then `filename=`); '' when absent. */
export declare function contentDispositionFilename(header: string | undefined): string;
/**
 * Move a finished temporary file to its final name inside `dir`, never overwriting: a taken name gets
 * `-1`, `-2`, ... before the extension. `name` must already be a plain file name (see {@link sanitizeDownloadName});
 * this checks it again, because it is the last line before bytes become a path. Returns the absolute path.
 */
export declare function claimDownloadPath(dir: string, name: string, temporary: string): string;
/** A fresh temporary file path inside `dir` (dot-prefixed, so a half-written file is not mistaken for a result). */
export declare function temporaryDownloadPath(dir: string): string;
/**
 * Write a stream to `file`, counting bytes and hashing as they pass. Past `maxBytes` the source is destroyed
 * and {@link DownloadLimitError} is thrown, so the caller deletes the partial file.
 */
export declare function streamToFile(source: NodeJS.ReadableStream & {
    destroy?: (error?: Error) => void;
}, file: string, maxBytes: number): Promise<{
    bytes: number;
    sha256: string;
}>;
/** Write an in-memory body to `file` with the same result shape as {@link streamToFile}. */
export declare function writeBufferToFile(body: Buffer, file: string, maxBytes: number): {
    bytes: number;
    sha256: string;
};
/** Remove a file that may not exist; never throws. */
export declare function removeQuietly(file: string | undefined): void;
