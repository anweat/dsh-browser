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

## Versions

`runtime.status` shows `opencliVersion`. The plugin supports OpenCLI 1.8.x and 2.x; results are the same shape for you except:

- `opencli.catalog` on 2.x has no strategy, and a result of up to 10 commands carries its arguments (from the command's own help). Commands are written `site name` on 2.x and `site/name` on 1.8; pass them to `opencli.run` as separate words (`["reddit","search",...]`).
- A failed 2.x command returns `error: {code, message, hint}` next to `output`; 1.8 returns its text.
- `opencli browser` names its session by version. 1.8: positional (`["browser","research","open",URL]`). 2.x: `--session` (`["browser","--session","research","open",URL]`). Pick by `opencliVersion`; arguments are never rewritten for you.

## Notes

- `access` in the catalog is the adapter's own declaration, not a guarantee. Treat `write` commands (post, delete) as irreversible and expect an approval prompt.
- `opencli.run` can reuse the logged-in Chrome profile, so it asks for approval unless the user chose `unrestricted`.
- Pass `-f json` where supported so the output is easy to read.
- Chinese community sites usually need a domain-scoped AuthProfile configured by the user; if a command reports a login problem, tell the user rather than trying to log in.
