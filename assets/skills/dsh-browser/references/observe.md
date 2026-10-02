# Reading what the browser returns

Load this when a page result is hard to interpret.

## observe.read and action results

`target.open`, `observe.read`, and the `act.*` actions return the page state in `result`:

- `url`: the current address (check it after a click to see whether navigation happened).
- `title`: the page title.
- `text`: readable page text, bounded. Long pages are cut; if the part you need is missing, scroll with `act.scroll` and read again, or extract it with a recipe or built-in script.
- `screenshotPath`: a file path on the host (only when a screenshot was taken, for example by `target.open`).

A `truncation` field on the envelope means long text fields were shortened; the result is still valid JSON.

## Screenshots

```json call
{"action":"observe.screenshot","args":{"locator":{"role":"heading","name":"Pricing"}}}
```

returns `{path}` inside `snapshotDir`. Without a locator it captures the full page. A `filename` must be a plain name ending in `.png`, `.jpg`, or `.jpeg`.

## Console and failed requests

Capture is off unless the page was opened with it:

```json call
{"action":"target.open","args":{"url":"https://example.com/","capture":["console","network"]}}
```

Then `inspect.console` (filter with `level`) and `inspect.requests` return bounded, redacted records: console text, and failed or HTTP 4xx/5xx requests (method, url, status). No bodies or headers are recorded. Records reset on the next `target.open`.

## Waiting

`act.wait` takes exactly one of: a `locator`/`selector` (with `state`), `urlPattern`, `networkIdle: true`, or `timeMs` (max 10000).

## Several pages

Each session has its own context; other sessions cannot see it. A link with `target=_blank` or `window.open` adds a popup to your page list without making it active. `target.list` shows every page (`id`, `url`, `title`, `active`); switch with `target.select`, then `observe.read` and `act.*` work on that page.

```json call
{"action":"target.list","args":{}}
```

```json call
{"action":"target.select","args":{"id":"t2"}}
```

Ids are never reused in a session. A popup that closed gives `TARGET_CLOSED` on select; list again. If the active page closes, the session falls back to another open page of the same context. `target.close` discards all of the session's pages.

## Typing and clearing

`act.fill` replaces a value at once (no key events). `act.type` presses the keys one by one, for autocompletes and masked inputs. `act.clear` empties a field and fires the input event, so controlled inputs update their state; do not fill an empty string to clear.
