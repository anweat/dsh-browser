# dsh-browser

English | [中文](https://github.com/anweat/dsh-browser/blob/master/README.md)

A browser runtime plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH). It lets the model open web pages, read them, operate them, take screenshots and download files, and it provides the `browser` service that `dsh-web-search-pro` builds on. The plugin ships the Playwright and Patchright drivers; **it does not download a browser**: if Google Chrome or Microsoft Edge is installed, it uses that.

> The detailed guides under `docs/guide/` are written in Chinese. This README covers everything you need to install, configure and try the plugin in English.

## Highlights

- **Two always-on tools**: `browser_index` (browse the catalog) and `browser_call` (run an action). About 325 tokens of resident context; 41 actions in 9 groups, with the schema of one action shown on demand.
- **No browser download needed**: the system Chrome or Edge is detected automatically; Playwright's Chromium is installed (`runtime.install`) only when neither exists. Patchright is an optional engine.
- **Strict locators and structured observation**: semantic locators (`role` / `name` / `label` / `text` / `testId`); a locator that matches several elements does nothing and lists the candidates. `observe.read` returns controls, links and tables with locators you can pass straight to `act.*`.
- **Per-session isolation and four automation modes**: every session gets its own browser context. `read-only`, `standard`, `autonomous` and `unrestricted` decide what is possible and what goes through DSH's native approval.
- **Login state, downloads and rate limits**: domain-scoped `authProfile`s, downloads saved with a sha256, `usagePolicy` caps for concurrency and bursts. The model can tighten these through policy actions, or loosen them with approval.
- **Reusable automation (experimental)**: recipe and UserScript assets that are recorded, searched, tested and activated by hand. OpenCLI site adapters are optional.

Security boundaries and the September 2026 review are in [AUDIT.md](https://github.com/anweat/dsh-browser/blob/master/AUDIT.md) (written against 0.1.12, partly outdated; in Chinese). Note that `allowedDomains` only limits which login state is loaded. It is not a network firewall or an agent isolation boundary.

## Compatibility

| Plugin | DSH | Peer ranges |
|---|---|---|
| `0.2.2` (current) | `0.2.0-rc.2`, `0.2.1-rc.2` to `rc.4` (tested on 0.2.0-rc.2, 0.2.1-rc.3, 0.2.1-rc.4) | DSH packages `>=0.2.0-rc.2 <0.2.1-0 \|\| >=0.2.1-rc.2 <0.2.2-0`; `@deepseek-ai/cordis` `~4.0.4` |
| `0.1.17` (pin this on 0.1.7-line hosts) | `dsh-v0.1.7-rc.2` | the older `browser_*` tool set |

Host versions outside these ranges are not verified. Older versions and upgrade notes are in the [CHANGELOG](https://github.com/anweat/dsh-browser/blob/master/CHANGELOG.md) (Chinese). Why the peer range has two segments is explained in [docs/dev/host-compat.md](https://github.com/anweat/dsh-browser/blob/master/docs/dev/host-compat.md) (Chinese).

## Installation

**DSH CLI** (using the `web` profile as an example):

```bash
dsh plugin --profile web add @anweat/dsh-browser@0.2.2
# On a host of the 0.1.7 line (dsh-v0.1.7-rc.2), pin 0.1.17 instead:
dsh plugin --profile web add @anweat/dsh-browser@0.1.17
# Restart the profile after installing (the web profile runs without HMR):
dsh --profile web
```

**DSH Desktop**: the Desktop profile is owned by the application, and the CLI refuses it (`profile "desktop" is managed exclusively by the Electron application`). Install from inside the app:

1. Open the **Plugins** page and click **Add plugin**.
2. Enter the package name, optionally with a version: the same text that follows `dsh plugin add`, for example `@anweat/dsh-browser@0.2.2`.
3. The dialog also lets you choose a **Registry**. A mirror (for example npmmirror in China) can lag the official registry by minutes to hours; if the new version cannot be found, switch the Registry to `https://registry.npmjs.org`.
4. Click **Install**, then restart when the app asks.

Upgrading a third-party plugin means uninstalling it and installing it again.

**Local directory or tarball** (for development):

```bash
dsh plugin --profile web add ./dsh-browser            # a local checkout
pnpm pack && dsh plugin --profile web add ./anweat-dsh-browser-0.2.2.tgz
```

A local source checkout may carry a different version number than the published one; align the versions in the profile's `pnpm-workspace.yaml` and install again. With pnpm 11, `dsh plugin add` should succeed with exit code 0; editing the profile's `package.json` by hand is only a troubleshooting step.

## First use

1. **Find the settings card after the restart.** In the settings page, open Plugins; the card of `@anweat/dsh-browser` is titled "Browser automation" (the Chinese UI says 浏览器自动化). The **status summary** at its top describes the environment:
   - a red "no usable browser" badge: click "details" for steps you can follow;
   - "Browser: system Chrome / Edge": the normal state, nothing to do;
   - "OpenCLI not installed": a hint, not a warning.
2. **Confirm the browser.** Ask the model to call `browser_call({action:"runtime.status"})` (or read the status summary); `browser.ready` should be `true`.
   - Chrome or Edge present: used automatically, nothing is downloaded. Once Playwright's Chromium has been downloaded, it takes precedence. With `executablePath` set, or `channel` set to `chrome` / `msedge`, exactly that browser is used and a missing one is an error.
   - Neither present: install Chrome or Edge; or have the model call `runtime.install` (about 190 MB, asks for approval); or set `executablePath`. All options are in [runtime and dependencies](https://github.com/anweat/dsh-browser/blob/master/docs/guide/runtime-and-dependencies.md) (Chinese).
3. **Optional dependencies.**
   - **OpenCLI** is used only by the `opencli.*` actions and by Web Search Pro's `browser-opencli` backend. Run `npm i -g @jackwener/opencli`, restart, then call `opencli.status`. Without it everything else works, and `dsh plugin add` does not fail. The lookup order and troubleshooting are in [login state and OpenCLI](https://github.com/anweat/dsh-browser/blob/master/docs/guide/login-and-opencli.md) (Chinese).
   - **dsh-web-search-pro** consumes this plugin's browser through `inject: ['browser']`. The two install independently, but its browser-based features need this plugin present.

## Quick examples

**A local development server** (for example a Vite app on `http://127.0.0.1:5173`). First set this in the settings card, or in the profile configuration:

```yaml
- insert:
    - id: browser
      name: '@anweat/dsh-browser'
      config:
        channel: chrome            # always use the local Chrome; omit for automatic choice
        headless: true             # the default: no window
        automationMode: autonomous # needed when the session's approval policy is "never", see below
```

Save, restart the profile, then the model calls `browser_call` in turn:

```text
# each line is the arguments of one browser_call
{"action":"target.open","args":{"url":"http://127.0.0.1:5173"}}
{"action":"observe.read","args":{"sections":["controls","tables"]}}
{"action":"act.click","args":{"locator":{"role":"columnheader","name":"Name"}}}
{"action":"observe.screenshot","args":{"filename":"dev-home.png"}}     → result.path
# then call the host's read_image tool
read_image({"file_path":"<the path returned by the previous step>"})
```

- `target.open` on a loopback address needs no extra permission and no auth profile.
- **Approval**: under `standard` (the default) `act.*` goes through DSH approval. When the session's approval policy is `never`, every action that would ask is rejected automatically; set `automationMode` to `autonomous` and page interactions run directly. `script.evaluate` and `act.upload` still ask under `autonomous`; only `unrestricted` skips them.
- **Login state**: to use a login state on a local address, configure `authProfiles` with `allowedDomains: [127.0.0.1]` (the state file must exist). If you want the agent to write such a loopback or private-network domain itself through `runtime.set_auth_profile`, `allowPrivateHosts: true` is required (off by default). Loosening is rejected when the approval policy is `never`, so put it in the configuration yourself.
- **Screenshots**: `observe.screenshot` saves into `snapshotDir` (default `$DSH_HOME/data/browser/snapshots`) and returns `path`; pass it to the host's `read_image` tool (parameter `file_path`) to see the image. `read_image` belongs to the host, not to this plugin. The result of `target.open` also carries a full-page screenshot path.
- A fixed viewport (a phone size, say): the `viewport` argument of `target.open`, or the `viewportMode` setting; see [downloads and context options](https://github.com/anweat/dsh-browser/blob/master/docs/guide/downloads-and-context.md) (Chinese).

**A public page**: `target.open`, then `observe.read` for the text and `observe.screenshot` for an image. Forms use `act.fill` and `act.click`, which ask once per call under `standard`.

## Tools and actions at a glance

The model first looks at the catalog with `browser_index` (no arguments: groups and environment state; `{group}`: the actions of a group; `{action}`: the full parameter schema; `{query}`: keyword search), then runs `browser_call({action, args})`. Every action returns the same envelope, `{ok, action, executionStatus, result | error{code,message,hint}}`. Setting `toolSurface` to `flat` registers one tool per action instead (about 17.4k tokens resident; for comparison and debugging only).

| Group | Purpose |
|---|---|
| `runtime` | runtime status, Chromium install, policy overlay for auth profiles and usage limits |
| `target` | open / close / list / switch pages, download files |
| `observe` | read page text, structured observation (controls / links / tables), screenshots |
| `act` | click, fill, type, clear, press, select, check, hover, scroll, upload, wait |
| `inspect` | console and failed requests, download records, the effective policy |
| `script` | page JavaScript, built-in read-only scripts, UserScripts |
| `automation` | search and run reusable assets, develop drafts, inline recipes |
| `crawl` | bounded multi-page crawl |
| `opencli` | OpenCLI site adapters |

The full action catalog, error codes, strict locators and approval rules are in [tools and actions](https://github.com/anweat/dsh-browser/blob/master/docs/guide/tools-and-actions.md) and [automation modes and approval](https://github.com/anweat/dsh-browser/blob/master/docs/guide/automation-modes.md) (Chinese). The package ships a `dsh-browser` skill that teaches the model to reuse first, locate carefully and handle failures by error code.

Callers and operators are responsible for judging, under the target site's rules and the applicable requirements, whether any page access, interaction, script, cookie use, upload or download is allowed. The plugin only performs the browser operations that were requested or approved; it does not judge whether a purpose is authorized by a site.

## Common settings

Change them in the settings card, or in the profile configuration (a fully commented example is in the [configuration reference](https://github.com/anweat/dsh-browser/blob/master/docs/guide/configuration.md), in Chinese). **A saved change needs a profile restart to take effect** (only prompt text overrides are read on every call).

| Key | Default | Meaning |
|---|---|---|
| `automationMode` | `standard` | `read-only` \| `standard` (writes ask each time) \| `autonomous` (page interaction runs directly) \| `unrestricted` (no approval at all; isolated environments only) |
| `toolSurface` | `indexed` | `indexed`: two resident tools; `flat`: one tool per action |
| `channel` | `chromium` | `chromium` (Playwright's Chromium, falling back to system Chrome / Edge when not installed) \| `chrome` \| `msedge` (pinned) |
| `headless` | `true` | `false` shows the browser window |
| `executablePath` | empty | absolute path of a custom browser executable |
| `browserRuntime` | `playwright` | `patchright`: Chromium only, friendlier to automation detection |
| `opencliEnabled` | `true` | master switch for OpenCLI; without OpenCLI installed it only makes `opencli.*` unavailable |
| `authProfiles` / `defaultAuthProfile` | empty | domain-scoped login states (`allowedDomains`, `storageStatePath`, `persistState`) |
| `allowPrivateHosts` | `false` | lets the agent put localhost and private-network addresses into login domains |
| `downloadDir` / `downloadMaxBytes` | `$DSH_HOME/data/browser/downloads` / 100 MiB | download directory and per-file cap |

Also available: viewport, `userAgent`, `locale`, `timezoneId` and proxy (`viewportMode`, `proxyServer`, ...), `usagePolicy` rate limits, `automationAssets` and `prompts`; see the configuration reference.

## Documentation

- User guides (Chinese): the [documentation index](https://github.com/anweat/dsh-browser/blob/master/docs/README.md) lists every file under `docs/guide/`: configuration reference, settings card, tools and actions, Playwright recipes, automation assets, approval, policy overlay, usage policy, downloads and context options, login state and OpenCLI, runtime and dependencies, prompt text, UserScripts, the `browser` service.
- [CHANGELOG](https://github.com/anweat/dsh-browser/blob/master/CHANGELOG.md): compatibility and upgrade notes per version (Chinese).
- Developer docs: [docs/dev/](https://github.com/anweat/dsh-browser/blob/master/docs/dev/build-and-release.md) (build and release, host compatibility) and [docs/validation/](https://github.com/anweat/dsh-browser/tree/master/docs/validation) (validation records).

## License

MIT
