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

## Inputs

In a saved asset, `{{name}}` inside a step's `value` or `text` becomes a declared input; `automation.run` must then pass `inputs: {"name": "..."}`. Missing or undeclared inputs are rejected.

## Saving a draft

```json call
{"action":"automation.develop","args":{"action":"save","kind":"recipe","name":"Example heading","description":"Read the main text of example.com","domains":["example.com"],"tags":["example","read"],"recipe":[{"type":"extract","selector":"main","mode":"text","limit":20}]}}
```

Then `{"action":"validate","id":...}` and `{"action":"test","id":...,"url":...,"inputs":{...}}`. Test with realistic inputs, and test at least two different inputs when the recipe takes any. Activation is the user's decision.

## Known limits

- Every step uses the first element a selector matches. Make selectors specific.
- A step that fails stops the recipe with an error; earlier steps have already run and are not rolled back, so do not retry a recipe that already submitted something without checking the page.
- A recipe passing a test means the steps ran, not that the business result was correct; include an `assert` or `extract` that proves it.
