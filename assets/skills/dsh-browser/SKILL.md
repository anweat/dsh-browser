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

lists the groups and the environment state. `{"group":"act"}` lists a group, `{"action":"act.click"}` gives a full schema, `{"query":"upload"}` searches; only actions usable in the current automationMode appear. `automation.develop` has sub-actions (`{"action":"automation.develop"}` lists them); one sub-action's schema:

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

A wrong argument returns `INVALID_ARGS` with the schema attached: fix and resend.

## 3. Locating elements

- Prefer a `locator` with `role` + `name`, then `label`, `text`, `testId`; a CSS `selector` only when nothing semantic exists.
- Locators are strict: one matching several elements does nothing and fails with `LOCATOR_AMBIGUOUS`; `error.candidates` lists the first five. Narrow it (`exact`, a better name, `frame`/`framePath`); only if you must pick one, add `index` and `indexReason`.
- To see what can be acted on, `observe.read` with `sections` (`controls`, `links`, `tables`; `references/observe.md`). Each control has a checked `locator` for `act.*`; `ambiguous:true` means none is unique. A missing field was not observed; `false` was.
- Results carry `targetId` and `generation`. Pass `generation` as `expectGeneration` to `act.*`: if the page navigated since, it fails `TARGET_STALE` instead of acting. Re-observe after a navigation or big re-render.
- `act.fill` replaces, `act.type` presses keys, `act.clear` empties. A popup joins `target.list`; switch with `target.select`.

## 4. Side effects and failure

`act.*` actions change the page and may need approval from the user in `standard` mode; wait for the answer. Read `error.code` and `error.hint`:

| code | what to do |
|---|---|
| `INVALID_ARGS` | fix the arguments using the attached schema |
| `LOCATOR_NOT_FOUND` | read the page, adjust the locator, `act.wait` for dynamic content; nothing was done |
| `LOCATOR_AMBIGUOUS` | several elements matched and nothing was done: choose from `error.candidates` |
| `NOT_ACTIONABLE` | hidden, disabled, or covered: wait or dismiss the overlay; nothing was done (recipe: `effects: none`) |
| `TARGET_CLOSED` | call `target.open` again |
| `TARGET_STALE` | the page navigated since your `expectGeneration`; nothing was done: `observe.read` again and use the new `generation` |
| `DEADLINE` | with `executionStatus: "outcome_unknown"` the action may have taken effect: verify with `observe.read`, never resubmit blindly |
| `OUTCOME_UNKNOWN` | a page-changing step timed out mid-way and may or may not have happened: check with `observe.read`, never resend a submit |
| `VALIDATION_FAILED` | the steps ran but an `assert` did not hold: read the page, then fix the recipe or the assert; earlier steps are not undone, do not repeat them blindly |
| `VALIDATION_MISSING` | a v2 draft test has no `assert` or postcondition, so it cannot pass: add one, save, test again |
| `CANCELLED` | stopped; steps that already ran stay done (see `effects`) |
| `POLICY_DENIED` / `CAPABILITY_UNAVAILABLE` | not allowed or not set up here (for example Chromium missing: `runtime.install`) |

Recipe runs (`automation.run_recipe`, `automation.run`, `automation.develop` test) return the whole run in `result` even when `ok` is false: `executionStatus`, `validationStatus` (`not_checked`, `passed`, `failed`), `completedSteps`, `failedStep`, `effects` (`none`, `observed`, `unknown`), `outputs`. `ok` is true only if the run completed and no assert failed; `completed` with `not_checked` means the steps ran, not that the result is right: add an `assert`. If `effects` is not `none`, earlier steps changed something and nothing is rolled back (`references/recipes.md`). Recipes bind the page on every run; they take no generation.

After a submit, purchase, or any irreversible step, confirm the result on the page (confirmation text, new URL, changed list) before telling the user it worked.

## 5. Choosing a path (cheapest first)

1. A saved asset: `automation.search` then `automation.run`.
2. OpenCLI site adapters if the platform is covered: `opencli.catalog`, `opencli.run` (`references/opencli.md`).
3. Read-only extraction: `script.catalog`, `script.run_builtin`, a validated userscript (`references/userscripts.md`).
4. Page interaction: `target.open`, `observe.read`, `act.*` (`references/observe.md`).
5. Bounded multi-step work: `automation.run_recipe` (`references/recipes.md`); `crawl.crawl` for anonymous same-origin crawls.

## 6. Turning a success into an asset

When an exploration worked and will likely repeat, save it as a draft with `automation.develop` (`save`, `validate`, then `test` with real inputs). Write recipes as schema v2 (`"schemaVersion":2`: strict `locator`s, `goto`, `clear`, typed `inputSchema`, `postconditions`; `references/recipes.md`). A v2 test passes only if an `assert` or postcondition checks the result (else `VALIDATION_MISSING`). A v1 asset becomes a new v2 draft with `{"action":"convert","id":...}`; the original stays untouched.

Every `save` is a new revision, and a test only vouches for the revision and content it ran on: edit again and test again. A draft is not usable until the user activates a tested revision; never claim it is ready. To repair an active asset that broke, `{"action":"fork","id":...}` gives an editable copy (`sourceAssetId`); the active asset keeps running until the user activates the working copy. Do not put cookies, tokens, passwords, or page content in an asset.

## 7. Boundaries

- The user's automationMode decides what is exposed and what asks for approval. Do not route around a refusal.
- Logged-in access uses a named AuthProfile (`authProfile` on `target.open`). Never put secrets into assets.
- Respect the site's rules and the usage buffer; `crawl.crawl` is bounded.
