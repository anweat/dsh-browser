# Downloads and context options

Load this when you need a file on disk, or the page must be opened with another window size, language, time zone, user agent, or proxy.

## Downloading a file

```json call
{"action":"target.download","args":{"url":"https://example.com/report.pdf"}}
```

- The request uses this session's login state. Inside an AuthProfile it only goes to that profile's `allowedDomains`; elsewhere it is refused (`POLICY_DENIED`).
- The result has the absolute `path`, `bytes`, `sha256`, `suggestedFilename`. Hand `path` to whatever reads the file. PDFs are not parsed by this plugin.
- It fails instead of returning an empty file, and a download over `downloadMaxBytes` (default 100 MiB) is aborted and removed.
- `filename` must be a plain file name (no `/`, `\`, `..`, or device names like `CON`). A taken name is never overwritten: the file gets `-1`, `-2`.
- Downloads that a click or a navigation starts are saved by the same rules. List this session's with:

```json call
{"action":"inspect.downloads","args":{}}
```

- The records live in memory (newest 50) and belong to this session; `clear` drops the records, not the files. `script.evaluate` never returns a downloaded file; use `target.download`.
- `target.download` asks for approval in `standard` and `autonomous`, like `act.upload`.

## Context options on target.open

`viewport {width,height}`, `userAgent`, `locale`, `timezoneId` and `proxyServer` are applied when the session's context is created.

- An option you leave out keeps the context's current value. A different value closes the old context (its pages and any popups are gone, cookies outside an AuthProfile are dropped) and opens the page in a new one; the result says `contextRebuilt` and lists `changed`.
- `target.close` returns the session to the configured defaults.
- Every `target.open` result lists the whole parameter set in effect (`contextOptions`) and where each value comes from (`contextSources`: `call`, `session` for an earlier call kept by the context, `default`). A parameter you leave out uses that default, so copy nothing: give only the keys you change.
- `proxyServer` and `userAgent` ask for approval (denied in `read-only`). Proxy accounts and passwords are not supported: never put credentials in `proxyServer`.
- Invalid values return `INVALID_ARGS` and leave the current page alone.

```json call
{"action":"target.open","args":{"url":"https://example.com/","viewport":{"width":390,"height":844},"locale":"en-US"}}
```
