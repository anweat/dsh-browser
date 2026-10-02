# Userscripts and built-in scripts

For extraction that is awkward through clicking, run JavaScript in a fresh page context.

## Built-in scripts first

They are trusted and read-only. `script.catalog` lists them (`article-clean`, `links`, `jsonld`, `forms`).

```json call
{"action":"script.run_builtin","args":{"url":"https://example.com/","scriptId":"links"}}
```

## Your own userscript

Format: a Tampermonkey-style metadata block, then a function body that returns a JSON-serializable value. Only `@grant none` is supported (no `GM_*` APIs, no `@require`), and `@match` must cover the target URL. Declared inputs arrive in `__DSH_INPUTS__`.

```
// ==UserScript==
// @name Read Heading
// @match https://example.com/*
// @grant none
// ==/UserScript==
return { heading: document.querySelector('h1')?.textContent || '', input: __DSH_INPUTS__.query || '' }
```

Validate before running; validation does not execute anything and reports the hash and capabilities.

```json call
{"action":"script.validate","args":{"source":"// ==UserScript==\n// @name Read Heading\n// @match https://example.com/*\n// @grant none\n// ==/UserScript==\nreturn document.title","url":"https://example.com/"}}
```

```json call
{"action":"script.run_userscript","args":{"url":"https://example.com/","source":"// ==UserScript==\n// @name Read Heading\n// @match https://example.com/*\n// @grant none\n// ==/UserScript==\nreturn document.title"}}
```

Running external code asks the user for approval unless the mode is `unrestricted`. If the page redirects outside the `@match`, the run is rejected.

## One-off expressions

`script.evaluate` runs a single JavaScript expression (up to 20,000 characters) on the current page with its origin and login state, so it can read cookies and storage that are not HttpOnly. Use it sparingly; it also asks for approval.

```json call
{"action":"script.evaluate","args":{"expression":"document.title"}}
```
