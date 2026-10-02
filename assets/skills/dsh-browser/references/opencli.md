# OpenCLI site adapters

OpenCLI ships adapters for many platforms (for example Reddit, Xiaohongshu) that can be cheaper and more robust than driving pages by hand.

## Flow

1. `opencli.status` checks the daemon, extension, and Browser Bridge. Do not infer connectivity from `runtime.status` alone: it only shows the config switch.
2. `opencli.catalog` finds exact command names. Filter instead of dumping everything.

```json call
{"action":"opencli.catalog","args":{"site":"reddit","access":"read","limit":10}}
```

3. `opencli.run` runs one command with verbatim arguments after `opencli`.

```json call
{"action":"opencli.run","args":{"args":["reddit","search","dsh","-f","json"]}}
```

## Notes

- `access` in the catalog is the adapter's own declaration, not a guarantee. Treat `write` commands (post, delete) as irreversible and expect an approval prompt.
- `opencli.run` can reuse the logged-in Chrome profile, so it asks for approval unless the user chose `unrestricted`.
- Pass `-f json` where supported so the output is easy to read.
- Chinese community sites usually need a domain-scoped AuthProfile configured by the user; if a command reports a login problem, tell the user rather than trying to log in.
