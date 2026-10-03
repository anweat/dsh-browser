# Recipes: bounded multi-step browser work

A recipe is 1 to 25 declarative steps run on the current page. Run one inline with `automation.run_recipe`, or save it as a draft with `automation.develop` so it can be tested, activated by the user, and reused with `automation.run`.

There are two schemas. **Write new recipes as v2** (`"schemaVersion":2`): locators are strict, so a step never silently acts on the wrong element. v1 (the default for an inline recipe without `schemaVersion`, and for every asset saved before v2) keeps its old behaviour: CSS `selector`, always the first match.

## v2 steps

Each step has a `type` and a `locator` where it acts on an element. A locator is one of `{"role":"button","name":"Save"}` (optional `exact`), `{"label":"Query"}`, `{"text":"More"}`, `{"testId":"save"}`, `{"css":"#id"}`, plus optional `framePath` (iframe selectors, outermost first).

| type | fields |
|---|---|
| `wait` | `condition`: `locator` (with `locator`), `text` or `url` (with `value`), `load`, or `time` (with `waitMs`); optional `timeoutMs` |
| `click`, `hover`, `clear` | `locator` |
| `fill` | `locator`, `value` (non-empty; to set `""` write `allowEmpty: true`, or use `clear`) |
| `type` | `locator`, `value` (key by key) |
| `press` | `key`, optional `locator` |
| `select` | `locator`, `value` |
| `check` | `locator`, optional `checked` (false unchecks) |
| `scroll` | `deltaY`, `waitMs` |
| `goto` | `url`: absolute http(s), inside the recipe's domains (see below) |
| `extract` | optional `locator` (default: the page), `mode`: `text`, `html`, `links`, `attribute` (with `attribute`), `limit`, optional `as` (names the output) |
| `assert` | `locator`, `text`, or `urlIncludes` that must become true |
| `screenshot` | none |

`extract` and `assert` wait at most 5 s unless `timeoutMs` says otherwise, so a selector that is not there fails fast with `LOCATOR_NOT_FOUND`. Every other step waits 15 s. Read-only steps (`wait`, `goto`, `extract`, `assert`, `screenshot`) run without approval; anything else may ask the user.

```json call
{"action":"automation.run_recipe","args":{"url":"https://example.com/","schemaVersion":2,"steps":[{"type":"click","locator":{"role":"link","name":"More information"}},{"type":"assert","urlIncludes":"iana.org"},{"type":"extract","locator":{"css":"main"},"as":"body"}],"postconditions":[{"output":"body","nonEmpty":true}]}}
```

### When a locator is ambiguous

A v2 locator must match exactly one element. If it matches several, the step is **not executed** (no click, no typing; `effects` stays as it was) and the reply is `LOCATOR_AMBIGUOUS` with `error.candidates`: `total` and the first five matches (`role`, `name`, `text`, `visible`). Fix the locator, do not guess:

1. Make it specific: `exact: true`, a fuller `name`, a `label`, a `testId`, or a `framePath`.
2. Only if the elements really are interchangeable, pick one with `"index": 1` **and** an `"indexReason": "why this one"`. An `index` without a reason is rejected.

A step that finds no element at all (`LOCATOR_NOT_FOUND`) did nothing either: `executionStatus` is `failed` and `effects` does not become `unknown`. Only a step that found its element, started, and then timed out is `outcome_unknown`.

## Reading the result

A recipe never fails by throwing away what it did. `result` always holds:

| field | meaning |
|---|---|
| `executionStatus` | `completed`; `failed` (a step failed or the deadline passed); `cancelled`; `outcome_unknown` (a step that changes the page was being performed when it timed out) |
| `validationStatus` | `passed`: there is at least one `assert` or postcondition and every one held. `failed`: one did not hold. `not_checked`: nothing verified the result |
| `completedSteps` | the steps that finished: `step`, `action`, `ok`, and for extract/screenshot `output`, the index into `outputs` (the value is stored once, there) |
| `failedStep` | `index` (1-based), `action`, `errorCode`, the original `message`, and `candidates` for `LOCATOR_AMBIGUOUS`; for a cancel or deadline, the step that did not start. A failed postcondition is reported as a step after the last one with `action: "postcondition"` |
| `effects` | `none`: nothing changed. `observed`: fill, type, clear, click, press, select or check steps completed. `unknown`: one of those failed in flight, so it may have happened |
| `outputs` | values from extract and screenshot steps, each with `step`, `action`, `value`, and `name` when the extract had `as`; an existing but empty element gives `""`, a missing element is `LOCATOR_NOT_FOUND` |
| `legacyFallback` | only on stored v1 assets: an unknown extract `mode` ran as `links` |

`ok` is true only when `executionStatus` is `completed` and `validationStatus` is not `failed`. Next steps:

- `OUTCOME_UNKNOWN`: do not run the recipe again. Read the page (`observe.read`) to see whether the click, fill or submit took effect, then continue from the real state.
- `VALIDATION_FAILED`: the page did not show the expected result. Read it, then correct the recipe, the assert or the postcondition. Steps before the failure already ran; do not repeat a submit.
- `failed` with `effects: observed`: the earlier steps are done. Resume from `failedStep.index`, not from the start.
- `failed` with `NOT_ACTIONABLE` and `effects: none`: the element was found but stayed disabled, hidden or moving until the timeout, so the step never ran. Wait for the page state it needs (`wait`), then retry.
- `cancelled`: the step that was running finished before the call returned; the page stays open and usable.

A test or run counts as passed only when it completed and nothing failed validation.

## Verifying the result: assert and postconditions

`assert` steps check in the middle of a recipe; **postconditions** are checked after all steps and belong to the asset. Use exactly one kind per entry:

- `{"selector":"#done"}`: a CSS selector that is visible. `{"text":"Saved"}`: text that is visible. `{"urlIncludes":"/inbox"}`: the final URL contains it. Each waits up to `timeoutMs` (default 5000).
- `{"output":"results","nonEmpty":true}`: the named extract output is not empty. `{"output":"results","allowEmpty":true}`: it only has to have been produced (an empty result is legitimate).

`validationStatus` is `passed` only when every `assert` and every postcondition holds. **A v2 draft with no `assert` and no postcondition can be saved, but its test cannot pass**: the reply is `ok: false` with `error.code: "VALIDATION_MISSING"` and `testStatus: "failed"`. Add a check that proves the business result (confirmation text, new URL, a non-empty output).

## Inputs and outputs

`{{name}}` in any string of a step or postcondition becomes an input. For v2, declare each one in `inputSchema` and the caller's values are checked and converted before the browser is touched:

```json call
{"action":"automation.develop","args":{"action":"save","kind":"recipe","schemaVersion":2,"name":"Catalog apply","domains":["example.com"],"recipe":[{"type":"fill","locator":{"label":"Limit"},"value":"{{limit}}"},{"type":"select","locator":{"label":"Sort"},"value":"{{sort}}"},{"type":"click","locator":{"role":"button","name":"Apply"}},{"type":"extract","locator":{"css":"#rows"},"as":"rows"}],"inputSchema":[{"name":"limit","type":"number","example":"3"},{"name":"sort","type":"enum","enumValues":["new","top"]}],"outputSchema":[{"name":"rows","type":"string"}],"postconditions":[{"text":"Sorted by {{sort}}, limit {{limit}}"},{"output":"rows","nonEmpty":true}]}}
```

- `type`: `string`, `number` (a number or numeric text; stored canonically), or `enum` (must be one of `enumValues`). `required` defaults to true; an omitted optional input becomes an empty string. Wrong or missing inputs fail with `INVALID_ARGS` before anything runs.
- `outputSchema` names and types the outputs: each entry needs an `extract` with the same `as`. `number` parses the text (thousands commas allowed), `json` parses JSON (use it with `links`); a value that does not convert fails validation. `"dedupe":true` (string or json) removes repeated lines or elements, keeping the first of each, before the postconditions are checked.
- `requiredCapabilities` is recorded for later; it is not enforced.
- `automation.search` shows a v2 asset's `inputSchema`, so you can call `automation.run` without opening the recipe.

## goto

`goto` navigates the recipe's page. For a saved asset the URL must be inside its `domains` (the host or a subdomain), checked when saving and again when running, including where a redirect lands. For an inline recipe it may stay on the origin the recipe started on, or go to hosts listed in `allowedDomains`. A URL outside that fails with `POLICY_DENIED` before any step runs.

```json call
{"action":"automation.develop","args":{"action":"save","kind":"recipe","schemaVersion":2,"name":"Reset filter","domains":["example.com"],"recipe":[{"type":"goto","url":"https://example.com/search"},{"type":"clear","locator":{"label":"Filter"}},{"type":"assert","text":"All items"}]}}
```

## Saving a draft

Save (`automation.develop`, `save`) replaces the whole draft, so send every field each time; `browser_index({action:"automation.develop.save"})` has its schema. Then `{"action":"validate","id":...}` and `{"action":"test","id":...,"url":...,"inputs":{...}}`. Test with realistic inputs, and when the recipe takes any, with `inputSets` (2 to 5 different inputs, each in a fresh context; `references/develop.md`), checking that the outputs differ. A draft explored with `browser_call` is built with `draft_from_journal` instead of by hand (`references/develop.md`). Activation is the user's decision. Do not put page content, cookies or passwords into an asset.

**Revisions.** Every save makes a new `revision` (with a `contentHash` over the steps and schema fields) and clears the test result. A test is recorded as a credential for the revision and content it ran on, with only a digest of the inputs; the test reply carries `revision` and `contentHash`. After any edit, test again. The user can activate only a revision whose latest test passed on exactly that content.

## Repairing an active asset

An active asset cannot be edited. When it stops working (the page changed), copy it, change the copy, test the copy:

```json call
{"action":"automation.develop","args":{"action":"fork","id":"active-asset-id"}}
```

The draft records `sourceAssetId` and `sourceRevision`. Failing tests of the draft never touch the active asset, which keeps running (`automation.run`). Once the draft passes with realistic inputs, tell the user it is ready; their activation archives the old asset and makes the draft the active one.

## Converting a v1 asset

```json call
{"action":"automation.develop","args":{"action":"convert","id":"v1-asset-id"}}
```

creates a **new** v2 draft and leaves the original (even if active) exactly as it was; the draft records `sourceAssetId` and `sourceRevision`. Every CSS selector becomes `{"css": ...}` marked `explicitFirst`: it still takes the first match, as in v1, and is listed in `pendingDisambiguation`. To finish the migration: edit each listed step to a locator that matches one element (or an `index` with a reason), add an `assert` or a postcondition, save, and test. The `notes` in the reply list what else changed (shorter default timeouts, string inputs). An unknown `extract` mode or `wait` condition in the source refuses the conversion and says which step.

## v1 steps (existing assets)

A v1 step has a `type` and the fields it needs. Selectors are CSS and always use the first match.

| type | fields |
|---|---|
| `wait` | `condition`: `selector` or `text` (with `value`), `load`, or `time` (with `waitMs`); optional `timeoutMs` |
| `click` | `selector` |
| `fill`, `type` | `selector`, `value` (`fill` replaces the value; `type` presses keys) |
| `press` | `key`, optional `selector` |
| `select` | `selector`, `value` |
| `check` | `selector`, optional `checked` (false unchecks) |
| `hover` | `selector` |
| `scroll` | `deltaY`, `waitMs` |
| `extract` | optional `selector`, `mode`: `text`, `html`, `links`, `attribute` (with `attribute`), `limit` |
| `assert` | `selector` or `text` that must become visible |
| `screenshot` | none |

```json call
{"action":"automation.run_recipe","args":{"url":"https://example.com/","steps":[{"type":"wait","condition":"selector","value":"main"},{"type":"extract","selector":"main","mode":"text","limit":20}]}}
```

A v1 recipe with no `assert` still passes a test, but is stored as `legacy-unverified` (`evidenceLevel`): add an `assert` that proves the business result to get `verified`.

## Known limits

- A step that fails stops the recipe. Earlier steps have already run and are not rolled back, so do not retry a recipe that already submitted something without checking the page.
- A step that is already running cannot be interrupted. Cancel and deadline take effect between steps, so a long `wait` or a slow click delays the return by up to its own timeout.
- `extract.mode` must be `text`, `html`, `links` or `attribute`, and a `wait` condition one of those listed above; other values are rejected when a recipe is run inline or saved.
- A recipe passing a test with no `assert` (v1) means the steps ran, not that the business result was correct.
- An inline v2 recipe is not offered as a reusable candidate; save it as a draft if it should be reused.
