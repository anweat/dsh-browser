---
name: dsh-browser
description: Use to open, read, or operate web pages, and to reuse or develop browser automation assets (recipes, userscripts) with the dsh-browser tools browser_index and browser_call. 打开、读取、操作网页，或复用、开发浏览器自动化资产时使用。
---

# dsh-browser

Browser capabilities come through two tools. `browser_index` shows what exists; `browser_call` runs one action and returns `{ok, action, executionStatus, result | error{code,message,hint}}`. Actions are named `group.action`. Do not guess other tool names.

## 1. Reuse first

At the start of a task, search for an existing verified asset. If one fits, run it instead of exploring the site again.

```json call
{"action":"automation.search","args":{"query":"search issues","domain":"github.com"}}
```

```json call
{"action":"automation.run","args":{"id":"asset-id-from-search","url":"https://github.com/search","inputs":{"query":"dsh"}}}
```

Two calls, no schemas needed. Only active assets are returned by default.

## 2. Finding actions

```json index
{}
```

lists the groups and the environment state (automationMode, whether Chromium is installed). Then `{"group":"act"}` lists a group's actions with one-line usage, `{"action":"act.click"}` gives the full schema, `{"query":"upload"}` searches. Only actions usable in the current automationMode are listed. `automation.develop` has sub-actions: `{"action":"automation.develop"}` lists them, one sub-action's schema is:

```json index
{"action":"automation.develop.save"}
```

You rarely need the schema for these six:

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

A wrong argument returns `INVALID_ARGS` with the schema attached: fix the call and resend; no need to open the index first.

## 3. Locating elements

- Prefer a `locator` with `role` + `name`, then `label`, `text`, `testId`; a CSS `selector` only when nothing semantic exists.
- Locators are strict: one that matches several elements does nothing and fails with `LOCATOR_AMBIGUOUS`. `error.candidates` lists the first five matches (role, name, text, visible). Narrow the locator (`exact`, a better name, `frame`/`framePath`); only if you must pick one, add `index` and an `indexReason`.
- After a navigation or a large re-render, earlier observations are stale. Read the page again before acting.
- `act.fill` replaces, `act.type` presses keys, `act.clear` empties. A popup joins `target.list`; switch with `target.select`.

## 4. Side effects and failure

`act.*` actions change the page and may need approval from the user in `standard` mode; wait for the answer. Read `error.code` and `error.hint`:

| code | what to do |
|---|---|
| `INVALID_ARGS` | fix the arguments using the attached schema |
| `LOCATOR_NOT_FOUND` | read the page, adjust the locator, `act.wait` for dynamic content; in a recipe the step did nothing (`effects` stays as before) |
| `LOCATOR_AMBIGUOUS` | several elements matched and nothing was done: choose from `error.candidates` |
| `NOT_ACTIONABLE` | the element is hidden, disabled, or covered: wait or dismiss the overlay. In a recipe, `effects: none` means the click never ran |
| `TARGET_CLOSED` | call `target.open` again |
| `DEADLINE` | with `executionStatus: "outcome_unknown"` the action may have taken effect: verify with `observe.read`, never resubmit blindly |
| `OUTCOME_UNKNOWN` | a step that changes the page timed out while it was being performed, so it may or may not have happened: check the real state with `observe.read`, never resend a submit |
| `VALIDATION_FAILED` | the steps ran but an `assert` did not hold, so the result is not confirmed: read the page, then fix the recipe or the assert; earlier steps are not undone and must not be repeated blindly |
| `VALIDATION_MISSING` | a v2 draft test ran, but no `assert` or postcondition checks the result, so it cannot pass: add one, save, test again |
| `CANCELLED` | the call was stopped; steps that already ran stay done (see `effects` in the result) |
| `POLICY_DENIED` / `CAPABILITY_UNAVAILABLE` | not allowed or not set up here (for example Chromium missing: `runtime.install`) |

Recipe runs (`automation.run_recipe`, `automation.run`, `automation.develop` test) put the whole run in `result` even when `ok` is false: `executionStatus` (`completed`, `failed`, `cancelled`, `outcome_unknown`), `validationStatus` (`not_checked`, `passed`, `failed`), `completedSteps`, `failedStep`, `effects` (`none`, `observed`, `unknown`), `outputs`. `ok` is true only when the run completed and no assert failed. `completed` with `not_checked` means the steps ran, not that the result is right; add an `assert`. If `effects` is not `none`, earlier steps already changed something and nothing is rolled back (`references/recipes.md`).

After a submit, purchase, or any irreversible step, confirm the result on the page (confirmation text, new URL, changed list) before telling the user it worked.

## 5. Choosing a path (cheapest first)

1. A saved asset: `automation.search` then `automation.run`.
2. OpenCLI site adapters when the platform is covered: `opencli.catalog` then `opencli.run` (see `references/opencli.md`).
3. Read-only extraction: `script.catalog`, `script.run_builtin`, or a validated userscript (`references/userscripts.md`).
4. Page interaction: `target.open`, `observe.read`, `act.*` (see `references/observe.md`).
5. Bounded multi-step work: `automation.run_recipe` (`references/recipes.md`); `crawl.crawl` for anonymous same-origin traversal.

## 6. Turning a success into an asset

When an exploration worked and the task will likely repeat, save it as a draft with `automation.develop` (`save`, then `validate`, then `test` with real inputs). Write new recipes as schema v2 (`"schemaVersion":2`: strict `locator`s, `goto`, `clear`, typed `inputSchema`, `postconditions`); see `references/recipes.md`. A v2 test passes only if an `assert` step or a postcondition checks the result (else `VALIDATION_MISSING`). An old v1 asset is copied into a new v2 draft with `{"action":"convert","id":...}`; the original stays untouched.

Every `save` is a new revision, and a test only vouches for the revision and content it ran on: edit again and it must be tested again. A draft is not usable until the user activates a tested revision; never claim it is ready. To repair an active asset that broke, `{"action":"fork","id":...}` gives an editable copy (`sourceAssetId`); the active asset keeps running while the copy fails its tests, and the user's activation of the working copy replaces it. Do not put cookies, tokens, passwords, or page content in an asset.

## 7. Boundaries

- The user's automationMode decides what is exposed and what asks for approval. Do not route around a refusal.
- Logged-in access uses a named AuthProfile (`authProfile` on `target.open`). Never put secrets into assets.
- Respect the site's rules and the usage buffer; `crawl.crawl` is bounded.
