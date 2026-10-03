---
name: dsh-browser
description: Use to open, read, or operate web pages, and to reuse or develop browser automation assets (recipes, userscripts) with the dsh-browser tools browser_index and browser_call. 打开、读取、操作网页，或复用、开发浏览器自动化资产时使用。
---

# dsh-browser

Browser capabilities come through two tools. `browser_index` shows what exists; `browser_call` runs one action and returns `{ok, action, seq?, executionStatus, result | error{code,message,hint}}`. Actions are named `group.action`. Do not guess other tool names.

## 1. Reuse first

At the start of a task, search for an existing verified asset. If one fits, run it instead of exploring the site again.

```json call
{"action":"automation.search","args":{"query":"search issues","domain":"github.com"}}
```

```json call
{"action":"automation.run","args":{"id":"asset-id-from-search","url":"https://github.com/search","inputs":{"query":"dsh"}}}
```

Two calls, no schemas needed; only active assets are returned.

## 2. Finding actions

```json index
{}
```

lists the groups and the environment state. `{"group":"act"}` lists a group, `{"action":"act.click"}` gives a schema, `{"query":"upload"}` searches. `automation.develop` has sub-actions; one sub-action's schema:

```json index
{"action":"automation.develop.save"}
```

Six calls you rarely need a schema for:

```json call
{"action":"target.open","args":{"url":"https://example.com/"}}
```

```json call
{"action":"observe.read","args":{}}
```

```json call
{"action":"act.click","args":{"locator":{"role":"button","name":"Search"}}}
```

```json call
{"action":"act.fill","args":{"locator":{"label":"Query"},"text":"dsh"}}
```

```json call
{"action":"act.wait","args":{"locator":{"text":"Results"}}}
```

A wrong argument returns `INVALID_ARGS` with the schema attached: fix and resend.

## 3. Locating elements

- Prefer a `locator` with `role` + `name`, then `label`, `text`, `testId`; a CSS `selector` only if nothing semantic exists.
- Locators are strict: one matching several elements does nothing and fails `LOCATOR_AMBIGUOUS` (`error.candidates` lists five). Narrow it (`exact`, a better name, `frame`/`framePath`); only if you must pick one, add `index` and `indexReason`.
- `observe.read` with `sections` (`controls`, `links`, `tables`; `references/observe.md`) gives checked locators for `act.*`; `ambiguous:true` means none is unique.
- Results carry `targetId` and `generation`. Pass `generation` as `expectGeneration` to `act.*`: if the page navigated since, it fails `TARGET_STALE` instead of acting.
- `act.fill` replaces, `act.type` presses keys, `act.clear` empties. A popup joins `target.list`; switch with `target.select`.

## 4. Side effects and failure

`act.*` change the page and may need the user's approval in `standard` mode. Read `error.code` and `error.hint`:

| code | what to do |
|---|---|
| `INVALID_ARGS` | fix the arguments using the attached schema |
| `LOCATOR_NOT_FOUND` | read the page, adjust the locator, `act.wait` for dynamic content; nothing was done |
| `LOCATOR_AMBIGUOUS` | several matched, nothing was done: choose from `error.candidates` |
| `NOT_ACTIONABLE` | hidden, disabled, or covered: wait or dismiss the overlay; nothing was done |
| `TARGET_CLOSED` | call `target.open` again |
| `TARGET_STALE` | the page navigated (also when a read hit a navigation twice); nothing was done: `observe.read` again, use the new `generation` |
| `DEADLINE` | with `executionStatus: "outcome_unknown"` it may have taken effect: verify with `observe.read`, never resubmit blindly |
| `OUTCOME_UNKNOWN` | a page-changing step timed out mid-way: check with `observe.read` before any retry |
| `VALIDATION_FAILED` | the steps ran but an assert or postcondition did not hold: read the page, fix the recipe; do not repeat submits |
| `VALIDATION_MISSING` | a v2 draft has no `assert` or postcondition, so its test cannot pass: add one, save, test again |
| `CANCELLED` | stopped; steps that already ran stay done (see `effects`) |
| `POLICY_DENIED` / `CAPABILITY_UNAVAILABLE` | not allowed or not set up here (Chromium missing: `runtime.install`) |

Recipe runs (`automation.run_recipe`, `automation.run`, `automation.develop` test) return the whole run in `result` even when `ok` is false: `executionStatus`, `validationStatus` (`not_checked`, `passed`, `failed`), `completedSteps`, `failedStep`, `effects` (`none`, `observed`, `unknown`), `outputs`. `completed` with `not_checked` means the steps ran, not that the result is right; nothing is rolled back (`references/recipes.md`).

After a submit, purchase, or any irreversible step, confirm the result on the page (confirmation text, new URL, changed list) before telling the user it worked.

## 5. Choosing a path (cheapest first)

1. A saved asset: `automation.search` then `automation.run`.
2. OpenCLI adapters if the platform is covered: `opencli.catalog`, `opencli.run` (`references/opencli.md`).
3. Read-only extraction: `script.catalog`, `script.run_builtin`, a userscript (`references/userscripts.md`).
4. Page interaction: `target.open`, `observe.read`, `act.*` (`references/observe.md`).
5. Bounded multi-step work: `automation.run_recipe` (`references/recipes.md`); `crawl.crawl` for anonymous crawls.

## 6. Turning a success into an asset

When an exploration worked and will likely repeat, do not rewrite it by hand. Every page-touching call you made is in a session journal (its `seq` is in each reply); build the draft from it, then test it on other inputs:

```json call
{"action":"automation.develop","args":{"action":"draft_from_journal","name":"Keyword search","parameters":[{"seq":3,"field":"text","name":"keyword"}],"extract":[{"seq":7,"as":"items"}],"postconditions":[{"output":"items","allowEmpty":true},{"selector":"#status"}]}}
```

```json call
{"action":"automation.develop","args":{"action":"test","id":"draft-id","url":"https://example.com/search","inputSets":[{"keyword":"alpha"},{"keyword":"beta"}]}}
```

`parameters` turns a typed value into an input, `extract` names the `observe.read` that is the result, `postconditions` check it; failed calls and plain observations are left out. Read `unmapped` (what a recipe cannot express: the draft is then incomplete and cannot be activated), `warnings`, `pendingDisambiguation`. `inputSets` (2 to 5) run each in a fresh context and all must pass; `PARAMETERIZATION_SUSPECT` means different inputs gave the same output. Details: `references/develop.md`.

Write a recipe by hand (`save`, `validate`, `test`; schema v2 in `references/recipes.md`) only when the journal cannot cover it. `convert` turns a v1 asset into a v2 draft.

Every save is a new revision and a test vouches only for the revision it ran on. A draft is not usable until the user activates a tested revision; never claim it is ready. To repair an active asset, `{"action":"fork","id":...}` gives an editable copy. Never put cookies, tokens, passwords, or page content in an asset.

## 7. Boundaries

- The user's automationMode decides what is exposed and what asks for approval. Do not route around a refusal.
- Logged-in access uses a named AuthProfile (`authProfile` on `target.open`). Respect the site's rules and the usage buffer.
