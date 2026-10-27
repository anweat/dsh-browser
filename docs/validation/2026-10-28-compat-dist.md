# 2026-10-28 发布前验证：DSH 0.2.0-rc.2 兼容与 npm 分发（@anweat/dsh-browser 0.2.2）

分支 `dev/0.2.2`。两件事：(1) 同时支持 DSH 0.2.0-rc.2 与 0.2.1-rc.2 ~ rc.4；(2) 干净安装、OpenCLI、Playwright 浏览器。
全部在隔离的 `DSH_HOME` 里做，没有读写 `~/.dsh`（见末尾“环境与已知例外”），没有跑模型会话、登录类命令和 opencli 站点命令。
截图在仓库外：`research/experiments/release-0.2.x-2026-10-28/browser-*`。

## 1. 宿主与方法

| 宿主 | 来源 | Cordis |
|---|---|---|
| 0.2.0-rc.2 | `npm i @deepseek-ai/dsh@0.2.0-rc.2`（官方源）装进 scratchpad 的隔离目录 | 宿主声明 `~4.0.4`，新装解析到 4.0.5；另装了一份把 Cordis 覆盖成 **4.0.4** 的宿主（0.2.0-rc.2 发布当时的版本） |
| 0.2.1-rc.3 | 同上 | 4.0.5 |
| 0.2.1-rc.4 | 同上 | 4.0.5 |

- 插件按 npm 用户的方式装：`pnpm pack` 出 tgz，`dsh plugin --profile <p> add <tgz>`（pnpm 11.7.0，嵌套 pnpm 用 PATH 垫片固定版本）。同一个 profile 目录里同时装 WebSearch。
- 用的 WebSearch：`artifacts/releases/dsh-web-search-pro-0.2.3-dev.1.tgz`（rc.3 / rc.4）。**这个 tgz 的 peer 只覆盖 `>=0.2.1-rc.2 <0.2.2-0`，在 0.2.0-rc.2 上被宿主的安装闸门拒绝**（`incompatible with dsh 0.2.0-rc.2`，宿主随即回滚 package.json / lockfile / node_modules，这个回滚行为是对的）。0.2.0-rc.2 上改用 WebSearch 分支 HEAD（`788657a`，peer 已放宽）打出的 tgz。
- 没有模型的“headless”检查：宿主的 headless 档位只能“回答一个任务并退出”，必须调模型。所以用宿主自己的 `cordis`、`dsh-system-prompt`、`dsh-tools`（ToolRuntime）、`dsh-skill` 起一个 Context，把 headless profile 里**已安装**的两个插件挂上去，通过 `ToolRuntime.execute` 调 `browser_index`、`browser_call`、`web_index`，列技能。这条路径过 `tools/pre-execute` 钩子和宿主的参数校验。
- Web：`dsh --profile web --no-open --port 3398`，用 Playwright 驱动设置卡片，截图并保存一项。

## 2. 任务 1：0.2.0-rc.2 适配（成本低，已做）

**结论：不需要改源码，只改 peer 范围。** 比较方式是真机验证，而不是只读源码：

| 宿主接口（brief 点名的） | 在 0.2.0-rc.2 上的结果 |
|---|---|
| 设置保存：原子 `settings/mutate`、字段路径写入、`.volatile()` | 卡片里改 `opencliEnabled` 并点保存，`cordis.patch.yml` 里写入 `browser.config.opencliEnabled: false`；再用 `settings/mutate` 设 `prompts.rootNote`，`/dsh-browser-assets/prompts` 立刻报 `overrides: [{key: rootNote}]`，不重启（`.volatile()` 的活引用、提示文本按调用实时读取成立） |
| RPC：`connection` + `webServer` | `scripts/check-host-rpc.mjs`（宿主真实的认证 / HTTP 栈）在三个宿主上都 PASS；Web 卡片的 `policy` / `prompts` / `runtime` 端点都走通 |
| 凭据 API | 插件不使用（代码里的 “credential” 指测试凭据记录） |
| `dsh-client-ui-primitives` | 0.2.0-rc.2 的 Web 前端里卡片渲染、弹窗（登录 profile、提示词）、下拉、开关都正常，无页面错误 |
| skill 注册 | `skills.registerProvider(create)` 签名在三个宿主一致；挂载后 `skills.list()` 出现 `dsh-browser` |
| `ctx.fiber.config` 热更新 | 插件不读 `fiber.config`；活读取走 `.volatile()` 引用，见第一行 |
| `tools/pre-execute` 与审批服务 | `standard` 模式 + 没有审批服务时 `act.click` 被拒（“Run a direct Playwright page interaction: act.click #x”），三个宿主一致；`browser_index` 不触发询问 |

Cordis：插件只把 Cordis 当类型用，peer 取 `~4.0.4`（0.2.0-rc.2 宿主声明 `~4.0.4`，0.2.1 线声明 `~4.0.5`）。在把 Cordis 固定为 4.0.4 的 0.2.0-rc.2 宿主上也完成了挂载、工具注册、skill 注册（探针）。

改动：
- `package.json`：dsh peer 全部改成 `>=0.2.0-rc.2 <0.2.1-0 || >=0.2.1-rc.2 <0.2.2-0`，Cordis peer `~4.0.4`。每一段的下界都自带同号预发布，两种解析模式（宿主 `includePrerelease` 与 npm 默认）都通过；用真 `semver` 交叉核对过。
- `test/compat/check-peer-ranges.js`：受支持基线 0.2.0-rc.2 / 0.2.1-rc.2 / rc.3 / rc.4；必须拒绝 0.1.7-rc.2、0.2.0-rc.1、0.2.1-alpha.*、0.2.1-rc.1、0.2.2-alpha.1、0.2.2；`--selftest` 增到 21 条。
- `devDependencies` 仍锁 `0.2.1-rc.3`（类型与单测按这一版）；rc.2 与 rc.4 靠真实宿主验证，不进 devDependencies（README 写明）。rc.3 / rc.4 里客户端包（primitives、slots、plugin-manager 等）已并入 `dsh-web-frontend` 的构建产物，所以 Web 前端的契约只能在真实页面里验证——这就是上面用 Playwright 驱动三个宿主的原因。
- README 兼容表、`cordis.patch.yml` 头注释。

## 3. 三个宿主上的验证（最终包）

每个宿主：全新 `DSH_HOME`，web 与 headless 两个 profile 各自 `dsh plugin add <browser tgz> <websearch tgz>`，空的 `PLAYWRIGHT_BROWSERS_PATH`（模拟没下载过 Playwright 浏览器）。

| 检查 | 0.2.0-rc.2 | 0.2.1-rc.3 | 0.2.1-rc.4 |
|---|---|---|---|
| `dsh plugin add`（web / headless）退出码 | 0 / 0 | 0 / 0 | 0 / 0 |
| 两个插件都进入 profile 的 bundles | 是 | 是 | 是 |
| `--dump-config`（web / headless）含两个插件的层 | 是 | 是 | 是 |
| 挂载后注册的工具 | `browser_index`、`browser_call`、`web_index`、`web_call` | 同 | 同 |
| 技能 | `dsh-browser`、`dsh-web-search-pro` | 同 | 同 |
| `browser_call` 打开本机 fixture 并读取页面（系统 Chrome，没有 Playwright Chromium） | 成功，`browser.source: system-browser` | 同 | 同 |
| Web 设置卡片渲染（27 个字段、9 个分组、全部展开无页面错误） | 是 | 是 | 是 |
| 卡片里登录 profile 弹窗、提示词弹窗打开 | 是 | 是 | 是 |
| 在卡片里保存一项并写入 profile 的 patch | 是 | 是 | 是 |
| 状态摘要显示“浏览器：系统 Chrome / Edge” | 是 | 是 | 是 |

截图：`research/experiments/release-0.2.x-2026-10-28/browser-<宿主>-tour-2-card.png`、`-6-auth-dialog.png`、`-7-prompt-dialog.png`、`-save-4-saved.png`。

## 4. 任务 2：干净安装问题与修法

### 4.1 修复前：`dsh plugin add` 失败（rc.4，pnpm 11.7.0，全新 `DSH_HOME`）

```
$ dsh plugin --profile web add <browser 0.2.2 tgz>
dsh: initialized profile web at ...
Packages: +22
Progress: resolved 22, reused 21, downloaded 1, added 22, done
[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: @jackwener/opencli@1.8.8
Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.
dsh: plugin command failed; diagnostics: .../.plugin-manager/logs/operation-XXXX/pnpm.log
exit 1
```

- pnpm 12.4.2 同样失败（`Error: ERR_PNPM_IGNORED_BUILDS ... Ignored build scripts: @jackwener/opencli@1.8.8`）。
- 失败后 `pnpm-workspace.yaml` 被写入占位 `allowBuilds: '@jackwener/opencli': set this to true or false`；`package.json` 已有该依赖，`node_modules` 里包也在。
- **更严重**：宿主只对“这一次新增的依赖”把插件加进 `dsh.profile.bundles`（`reconcile`：跳过 `beforeDeps` 里已有的名字）。失败的那次 `add` 没走到这一步，之后用户照提示把 `allowBuilds` 改成 `false` 再 `add`，**退出码 0，但 bundles 里没有这个插件**——插件从来没被启用，没有任何提示。
- WebSearch 被连带：单独 `add` WebSearch tgz 成功（退出 0）；把 Browser 与 WebSearch 放在一条命令里，整条失败，两个都没进 bundles；先 Browser（失败）再单独 WebSearch，WebSearch 也失败（同一个 `ERR_PNPM_IGNORED_BUILDS`，因为 opencli 还留在 profile 里）；用户改 `allowBuilds` 后两个都重试成功（退出 0），**两个插件都不在 bundles**。
- `optionalDependencies` 没用：把 opencli 改成可选依赖后同样的失败（试验见下）。
- `bundledDependencies` 也不行：`pnpm pack` 报 `ERR_PNPM_BUNDLED_DEPENDENCIES_WITHOUT_HOISTED`，要求把仓库改成 hoisted，侵入太大，放弃。

### 4.2 OpenCLI 在插件里做什么、build script 做什么

- 用途：只给 `opencli.status` / `opencli.catalog` / `opencli.run`（站点 adapter、Chrome Browser Bridge），以及 `BrowserService.opencli()`（WebSearch 的 `browser-opencli` 后备后端调用）。浏览器工具、Playwright 都不依赖它。
- opencli 1.8.8 的 `postinstall`：`scripts/postinstall.js` 只做两件事——删除 `@mixmark-io/domino/test`（约 7 MB 的无用测试文件）；只在**全局安装**且非 CI 时写 shell 补全文件、`~/.opencli/spotify.env` 模板并打印 Browser Bridge 提示。`scripts/fetch-adapters.js` 只在全局安装或设置 `OPENCLI_FETCH=1` 时运行，且不联网。`prepare` 在没有 `src` 的发布包里直接退出。**不跑它们不影响任何功能**（实测：profile 里 `allowBuilds: false` 的 opencli 一直可用）。

### 4.3 选择与实现

选择：**把 OpenCLI 从依赖里去掉，改成可选组件，运行时检测。**（按 brief 的第二档，并附在状态里说明怎么装。）
- `package.json`：`dependencies` 只剩 `playwright`、`patchright`；`@jackwener/opencli` 变成可选 peer（`peerDependenciesMeta.optional`）和 devDependency（单测用）。
- `src/deps.ts` 的 `locateOpencli()`：`DSH_BROWSER_OPENCLI`（包目录 / `main.js` / `opencli` 启动器，写错了不悄悄换别的）→ 插件自己的（pnpm 虚拟库、profile 的 hoisted `node_modules`）→ `PATH` 上的 `opencli` 启动器（Unix 的符号链接、Windows 的 `.cmd` 垫片）→ `npm root -g`（整个进程只问一次）→ 常见全局目录（Homebrew、`~/.npm-global`、Bun、Volta，nvm / fnm 每个 Node 版本的全局目录，新版本优先）。最后一档是为桌面版准备的：从程序坞启动的 Electron 没有 shell 的 `PATH`。
- 实测：`PATH=/usr/bin:/bin`（桌面版那种）下仍由 `common-prefix` 找到 fnm 下的全局 opencli；`DSH_BROWSER_OPENCLI` 指向不存在的文件时，状态里是“未安装”并点名这个变量。
- `runtime.status`：新增 `opencliSource`、`opencliInstallHint`；未安装**不再进入 `runtimeWarnings`**（它是可选组件，每个新用户都看到警告是噪音）。`opencli.*` 在找不到时返回“OpenCLI is not installed (optional...) `npm i -g @jackwener/opencli`...”。
- 设置卡片：状态摘要里“OpenCLI 未安装”徽章；详情弹窗的“运行环境说明（不是警告）”里有安装命令。
- 升级影响（README 已写）：已经依赖内置 OpenCLI 的 profile，升级后它会从 profile 里消失，需要 `npm i -g @jackwener/opencli`；全局装过的不受影响。WebSearch 的 `browser-opencli` 后备后端同样依赖这份安装（WebSearch 自己优先用独立的 `opencli`）。

### 4.4 修复后（rc.4，pnpm 11.7.0，全新 `DSH_HOME`，冷 pnpm 存储）

```
$ dsh plugin --profile web add <browser tgz> <websearch tgz>
dsh: initialized profile web at ...
Progress: resolved 0, reused 0, downloaded 1, added 0
dependencies:
+ @anweat/dsh-browser file:...anweat-dsh-browser-0.2.2.tgz
+ dsh-web-search-pro file:...dsh-web-search-pro-0.2.3-dev.1.tgz
Packages: +25
Progress: resolved 25, reused 0, downloaded 25, added 25, done
Done in 1.1s using pnpm v11.7.0
exit 0
```
- 没有任何 `ERR_PNPM_IGNORED_BUILDS`、没有 `pnpm-workspace.yaml` 占位；`bundles` 含两个插件；`pnpm-workspace.yaml` 保持宿主默认。
- 体积与时间：Browser tgz 约 658 KB；两个插件装完 `node_modules` 约 50 MB（修复前只装 Browser 就是 66.8 MB，两个 75.6 MB；其中 opencli 本身 12.9 MB）。其中 `playwright` 5 MB、`playwright-core` 13.6 MB，`patchright` / `patchright-core` 同量级（两套驱动各一份）。冷存储下 pnpm 部分 1.1 秒（镜像源）。
- 安装期间**不下载浏览器**：`playwright`（1.64.1）、`playwright-core`、`patchright`（1.64.2）、`patchright-core` 都没有 `install` / `postinstall` / `prepare` 脚本，pnpm 没有报告被忽略的脚本。

## 5. Playwright 浏览器

新用户没有 Playwright 的 Chromium，原来 `channel: chromium` 的默认配置在第一次用时只会说 “chromium is not installed ... run runtime.install”，哪怕机器上有 Chrome。

实现（`src/system-browser.ts` + `browser-service.ts`）：
- 默认 `channel: chromium`、没有 `executablePath`、没开 `autoInstall` 时，Playwright 的 Chromium 不存在就改用系统 Google Chrome / Microsoft Edge（macOS `/Applications` 与 `~/Applications`，Windows 的 Program Files / LocalAppData，Linux 常见路径），以 `executablePath` 启动。装好 Playwright Chromium 后自动改回用它。
- **显式配置不被替换**：`executablePath` 写错、`channel` 设成没装的 `msedge` 都直接报错并点名是哪个设置；`autoInstall: true` 仍然下载（不改用系统 Chrome）。
- 都没有时，`runtime.status.browser.ready: false`，`browser.installAdvice`、启动失败的错误（错误码 `CAPABILITY_UNAVAILABLE`，不是 `ACTION_FAILED`）、`browser_index` 根视图、设置卡片摘要（红色“没有可用浏览器”徽章，详情里有步骤）给出同一组可照做的选项：装 Chrome / Edge；`runtime.install`；终端命令 `PLAYWRIGHT_BROWSERS_PATH="..." node ".../playwright/cli.js" install chromium`（用本机实际路径）；设 `executablePath` / `channel`。
- `runtime.status` 新增 `browser {ready, source, path, note, installAdvice}` 与 `systemBrowsers`；`chromiumInstalled`、`chromiumExecutablePath` 照旧。

实测（rc.3 / rc.4 / rc.2，空 `PLAYWRIGHT_BROWSERS_PATH`，本机 Google Chrome 156）：
- 没有 Playwright Chromium、有 Chrome：`target.open` 本机 fixture 成功，`observe.read` 读到页面文字；`browser.source: system-browser`。
- 模拟没有任何 Chrome / Edge（预加载里让 `fs.statSync` 对这些路径抛 ENOENT）：`target.open` 返回 `CAPABILITY_UNAVAILABLE`，消息是上面那组选项；`browser_index` 根视图有 “Chromium is NOT installed and no system Chrome / Edge was found: ...”。
- `runtime.install`（unrestricted、空目录）：约 24 秒，下载 Chrome for Testing 156（185.8 MiB）+ headless shell + ffmpeg，磁盘约 586 MB；之后 `browser.source` 变成 `playwright-chromium`。README、错误信息、设置里写的“约 190 MB 下载”来自这次实测（最初的 “150 MB” 估计偏低）。
- 设置卡片（rc.4 真实 Web 页面，截图 `browser-0.2.1-rc.4-<变体>-notices.png`）：
  - 默认：摘要“浏览器：系统 Chrome / Edge”，详情弹窗“运行环境说明（不是警告）”里写明正在用系统 Chrome；无警告；
  - 桌面版那种最小 `PATH=/usr/bin:/bin`：OpenCLI 仍被找到，`source: common-prefix`（fnm 的全局目录）；
  - `DSH_BROWSER_OPENCLI` 写错：摘要“OpenCLI 未安装”，详情里先点名这个变量再给安装命令，0 条警告；
  - 配置 `channel: msedge`（本机没有 Edge）：红色“没有可用浏览器”，“1 条警告”，详情里写明是 `channel` 的问题和改法。
- 单测用注入的“机器描述”覆盖：各平台路径检测、规划矩阵（回退 / 显式配置 / autoInstall）、状态、启动错误、`browser_index` 提示、卡片徽章（含真实 Chromium 里的 e2e）。

## 6. 测试结果

- `pnpm run verify`（typecheck、`test:peers`、build、462 项单测、client bundle 检查）：通过。
- `pnpm run test:e2e`（真实 Chromium，隔离 `DSH_HOME`）：96 / 96 通过（原 95 + 新增 1 项 “runtime notices”）。第一版实现里，设置卡片的 e2e 曾有 5 项超时：假 RPC 对未知端点回 `{}`，客户端把它当成运行状态去读 `browser.ready` 而崩了；已改成只接受形状正确的回复（`isRuntimeView`），并让运行状态读取不阻塞策略报告。
- 新增：`test/system-browser.test.ts`（9）、`test/opencli-locate.test.ts`（4）、RPC `runtime` 端点、卡片摘要徽章、`actions.test.ts` 的错误码映射行。
- Playwright 版本：仓库锁 1.62.1；新用户 `playwright@^1.60.0` 解析到 1.64.1 / patchright 1.64.2，真实宿主验证用的是后者。

## 7. 环境与已知例外

- 规则里的 `DSH_HOME` 隔离：最后一轮 `verify` / e2e 使用了隔离的 `DSH_HOME`。**早先的几轮单测和我自己第一次的探针没有设置 `DSH_HOME`**，默认的 `~/.dsh/data/browser/snapshots` 里因此多了测试和探针写的截图（单测里有几个真实浏览器用例使用默认截图目录，这是仓库既有行为，按时间聚类看每轮约 5 张）。探针那一张我已删除；单测的几张与其他会话的文件混在一起，没有逐个认领，未删除。建议以后在 brief 里让 `pnpm test` 也带 `DSH_HOME`。
- 没有占用 19387；Web 验证用 3398；没有动桌面端、没有读凭据文件、没有跑模型。
