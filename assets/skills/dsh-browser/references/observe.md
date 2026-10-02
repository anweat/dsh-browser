# Reading what the browser returns

Load this when a page result is hard to interpret.

## observe.read and action results

`target.open`, `observe.read`, and the `act.*` actions return the page state in `result`:

- `url`: the current address (check it after a click to see whether navigation happened).
- `title`: the page title.
- `text`: readable page text, bounded. Long pages are cut; if the part you need is missing, scroll with `act.scroll` and read again, or extract it with a recipe or built-in script.
- `targetId` and `generation`: which page of your session this is and its version (see Page generations below).
- `screenshotPath`: a file path on the host (only when a screenshot was taken, for example by `target.open`).

A `truncation` field on the envelope means long text fields were shortened; the result is still valid JSON.

## Reading structure: sections

`observe.read` returns only `text` by default. Ask for more with `sections`, any of `content`, `controls`, `links`, `tables`:

```json call
{"action":"observe.read","args":{"sections":["controls"]}}
```

Narrow it to part of the page with a `locator` (everything below that element is read; it must match exactly one element) or a viewport `region`, and bound it with `maxItems` (per section) and `maxBytes` (whole result):

```json call
{"action":"observe.read","args":{"sections":["controls","tables"],"locator":{"role":"form"},"maxItems":20,"maxBytes":12000}}
```

Each control record has `role`, `name`, `type`, a `locator`, the `actions` that can work now, the states it has (`visible`, `disabled`, `readonly`, `checked`, `expanded`), `options` for a select or radio group, declared `constraints` (`required`, `min`, `max`, `step`, `pattern`, `minlength`, `maxlength`, `accept`, `multiple`), the browser's own `validity`, and a `source` (`dom` or `aria`). The full field list: `{"action":"observe.read.controls"}` in `browser_index`.

- The `locator` was checked against the live page: it matches that element and no other. Pass it unchanged to `act.*`. Inside an iframe it carries `framePath`; open shadow DOM needs nothing extra.
- `ambiguous: true`: nothing unique exists (two identical unlabeled buttons, say). `matches` says how many elements the locator hits and `nth` which one this is; acting on it as is returns `LOCATOR_AMBIGUOUS`. Pin it with `index: nth` and an `indexReason`, or scope the read to its container.
- A field that is missing was not observed or does not apply (a range input has no `readonly`); `false` always means observed and not so. An empty list is an answer: `options: []` is a select with no options, `rows: []` with `totalRows: 0` an empty table, `controls: []` a page without controls. A scope that does not exist is `LOCATOR_NOT_FOUND`.
- Values are not returned. `hasValue` says whether a field is empty. With `includeValues: true` plain fields return `value`, but never password, hidden, file, or token-like fields: those only carry `hasValue` and `sensitive: true`.
- `frames` lists the iframes searched. A cross-origin or sandboxed one has `crossOrigin: true` and its content is not observed, and `limits` says so; you can still reach into it with `framePath` if you know the element. Closed shadow roots cannot be read.
- `links` have `text`, absolute `href` (a secret-looking query value such as a token shows as `[redacted]`), and a `locator`. `tables` have `headers`, the first `maxItems` `rows`, `totalRows`, and `coverage`: `partial` (with a `reason`) means the page has more rows than the DOM shows, because of a virtualized list or a pager; scroll or use the pager, then read again.
- Output is cut at item boundaries to fit `maxBytes` and is always valid JSON. `truncation: {omittedBySection, reason}` names what is missing and `counts` how many the page has. Ask for one section, raise the limits, or scope with a `locator`. Details: `{"action":"observe.read.truncation"}`.

## Page generations

Every page state has a `generation`. It changes when the page's main frame navigates: a new page load, reload, history back or forward, `location` change, `history.pushState` or `replaceState`, a hash change. It does not change for a DOM re-render or for an iframe navigating on its own. Values only grow within your session and never repeat, so a `generation` cannot match a different page.

Pass the `generation` you observed as `expectGeneration` to an `act.*` call. If the page has moved on, the call fails with `TARGET_STALE` before doing anything, and `error.current` has the new `targetId` and `generation`: observe again and decide whether the page is still the one you meant.

```json call
{"action":"act.click","args":{"locator":{"role":"button","name":"Create account","exact":true},"expectGeneration":3}}
```

Recipes do not take it: they bind the page again on every run.

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
