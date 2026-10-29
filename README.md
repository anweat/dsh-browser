# dsh-browser

[English](https://github.com/anweat/dsh-browser/blob/master/README.en.md) | 中文

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）的浏览器运行时插件：让模型打开网页、读取内容、操作页面、截图、下载文件，也为 `dsh-web-search-pro` 提供 `browser` 服务。插件自带 Playwright / Patchright 驱动，**浏览器本身不随插件下载**：装了 Google Chrome 或 Microsoft Edge 就直接用。

## 亮点

- **两个常驻工具**：`browser_index`（看目录）+ `browser_call`（执行动作），常驻上下文约 325 token；41 个动作分成 9 组，按需查看单个动作的 schema。
- **不用先下载浏览器**：自动检测系统 Chrome / Edge；都没有时才用 `runtime.install` 安装 Playwright Chromium。可选 Patchright 内核。
- **严格定位与结构化观察**：`role` / `name` / `label` / `text` / `testId` 语义定位，匹配多个元素时不执行并列出候选；`observe.read` 可直接给出可用于 `act.*` 的 controls / links / tables。
- **按 session 隔离、四档自动化自由度**：每个 session 独立的浏览器 context；`read-only` / `standard` / `autonomous` / `unrestricted` 决定能做什么、哪些要走 DSH 原生审批。
- **登录态、下载与限流**：按域名限定的 `authProfile`，下载落盘带 sha256，`usagePolicy` 限制并发与突发；模型可通过策略动作收紧或（经审批）放宽。
- **可复用自动化（实验性）**：recipe / UserScript 资产的积累、检索、测试与手动激活；OpenCLI 站点 adapter 可选。

安全边界与 2026-09 的审查记录见 [AUDIT.md](https://github.com/anweat/dsh-browser/blob/master/AUDIT.md)（基于 0.1.12，部分内容已过时）：`allowedDomains` 只限制登录态装载，不是网络防火墙或 Agent 隔离边界。

## 兼容性

| 插件 | DSH | peer 范围 |
|---|---|---|
| `0.2.2`（当前） | `0.2.0-rc.2`、`0.2.1-rc.2` ~ `rc.4`（实测 0.2.0-rc.2、0.2.1-rc.3、0.2.1-rc.4） | DSH 包 `>=0.2.0-rc.2 <0.2.1-0 \|\| >=0.2.1-rc.2 <0.2.2-0`；`@deepseek-ai/cordis` `~4.0.4` |
| `0.1.17`（0.1.7 线宿主固定用这一版） | `dsh-v0.1.7-rc.2` | 旧的 `browser_*` 工具体系 |

范围之外的宿主版本未经验证。历史版本、升级说明见 [CHANGELOG](https://github.com/anweat/dsh-browser/blob/master/CHANGELOG.md)；peer 范围为什么写成两段见 [docs/dev/host-compat.md](https://github.com/anweat/dsh-browser/blob/master/docs/dev/host-compat.md)。

## 安装

**DSH CLI**（以 `web` profile 为例）：

```bash
dsh plugin --profile web add @anweat/dsh-browser@0.2.2
# 宿主仍是 0.1.7 线（dsh-v0.1.7-rc.2）时，固定安装 0.1.17：
dsh plugin --profile web add @anweat/dsh-browser@0.1.17
# 装完重启 profile（web profile 关闭了 HMR）：
dsh --profile web
```

**DSH Desktop**：profile 由应用管理，CLI 对 `--profile desktop` 会直接报错（`profile "desktop" is managed exclusively by the Electron application`），请在应用里装：

1. 打开**插件**页，点 **Add plugin**。
2. 填包名，可带版本，即上面 `dsh plugin add` 后面那一段，例如 `@anweat/dsh-browser@0.2.2`。
3. 对话框里还能选 **Registry**。国内镜像（如 npmmirror）可能比官方源晚几分钟到几小时，装不到新版本时，把 Registry 换成 `https://registry.npmjs.org`。
4. 点 **Install**，装完按应用提示重启。

非官方插件的升级 = 先卸载再重装。

**本地目录 / tarball**（开发用）：

```bash
dsh plugin --profile web add ./dsh-browser            # 本地检出
pnpm pack && dsh plugin --profile web add ./anweat-dsh-browser-0.2.2.tgz
```

本地源码 checkout 的版本号可能与已发布的有出入，需要在 profile 的 `pnpm-workspace.yaml` 里对齐版本后重装。`dsh plugin add` 在 pnpm 11 下应当直接成功、退出码 0；排障时才需要手改 profile 的 `package.json`。

## 第一次使用

1. **重启后找到设置卡片**：设置页的“插件”里，`@anweat/dsh-browser` 的配置卡片标题是“浏览器自动化”。顶部**状态摘要**直接说明运行环境：
   - 红色徽章“没有可用浏览器”：点“查看详情”有可照做的步骤；
   - “浏览器：系统 Chrome / Edge”：正常状态，什么都不用做；
   - “OpenCLI 未安装”：只是提示，不是警告。
2. **确认浏览器**：让模型调用 `browser_call({action:"runtime.status"})`（或看状态摘要），`browser.ready` 为 `true` 即可。
   - 有 Chrome / Edge：自动使用，不下载任何东西。Playwright 的 Chromium 一旦下载过就改用它；填了 `executablePath`，或把 `channel` 设为 `chrome` / `msedge`，则固定用你指定的那个，找不到就报错。
   - 都没有：装 Chrome 或 Edge；或让模型调用 `runtime.install`（下载约 190 MB，会询问审批）；或在设置里填 `executablePath`。完整选项见 [内核与依赖](https://github.com/anweat/dsh-browser/blob/master/docs/guide/runtime-and-dependencies.md)。
3. **可选依赖**：
   - **OpenCLI**：只有 `opencli.*` 动作和 Web Search Pro 的 `browser-opencli` 后端用到。`npm i -g @jackwener/opencli`，重启后调用 `opencli.status`。不装不影响其他功能，也不会让 `dsh plugin add` 失败。查找顺序与排障见 [登录态复用与 OpenCLI](https://github.com/anweat/dsh-browser/blob/master/docs/guide/login-and-opencli.md)。
   - **dsh-web-search-pro**：它通过 `inject: ['browser']` 使用本插件的浏览器，两者可独立安装；搜索类浏览器能力需要本插件先在。

## 快速示例

**本地开发服务器**（例如 `http://127.0.0.1:5173` 的 Vite 应用）：先在设置卡片（或配置文件）里设置：

```yaml
- insert:
    - id: browser
      name: '@anweat/dsh-browser'
      config:
        channel: chrome            # 固定用本机 Chrome；省略则自动选择
        headless: true             # 默认值，不弹窗口
        automationMode: autonomous # 会话的审批策略为 never 时需要，见下
```

保存后重启 profile，然后模型依次调用 `browser_call`：

```text
# 以下每行是一次 browser_call 的参数
{"action":"target.open","args":{"url":"http://127.0.0.1:5173"}}
{"action":"observe.read","args":{"sections":["controls","tables"]}}
{"action":"act.click","args":{"locator":{"role":"columnheader","name":"Name"}}}
{"action":"observe.screenshot","args":{"filename":"dev-home.png"}}     → result.path
# 然后调用宿主的 read_image 工具
read_image({"file_path":"<上一步返回的 path>"})
```

- 访问本机地址的 `target.open` 不需要额外权限，也不需要登录 profile。
- **审批**：`standard`（默认）下 `act.*` 要走 DSH 审批；会话的审批策略为 `never` 时，所有需要询问的动作都会被自动拒绝，这时把 `automationMode` 设为 `autonomous`，页面交互就直接执行。`script.evaluate`、`act.upload` 在 `autonomous` 下仍会询问，只有 `unrestricted` 才跳过。
- **登录态**：要在本机地址上带登录态，配 `authProfiles`（`allowedDomains: [127.0.0.1]`，状态文件必须存在）。如果希望由 agent 经 `runtime.set_auth_profile` 自己写这类 loopback / 内网域名，需要 `allowPrivateHosts: true`（默认关）；在会话审批策略为 `never` 时放宽动作会被拒绝，请直接在配置里写。
- **截图**：`observe.screenshot` 把文件存进 `snapshotDir`（默认 `$DSH_HOME/data/browser/snapshots`），结果里的 `path` 交给宿主的 `read_image` 工具（参数 `file_path`）读成图片；`read_image` 由宿主提供，不是本插件的工具。`target.open` 的结果里也带全页截图路径。
- 需要固定视口（例如手机尺寸）：`target.open` 的 `viewport` 参数，或配置 `viewportMode`，见 [下载与上下文选项](https://github.com/anweat/dsh-browser/blob/master/docs/guide/downloads-and-context.md)。

**公开网页**：`target.open` → `observe.read` 读文本，`observe.screenshot` 截图；表单用 `act.fill` / `act.click`，`standard` 下每次询问一次。

## 工具与动作概览

模型先用 `browser_index` 看目录（无参数列出分组和环境状态；`{group}` 列动作；`{action}` 给完整参数 schema；`{query}` 关键词检索），再用 `browser_call({action, args})` 执行。所有动作返回同一种信封 `{ok, action, executionStatus, result | error{code,message,hint}}`。把 `toolSurface` 设为 `flat` 可以改成每个动作一个工具（常驻约 17.4k token，仅用于对照与调试）。

| 组 | 用途 |
|---|---|
| `runtime` | 运行时状态、Chromium 安装、登录 profile 与限流的策略覆盖层 |
| `target` | 打开 / 关闭 / 列出 / 切换页面，下载文件 |
| `observe` | 读页面文本、结构化观察（controls / links / tables）、截图 |
| `act` | 点击、填写、输入、清空、按键、选择、勾选、悬停、滚动、上传、等待 |
| `inspect` | console 与失败请求、下载记录、生效的策略 |
| `script` | 页面 JavaScript、内置只读脚本、UserScript |
| `automation` | 检索 / 运行可复用资产、开发草稿、内联 recipe |
| `crawl` | 有界多页遍历 |
| `opencli` | OpenCLI 站点 adapter |

完整动作目录、错误码、严格定位和审批规则见 [工具与动作](https://github.com/anweat/dsh-browser/blob/master/docs/guide/tools-and-actions.md) 与 [自动化自由度与审批](https://github.com/anweat/dsh-browser/blob/master/docs/guide/automation-modes.md)。插件随包提供 `dsh-browser` skill，教模型复用优先、定位策略和按错误码处理失败。

所有网页访问、交互、脚本、Cookie 使用、上传和下载都必须由调用方或操作者根据目标网站规则及适用要求判断并使用；插件只执行被请求或批准的浏览器操作，不判断用途是否获得网站授权。

## 常用配置

在设置卡片里改，或写进 profile 的配置文件（完整带注释的示例见 [配置参考](https://github.com/anweat/dsh-browser/blob/master/docs/guide/configuration.md)）。**保存后需要重启 profile 才生效**（只有提示文本覆盖按调用实时读取）。

| 键 | 默认 | 说明 |
|---|---|---|
| `automationMode` | `standard` | `read-only` 只读 \| `standard` 写操作逐次审批 \| `autonomous` 页面交互直接执行 \| `unrestricted` 全部免审批（仅隔离环境） |
| `toolSurface` | `indexed` | `indexed` 两个常驻工具；`flat` 每个动作一个工具 |
| `channel` | `chromium` | `chromium`（Playwright 的 Chromium，没装时自动用系统 Chrome / Edge）\| `chrome` \| `msedge`（固定用） |
| `headless` | `true` | `false` 显示浏览器窗口 |
| `executablePath` | 空 | 自定义浏览器可执行文件的绝对路径 |
| `browserRuntime` | `playwright` | `patchright`：仅 Chromium，对自动化检测更友好 |
| `opencliEnabled` | `true` | OpenCLI 总开关；没装 OpenCLI 时只是 `opencli.*` 不可用 |
| `authProfiles` / `defaultAuthProfile` | 空 | 按域名限定的登录态（`allowedDomains`、`storageStatePath`、`persistState`） |
| `allowPrivateHosts` | `false` | 允许 agent 把 localhost / 内网地址写进登录域名 |
| `downloadDir` / `downloadMaxBytes` | `$DSH_HOME/data/browser/downloads` / 100 MiB | 下载目录与单个文件上限 |

另有视口、`userAgent`、`locale`、`timezoneId`、代理（`viewportMode`、`proxyServer` 等）、`usagePolicy` 限流、`automationAssets` 与 `prompts`，见配置参考。

## 文档索引

- 用户指南（中文）：[文档索引](https://github.com/anweat/dsh-browser/blob/master/docs/README.md) 列出 `docs/guide/` 下每一篇——配置参考、设置卡片、工具与动作、Playwright Recipe、自动化资产、审批、策略覆盖层、使用策略、下载与上下文、登录态与 OpenCLI、内核与依赖、提示文本、UserScript、`browser` 服务。
- [CHANGELOG](https://github.com/anweat/dsh-browser/blob/master/CHANGELOG.md)：各版本的兼容范围与升级说明。
- 开发者文档：[docs/dev/](https://github.com/anweat/dsh-browser/blob/master/docs/dev/build-and-release.md)（构建与发布、宿主兼容）、[docs/validation/](https://github.com/anweat/dsh-browser/tree/master/docs/validation)（验证记录）。

## License

MIT
