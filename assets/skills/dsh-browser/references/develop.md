# Developing a draft from an exploration

The shortest path from "it worked once" to a reusable asset: explore with `browser_call`, `draft_from_journal`, test with `inputSets`. The user activates; you never do.

## The journal

Every page-touching call (`target.*`, `observe.*`, `act.*`, `script.*`, `automation.run_recipe`, `automation.run`) is recorded in this session's journal and its reply carries `seq`. The journal keeps the last 200 calls, lives in memory only, and is dropped with the session. A call refused for bad arguments is not recorded; a failed call is, with its error code.

Each entry has the action, page `targetId`, `generationBefore` and `generationAfter`, the locator, scrubbed parameters, the outcome (`ok`, `executionStatus`, `errorCode`), `effects`, and a short summary. Typed text is never stored in an entry: `act.fill` and `act.type` text is a reference `{ref, length, sensitive?}`. The text itself is kept in memory only while it is short (200 characters or fewer) and does not look like a token or card number, and not at all when the page says the field is a password or the field is named like a secret. A `target.open` URL loses secret query values and userinfo. `observe.read` entries are observation points: they never become steps unless you name one in `extract`.

## draft_from_journal

Before selecting an observation for `extract`, read the result with the `content` section (or leave `sections` unset). A read of only `controls`, `links` or `tables` cannot become a recipe extract, even with `mode: "links"`; it returns `INVALID_ARGS`. For a scoped result:

```json call
{"action":"observe.read","args":{"sections":["content"],"locator":{"selector":"#results"}}}
```

Use the returned `seq` in `extract`.

```json call
{"action":"automation.develop","args":{"action":"draft_from_journal","name":"Keyword search","fromSeq":1,"toSeq":9,"exclude":[4],"parameters":[{"seq":3,"field":"text","name":"keyword","type":"string"}],"extract":[{"seq":8,"as":"items","mode":"text","dedupe":true}],"postconditions":[{"output":"items","allowEmpty":true},{"selector":"#status"}]}}
```

- `fromSeq`, `toSeq`: the slice (default: the whole journal). `exclude`: more seq to leave out. Failed calls and observations are already left out.
- `parameters`: `field` is `text` (act.fill, act.type), `values` (act.select) or `url` (a later target.open). Without it the typed text stays a literal, and `parameterCandidates` lists what you could parameterize. A value that was not kept (secret, too long) becomes a required input automatically (`SENSITIVE_VALUE_BECAME_INPUT`, or `VALUE_BECAME_INPUT` for a long value); pass it when testing and running.
- `extract`: `seq` of an `observe.read` that read the result (with a `locator`); `as` names the output; `mode` text, html or links; `dedupe` removes repeated lines (text) or elements (links). `extractCandidates` lists the scoped reads you could use.
- `postconditions`: written as given. Without them the reply only suggests some (`suggestedPostconditions`) and a test cannot pass (`NO_VERIFIER`). For a result that may legitimately be empty use `{"output":"items","allowEmpty":true}` together with a success marker such as `{"selector":"#status"}`: an empty result then passes, a missing container still fails.
- `id`: replace the draft of an earlier call (a new revision). Each call is one draft write; a session has a few (3 by default), so pass `postconditions` the first time.
- `domains` default to the hosts of the pages involved; `name` is required.

The reply: `steps`, `complete`, `sourceMap` (seq to step number; the opening `target.open` maps to 0: it is the `url` of test and run, `suggestedTestUrl`), `observationPoints`, `excluded` (with reasons), `unmapped`, `inputSchema`, `pendingDisambiguation` (steps that pick a match by `index`), `parameterCandidates`, `extractCandidates`, `suggestedPostconditions`, `domains`, `warnings`.

## What maps and what does not

Mapped: `act.click`, `hover`, `fill`, `type`, `clear`, `press`, `check`, `scroll`, `select` (one value), `act.wait` for a visible locator, plain URL text, network idle or a delay, a later `target.open` (a `goto`), a named `observe.read` (an `extract`). Unmapped, each with its reason: `script.*`, `act.upload`, `target.select` and any step on another page (a v2 recipe runs on one page), multi-value select, wait for hidden or detached, glob URL patterns, a frame chosen by name or url, a `target.open` whose URL carried a secret, a whole recipe run.

Any `unmapped` entry makes the draft `complete: false` (`INCOMPLETE_DRAFT`): it cannot be activated until you finish the recipe yourself and `save` it (that save replaces it). Warnings to act on: `GENERATION_JUMP` (the page moved between two calls without an action: add a wait or a goto), `EXCLUDED_NAVIGATION`, `NO_OPENING_STEP` (the test url must be the page the first step starts on), `FIXED_DELAY`, `NO_OUTPUT`, `FAILED_STEP_EXCLUDED` (the draft assumes later steps did not depend on it), `FAILED_STEP_EFFECTS_UNKNOWN`, `PARAMETER_NOT_APPLIED` and `EXTRACT_NOT_APPLIED` (the named seq is not a step), `JOURNAL_TRUNCATED` (the start of the exploration fell out of the 200 calls).

## Testing with inputSets

```json call
{"action":"automation.develop","args":{"action":"test","id":"draft-id","url":"https://example.com/search","inputSets":[{"keyword":"alpha"},{"keyword":"beta"}]}}
```

`inputSets` takes 2 to 5 input objects, all valid for the `inputSchema` and different from each other (checked before anything runs). Each runs in a new BrowserContext, never in your session page, with its own cookies; the first failing set stops the test. All sets must pass for the credential to be `passed`; it records how many sets ran and a digest of each set's inputs and outputs, never the values. The reply has one entry per set (`outputs`, `validationStatus`, `failedStep`), not repeated steps.

If different inputs gave identical outputs the test still passes but replies `warnings: [PARAMETERIZATION_SUSPECT]` with the set numbers, and the credential carries it: the input probably does not reach the page, or the output ignores it. Fix that before asking the user to activate. Without `inputSets` a test is one run on the session page, as before. An asset that declares inputs cannot be activated unless its passing test covered at least `automationAssets.minInputSetsForActivation` input sets (default 2): a single-input test cannot show the recipe does not hard-code that input, and activation is refused with `insufficient-input-sets`. Assets without inputs are not affected.

## The whole path

1. `automation.search`; reuse if an asset fits.
2. Explore: `target.open`, `observe.read`, `act.*`, `act.wait`, `observe.read` with a `locator` for the result.
3. `draft_from_journal` with `parameters`, `extract`, `postconditions`; read `unmapped` and `warnings`.
4. `test` with `inputSets` (include a keyword with no result when an empty result is legitimate).
5. Tell the user the draft and its tested revision; they activate it with that revision.
