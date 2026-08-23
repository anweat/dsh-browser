# dsh-browser

自包含的浏览器运行时插件 for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）。

把 **Playwright / Patchright（可选 Chromium 驱动）** 与 **OpenCLI** 作为插件自身的 npm 依赖打包（优先插件本地，缺省回退全局复用），对外提供一个 `browser` 服务 + 一组交互式浏览器工具。`dsh-web-search-pro` 通过 `inject: ['browser']` 注入该服务，驱动它的浏览器 / OpenCLI 后端——**不再依赖全局 CLI**。

## 安装

```bash
dsh plugin --profile web add @anweat/dsh-browser
# 或本地目录 / tarball：
dsh plugin --profile web add ./dsh-browser
# 重启（web profile 关闭了 HMR）：
dsh --profile web
```

> 依赖 `@deepseek-ai/*` 已发布到 npm（`^0.1.0-rc.6`）。
> 若你的 harness 是本地源码 checkout（如 `0.1.0-rc.5`），版本号可能有出入——用
> `dsh plugin --profile web add ./<path>` 并在 profile 的 `pnpm-workspace.yaml`
> 里对齐版本后重装即可。

## 从旧版本升级

Web Search Pro 与浏览器插件应同步升级；`dsh-web-search-pro >= 0.1.8` 需要 `@anweat/dsh-browser >= 0.1.8`。本版修正了 `web_snapshot screenshot=false` 仍写入 PNG 的问题，并让同一 `automationMode` 同时管辖 Web Search Pro 的缓存、规则和依赖安装操作。

```bash
dsh plugin --profile web add @anweat/dsh-browser@^0.1.8 dsh-web-search-pro@^0.1.8
```

升级后完整停止并重启 Web profile，再调用 `browser_status`、`browser_opencli_status` 和 `web_backend_status`；仅刷新网页不会重新加载插件服务或 Web Search Pro 配置面板。尤其不要只升级 Web Search Pro：新的工具目录、Patchright 运行时和调用缓冲都来自浏览器插件。

## 快速使用与适用情形

安装并重启后，可先让模型调用 `browser_status`，再按任务选择工具。默认
`automationMode: standard`：读取直接执行，点击、输入、滚动及页面写操作走 DSH 原生一次性审批。

| 情形 | 推荐方式 | 关键边界 |
|---|---|---|
| 公开网页读取、截图 | `browser_open` → `browser_read` / `browser_screenshot` | 不需要登录态 |
| 表单、分页、懒加载 | `browser_click` / `browser_type` / `browser_scroll` | `standard` 下审批；`autonomous` 下可直接执行 |
| 登录后站点 | `authProfile` | 必须配置 `allowedDomains`；默认不回写 Cookie |
| 固定站点增强 | `rulePack` | 只允许有界步骤；本地 init script 必须 SHA-256 固定且 ≤64KB |
| 模型生成的多步操作 | `browser_recipe_run` | 声明式步骤；审批策略由 `automationMode` 决定 |
| 默认只读脚本 | `browser_script_catalog` → `browser_script_run_builtin` | 内置 article/links/JSON-LD/forms，不执行外来代码 |
| 外部模型生成 UserScript | `browser_script_validate` → `browser_userscript_run` | 必须 `@match` + `@grant none`；除 `unrestricted` 外执行前审批 |
| 有限站点遍历 | `browser_crawl` | 页数、深度、并发、突发与退避始终受 `usagePolicy` 约束 |
| Reddit/小红书等 OpenCLI 平台 | `browser_opencli_status` → `browser_opencli_catalog` → `browser_opencli_run` | 先发现精确 adapter；通用调用除 `unrestricted` 外需审批 |
| 普通站点兼容性不佳 | `browserRuntime: patchright` | Chromium-only；建议专用 Chrome profile，不与指纹注入库叠加 |

DSH 会话示例：

```text
先调用 browser_status；然后用 browser_open 打开目标页。
若页面需要登录，使用 authProfile=forum；不要把 Cookie 放进工具参数。
```

## 内核与依赖的"打包 vs 复用"

| 层 | 实际是什么 | 打包还是复用 |
|---|---|---|
| **chromium 内核** | 共享缓存 `%LOCALAPPDATA%\ms-playwright`（约 400MB） | **永远复用共享缓存**，不塞进插件、不重复下载；缺失时 `browser_install` 一键补 |
| **playwright 驱动**（JS 包） | `playwright` npm 依赖 | 插件本地 node_modules 优先，缺省回退全局 npm |
| **patchright 驱动**（可选） | 与 Playwright 同版本的 Chromium 兼容驱动 | 插件内置；配置 `browserRuntime: patchright` 才启用 |
| **opencli**（纯 Node CLI） | `@jackwener/opencli` npm 依赖 | 同上，本地优先 / 全局复用 |

## 服务：`browser`

`dsh-browser` 在 `apply()` 里 `ctx.provide('browser', service)`。任何插件声明
`inject: ['browser']` 即可消费：

```ts
export const inject = ['tools', 'browser']
export function apply(ctx: Context) {
  const browser = ctx.get('browser') as BrowserService
  // browser.render / snapshot / searchResults / opencli / recipe /
  // runBuiltinScript / runUserscript / open / click / type / scroll / read / screenshot / close
}
```

服务接口（结构性，无需共享类型包）见 `src/browser-service.ts`。

## 自动化自由度

`automationMode` 控制模型可见的工具集合和执行审批。建议从 `standard` 开始，仅在完全只读任务或受控自动化环境中切换：

| 模式 | 浏览器与 Web Search Pro 写操作 | 仍需审批或拒绝 | 不可取消的安全底线 |
|---|---|---|---|
| `read-only` | 只读工具与只读 Recipe；缓存清理、规则写入和安装拒绝 | 页面交互、写 Recipe、UserScript、OpenCLI run 均隐藏或拒绝 | 只能读取、校验、截图及运行只读脚本/Recipe |
| `standard`（默认） | 页面交互、写 Recipe、缓存清理和规则写入均需一次性审批 | UserScript、通用 OpenCLI、浏览器/后端安装也需审批 | 所有安全校验持续启用 |
| `autonomous` | 页面交互、写 Recipe、缓存清理和规则写入可直接执行 | 外部 UserScript、通用 OpenCLI、浏览器/后端安装仍强制审批 | 所有安全校验持续启用 |
| `unrestricted` | 所有上述工具均不触发审批，适合隔离环境中的无人值守测试 | 无审批提示 | 仍执行域名、元数据、参数、大小和步骤数校验 |

`unrestricted` 会允许模型直接运行外部脚本、通用 CLI 和安装命令，只应在隔离的测试 profile 或明确授权的自动化环境中使用；日常 profile 保持 `standard`。它只取消人工确认，**不会取消 `usagePolicy` 的并发、突发、页数、深度、重试与冷却保护**。模式改变后需要重启 DSH profile，工具目录才会按新配置重新注册。

## 工具（最多 18 个）

| 工具 | 作用 |
|---|---|
| `browser_open` | 打开 URL，返回标题/可读文本/全页截图路径（持久页会话） |
| `browser_click` | 按 CSS 选择器点击 |
| `browser_type` | 向 input/textarea 输入 |
| `browser_scroll` | 纵向滚动（触发懒加载） |
| `browser_read` | 读当前页 URL/标题/文本（不截图） |
| `browser_screenshot` | 当前页全页截图 |
| `browser_close` | 关闭当前页（下次 open 全新） |
| `browser_status` | 运行时状态（含 automationMode、已暴露工具及各类审批策略） |
| `browser_install` | 安装 playwright chromium（`browser_status` 报缺失时执行一次） |
| `browser_script_catalog` | 列出内置只读脚本及其 SHA-256 |
| `browser_script_validate` | 解析外部 UserScript 的元数据、域名、grant、能力与哈希，不执行 |
| `browser_script_run_builtin` | 在独立 Playwright context 中运行内置只读脚本 |
| `browser_userscript_run` | 运行外部 UserScript；强制域名匹配，审批策略由模式决定 |
| `browser_recipe_run` | 最多 25 步 Playwright Recipe；支持等待、定位、表单、键盘、提取、断言和截图 |
| `browser_opencli_status` | 实际运行 OpenCLI doctor，报告 daemon/extension/profile 连通性 |
| `browser_opencli_catalog` | 对 OpenCLI 大目录按 query/site/access/strategy 过滤，单次最多返回 100 条 |
| `browser_opencli_run` | 通用 OpenCLI argv 网关；除 `unrestricted` 外触发 DSH 原生一次性审批 |
| `browser_crawl` | 匿名、有限广度遍历；默认同源，强制使用全局调用缓冲和单次页数/深度预算 |

## 使用策略：防止过度调用的缓冲

`usagePolicy` 是资源与站点压力保护，不是审批系统。所有模式共用同一个进程内 Governor：

- `maxConcurrency` 限制同时发起的导航，超出后排队；`burst` + `minDelayMs` 限制单站点短时突发。
- OpenCLI adapter / Browser Bridge 调度也占用同一全局并发与 burst 缓冲，不会因绕过 Playwright 而失去节流。
- 站点返回 429、502、503、504 时，按 `Retry-After` 或指数退避进入站点级冷却，最多重试 `retryLimit` 次。
- `browser_crawl` 还受 `maxPagesPerRun` 和 `maxDepth` 硬上限约束；调用参数只能收紧，不能突破配置。
- 泛爬取默认使用匿名 context，不继承全局 `storageStatePath` 或 `defaultAuthProfile`；登录后读取仍使用显式限域的单页/Recipe 工具。
- `browser_status` 显示累计运行、排队、等待和 backoff 次数，便于判断是否调用过密。
- 泛爬取能力本身不隐藏，但调用方仍应遵守目标站点条款、robots 指令、版权、隐私和适用法律；工具每次返回该警告。

## 外部模型脚本：推荐流程

外部模型可以输出 Tampermonkey/UserScript 格式源码，但不要直接执行。让当前 DSH Agent 先调用
`browser_script_validate`，展示名称、`@match`、SHA-256 和能力，再调用
`browser_userscript_run`。除 `unrestricted` 外，执行调用会进入 Harness 的
`tools/pre-execute → approval` 原生流程；用户拒绝、没有 approval 服务或调用不属于 Agent 时都不会运行。

最小脚本示例：

```js
// ==UserScript==
// @name Read Search Cards
// @match https://example.com/search*
// @grant none
// ==/UserScript==
return [...document.querySelectorAll('.result')].slice(0, 20).map(card => ({
  title: card.querySelector('h2')?.textContent?.trim() || '',
  url: card.querySelector('a')?.href || '',
}))
```

当前兼容的是 UserScript 元数据和页面脚本执行模型，不模拟完整 Tampermonkey：

- 只支持 `@grant none`；`GM_cookie`、`GM_xmlhttpRequest`、`unsafeWindow` 等不提供。
- 不支持 `@require`，避免审批过的源码在运行时再拉取未审查代码。
- 源码 ≤64KB、结果 ≤100,000 字符、单次运行最长 30 秒。
- 使用显式 URL，新建独立 Playwright context；需要登录态时只能选已限域的 `authProfile`。
- 审批代表允许该脚本以当前站点登录身份操作页面；静态能力报告只用于解释，不是沙箱。

常见读取任务优先用内置脚本：`article-clean`、`links`、`jsonld`、`forms`。它们不返回表单当前值，
也不触发点击或网络写操作。

## Playwright Recipe

Recipe 适合让模型生成可审计、可复现的多步操作，不必生成 JavaScript：

```json
{
  "url": "https://example.com/search",
  "steps": [
    { "type": "wait", "condition": "selector", "value": "#query" },
    { "type": "fill", "selector": "#query", "value": "DeepSeek Harness" },
    { "type": "press", "selector": "#query", "key": "Enter" },
    { "type": "wait", "condition": "load" },
    { "type": "extract", "selector": "main", "mode": "links", "limit": 30 },
    { "type": "screenshot" }
  ]
}
```

支持的步骤为：`wait`、`click`、`fill`、`type`、`press`、`select`、`check`、`hover`、
`scroll`、`extract`、`assert`、`screenshot`。纯读取步骤直接执行；出现点击、输入、键盘、选择、
勾选、悬停或滚动时，`standard` 下整个 Recipe 只询问一次审批，批准后顺序执行；
`autonomous` / `unrestricted` 下直接执行，`read-only` 下拒绝。

## 配置（cordis.yml / patch config）

```yaml
- insert:
    - id: browser
      name: '@anweat/dsh-browser'
      config:
        automationMode: standard # read-only | standard | autonomous | unrestricted
        browserRuntime: playwright # playwright | patchright
        channel: chromium        # 'chromium'（打包内核）| 'msedge'（系统 Edge）
        headless: true
        opencliEnabled: true
        usagePolicy:             # 所有模式都生效；无审批模式也不会绕过
          minDelayMs: 750
          maxConcurrency: 2
          burst: 3
          maxPagesPerRun: 20
          maxDepth: 2
          retryLimit: 2
          backoffBaseMs: 1000
          cooldownMs: 30000
        storageStatePath: ''     # Playwright 登录态 JSON（复用已登录会话）
        authProfiles:
          forum:
            storageStatePath: 'D:/secrets/forum.json'
            allowedDomains: [example.com]
            persistState: false  # 默认只读；true 才会原子回写刷新后的状态
        rulePacks:
          forum-enhanced:
            matches: [example.com]
            initScriptPath: 'D:/dsh/rules/forum.js'
            initScriptSha256: '<64位sha256>'
            steps:
              - { type: waitFor, selector: '#results', timeoutMs: 10000 }
              - { type: scroll, deltaY: 1600, repeat: 2, waitMs: 300 }
        autoInstall: false       # 缺内核时是否自动 install chromium
        verbose: false
```

这些字段同时进入 Host settings 命名空间和专用可视化卡片：打开 `设置 → 插件 → 插件配置 → 浏览器自动化`，可调整工具自由度、Playwright/Patchright、OpenCLI、`usagePolicy` 与限域登录态。保存后需要重启 profile。若没有看到“浏览器自动化”卡片，先确认 `@anweat/dsh-browser` 已同步升级，再完整重启，而不是只刷新 Web Search Pro 页面。

### Patchright 可选内核

Patchright 是 Playwright-compatible 的 Chromium 驱动，适合普通 Playwright 在搜索页遇到自动化检测时显式启用：

```yaml
browserRuntime: patchright
channel: chrome
headless: false
```

`channel: chrome + headless: false` 是更贴近其推荐的兼容配置；CI/无人值守也可使用 headless，但 `browser_status.runtimeWarnings` 会如实提示差异。Patchright 会禁用 Playwright console API，因此依赖控制台监听的 Recipe/脚本不应切换到它。不要再叠加自定义 User-Agent、额外请求头或指纹注入器；这类组合更容易形成自相矛盾的指纹。

Camoufox 当前没有硬集成：截至本版，其 JS 包要求 Node 22 且 peer 约束为 `playwright-core <1.61`，与本插件验证的 Playwright/Patchright 1.62.1 不兼容，并需要独立下载 Firefox 内核。后续等版本边界对齐后再作为第三 provider 接入，避免安装后才发生依赖漂移。

## 登录态复用

- `channel: chromium` + `storageStatePath` 指向一份 storageState JSON，即可用你已登录的身份抓受限页面。
- 新配置优先使用 `authProfiles`：按名称复用全局登录态，但必须用 `allowedDomains` 限域；默认只读，避免一次搜索意外改写 Cookie Vault。
- `browser_open` 和 web-search-pro 的平台搜索可选择 `authProfile` / `rulePack`。`browser_status` 只显示 profile 名称、域名和回写状态，不显示文件路径或 Cookie。
- RulePack 仍只允许有界动作；init script 必须是本地、SHA-256 固定且不超过 64KB。外部模型 JavaScript 使用独立的 UserScript 工具，不能冒充 RulePack；除 `unrestricted` 外需一次性审批。
- 生成登录态：`npx playwright codegen --save-storage=storageState.json`（或复用 `dsh-web-search-pro` 的 `scripts/save-login.mjs`），把产物路径填进 `storageStatePath`。
- opencli 的社交平台后端（小红书/推特/Reddit/IG/FB）仍需浏览器扩展 + 登录态在线，即使 opencli 已打包为依赖也绕不开扩展。

### OpenCLI 连接检查

插件运行时优先使用自己依赖的 OpenCLI。需要在终端排查 Browser Bridge 时，可全局安装同一 CLI 并检查：

```bash
npm i -g @jackwener/opencli
opencli daemon status
opencli doctor
```

健康状态应同时包含 daemon running、extension connected 和一个 connected Chrome profile。仅安装 npm 包不等于 Browser Bridge 可用；Chrome 扩展断开时，OpenCLI 社区搜索会明确失败，而普通 Playwright 浏览器工具不受影响。

插件内先调用 `browser_opencli_status`，不要只看 `browser_status.opencliEnabled`。后者表示配置开关，
前者才是真实连接。通用调用以 argv 数组传入，不经过 shell，也不会自行拼接引号：

```json
{
  "profile": "chrome",
  "args": ["reddit", "search", "DeepSeek Harness", "-f", "json"]
}
```

不确定命令时先查目录，避免让模型猜 adapter：

```json
{ "query": "search", "site": "reddit", "access": "read", "limit": 10 }
```

`browser_opencli_catalog` 从 `opencli list -f json` 读取并缓存目录，只暴露过滤后的最多 100 条；它不执行站点命令，也不读取站点登录数据。

优先级建议：已有站点 adapter（`opencli <site> <command>`）→ `opencli web read` / `extract` →
`browser network` → DOM state/find/action → 最后才是只读 `eval`。`opencli browser` 必须包含显式 session：

```text
["browser", "research", "open", "https://example.com"]
["browser", "research", "state"]
["browser", "research", "network", "--filter", "title,url"]
["browser", "research", "extract", "--selector", "main"]
["browser", "research", "close"]
```

`browser_opencli_run` 是通用高级入口，可能调用发布、删除、发帖等 adapter，因此无论命令看起来是否只读，
除 `unrestricted` 外都要求原生一次性审批。常规搜索仍优先走 `dsh-web-search-pro` 的只读工具。

## 发布 / 构建

```bash
pnpm install          # 装依赖（playwright / patchright / opencli / @deepseek-ai/*）
pnpm test
pnpm run build        # tsc → lib/
node scripts/install-browser.mjs   # 安装 chromium 内核（发布前验证，可选）
```

## 与 dsh-web-search-pro 的关系

`dsh-web-search-pro` 现在 `inject: ['browser']`，其 `web_snapshot` / `web_fetch_pro`(playwright 后端) /
`web_platform_search`(中文社区 playwright + 社交平台 opencli) 全部走本插件的 `browser` 服务。
两者可独立安装，但 web-search-pro 的浏览器类能力依赖 dsh-browser 先行提供 `browser` 服务（Cordis `inject` 自动排序，无需手动控制挂载顺序）。
