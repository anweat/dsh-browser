# Recipes: bounded multi-step browser work

A recipe is 1 to 25 declarative steps run on the current page. Run one inline with `automation.run_recipe`, or save it as a draft with `automation.develop` so it can be tested, activated by the user, and reused with `automation.run`.

## Steps

Each step has a `type` and the fields it needs. Selectors are CSS.

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

Read-only steps (`wait`, `extract`, `assert`, `screenshot`) run without approval; anything else may ask the user.

```json call
{"action":"automation.run_recipe","args":{"url":"https://example.com/","steps":[{"type":"wait","condition":"selector","value":"main"},{"type":"extract","selector":"main","mode":"text","limit":20}]}}
```

## Reading the result

A recipe never fails by throwing away what it did. `result` always holds:

| field | meaning |
|---|---|
| `executionStatus` | `completed`; `failed` (a step failed or the deadline passed); `cancelled`; `outcome_unknown` (a step that changes the page timed out) |
| `validationStatus` | `passed`: the recipe has `assert` steps and every one held. `failed`: an assert did not hold. `not_checked`: no assert ran to confirm anything |
| `completedSteps` | the steps that finished, with `step`, `action`, `ok`, and `value` for extract and screenshot |
| `failedStep` | `index` (1-based), `action`, `errorCode`, and the original `message`; for a cancel or deadline, the step that did not start. Absent when every step ran |
| `effects` | `none`: nothing changed. `observed`: fill, type, click, press, select or check steps completed. `unknown`: one of those failed in flight, so it may have happened |
| `outputs` | values from extract and screenshot steps; an existing but empty element gives `""`, a missing element is `LOCATOR_NOT_FOUND` |
| `legacyFallback` | only on stored older assets: an unknown extract `mode` ran as `links` |

`ok` is true only when `executionStatus` is `completed` and `validationStatus` is not `failed`. Next steps:

- `OUTCOME_UNKNOWN`: do not run the recipe again. Read the page (`observe.read`) to see whether the click, fill or submit took effect, then continue from the real state.
- `VALIDATION_FAILED`: the page did not show the expected result. Read it, then correct the recipe or the assert. Steps before the assert already ran; do not repeat a submit.
- `failed` with `effects: observed`: the earlier steps are done. Resume from `failedStep.index`, not from the start.
- `cancelled`: the step that was running finished before the call returned; the page stays open and usable.

A test or run counts as passed only when it completed and no assert failed. A recipe with no `assert` step still passes a test, but is stored as `legacy-unverified` (`evidenceLevel` in the test result): add an `assert` that proves the business result to get `verified`.

## Inputs

In a saved asset, `{{name}}` inside a step's `value` or `text` becomes a declared input; `automation.run` must then pass `inputs: {"name": "..."}`. Missing or undeclared inputs are rejected.

## Saving a draft

```json call
{"action":"automation.develop","args":{"action":"save","kind":"recipe","name":"Example heading","description":"Read the main text of example.com","domains":["example.com"],"tags":["example","read"],"recipe":[{"type":"extract","selector":"main","mode":"text","limit":20}]}}
```

Then `{"action":"validate","id":...}` and `{"action":"test","id":...,"url":...,"inputs":{...}}`. Test with realistic inputs, and test at least two different inputs when the recipe takes any. Activation is the user's decision.

## Known limits

- Every step uses the first element a selector matches. Make selectors specific.
- A step that fails stops the recipe. Earlier steps have already run and are not rolled back, so do not retry a recipe that already submitted something without checking the page.
- A step that is already running cannot be interrupted. Cancel and deadline take effect between steps, so a long `wait` or a slow click delays the return by up to its own timeout.
- `extract.mode` must be `text`, `html`, `links` or `attribute`, and `wait.condition` one of `selector`, `text`, `load`, `time`; other values are rejected when a recipe is run inline or saved.
- A recipe passing a test with no `assert` means the steps ran, not that the business result was correct.
