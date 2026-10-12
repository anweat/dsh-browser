# Changing restrictions: login domains and throttling

Load this when `POLICY_DENIED` says an auth profile is not allowed for a host, or the usage buffer is too slow or too fast for the task.

Read before you change anything:

```json call
{"action":"inspect.policy","args":{}}
```

It lists each profile (`origin`: `baseline`, `overlay-changed`, `overlay-created`), the usage limits with their baseline, the `revision`, and the newest audit entries. Pass that `revision` as `expectedRevision` so a change made meanwhile is not overwritten.

## Auth profiles

```json call
{"action":"runtime.set_auth_profile","args":{"id":"forum","allowedDomains":["example.com","*.example.org"],"reason":"The task reads the forum and its CDN"}}
```

- `allowedDomains` is the whole list. Registrable domains or `*.domain` only: no TLDs or public suffixes (`com`, `co.uk`, `github.io`), IPs, ports, paths, or schemes; localhost and internal names only if the user enabled `allowPrivateHosts`.
- `storageStatePath` must be a `.json` inside the auth directory shown by `inspect.policy`; a profile that only reads its state needs that file to exist already (you cannot create it; ask the user, or set `persistState: true` so it is written after a login).
- Narrowing (fewer domains, `persistState: false`, `runtime.remove_auth_profile`) runs at once. Widening (more domains, a new profile, `persistState: true`) asks the user in `standard` and `autonomous`, is refused in `read-only`, and in `unrestricted` runs unasked, with `risk` in the result. Do not widen beyond what the task needs, and say in `reason` why.
- Sessions that lose a login are closed; their next `target.open` starts fresh.

## Usage limits

```json call
{"action":"runtime.set_usage_policy","args":{"minDelayMs":2000,"maxConcurrency":1,"reason":"The site answers 429"}}
```

Longer delays and backoff, and lower concurrency, burst, pages, depth and retries are stricter and free. Anything looser follows the widening rules above. Values outside the configured ranges are refused.

`runtime.reset_policy` (`scope`: `all`, `usagePolicy`, `authProfile` + `id`) returns to the configured baseline; it can itself be a widening. Everything you change is audited with your `reason`: do not use these actions to get around a refusal the user gave.
