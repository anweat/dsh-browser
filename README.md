# dsh-browser

本地整合候选的修复、工具清单与安全边界见 [AUDIT.md](AUDIT.md)。`allowedDomains` 只限制认证状态装载，不是网络防火墙或 Agent 隔离边界。

自包含的浏览器运行时插件 for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）。

把 **Playwright / Patchright（可选 Chromium 驱动）** 与 **OpenCLI** 作为插件自身的 npm 依赖打包（优先插件本地，缺省回退全局复用），对外提供一个 `browser` 服务 + 一组交互式浏览器工具。`dsh-web-search-pro` 通过 `inject: ['browser']` 注入该服务，驱动它的浏览器 / OpenCLI 后端——**不再依赖全局 CLI**。

## 兼容与发布通道

| 插件发布通道 | DSH 基线 | 兼容承诺 |
|---|---|---|
| `0.1.12` 及更早的维护版本 | `dsh-v0.1.1-rc.2` 至 `dsh-v0.1.2-rc.1` | 旧基线；不与新插件混装 |
| `0.1.15` | `dsh-v0.1.7-rc.2` | 精确锁定该宿主版本；组合安装、真实 Web profile 与设置持久化已验证 |
| `0.1.17` | `dsh-v0.1.7-rc.2` ~ `dsh-v0.2.0-rc.2` | peer 收口为「实测过的两条线」（上界 `<0.2.1-0`）；在 `0.2.0-rc.2` 上完成 typecheck、构建、52 项测试与真实挂载验证；补充浏览器缓存路径配置说明，并新增 peer 双解析模式检查 |
| `0.2.0-rc.1`（预发布，历史记录） | `dsh-v0.1.7-rc.2` ~ `dsh-v0.2.0-rc.2` | **破坏性变更**：30 个 `browser_*` 工具改为 `browser_index` / `browser_call` 两个入口加动作目录（常驻约 325 token，原约 8.8k）；随包提供 `dsh-browser` skill；recipe v2、资产版本与激活保护、结构化观察、探索记录生成草稿、提示文本可配置。并入按 session 隔离浏览器状态（#36）与 dialog 竞态修复（#30）。在 `0.2.0-rc.2` 上完成 325 项测试、64 项真实浏览器 e2e 与真实 Web profile 验证 |
| `0.2.0` | `dsh-v0.2.0-rc.2` | 第一个面向 DSH 桌面版 0.2.0 线的正式版，也是后续开发的基底。**只支持 `dsh-v0.2.0-rc.2` 这一条线**（peer `>=0.2.0-rc.2 <0.2.1-0`）：去掉为更旧宿主保留的兼容分支（`settings.register` 的 live scope 回退等），并去掉对 `settings` 服务的必需依赖（只声明 `inject: ['tools']`，没有 Settings 服务的组合里也能启动）；不改工具、动作、schema、文本与审批规则。在 `0.2.0-rc.2` 上完成 327 项测试、64 项真实浏览器 e2e 与 peer 双解析模式检查。旧宿主（0.1.7 线，`dsh-v0.1.7-rc.2`）继续使用 `0.1.17` |
| `0.2.1` | `dsh-v0.2.0-rc.2`（不变） | 相对 `0.2.0` 的补丁版，DSH 基线与 peer 范围（`>=0.2.0-rc.2 <0.2.1-0`）不变，只含两项：(1) 参数无效的调用不再先弹审批：审批钩子先判断动作是否被当前 `automationMode` 禁用（禁用仍直接拒绝），再用与 `runAction` 相同的校验检查参数，无效则不询问，执行层再校验一次并返回带精简 schema 的 `INVALID_ARGS`，不执行任何页面动作；参数有效时的审批规则与理由不变。(2) “探索转草稿”（`draft_from_journal`）的指导文本补充。不改动作、参数 schema 与审批规则。在 `0.2.0-rc.2` 上完成 337 项测试与 66 项真实浏览器 e2e |

`0.1.17` 把 DSH 运行时依赖由精确锁定改为范围声明（`^0.1.7-rc.2 || >=0.2.0-rc.1 <0.2.1-0`），
使同一份包可装在 `0.1.7-rc.2` 与 `0.2.0-rc.2` 两代宿主上。`0.2.0-rc.1` 起的新功能（动作体系、skill、recipe v2、
资产版本、提示文本配置等）只在 `0.2.0-rc.2` 上验证过，没有在 `0.1.7-rc.2` 上跑过，所以 `0.2.0` 把范围收成**只覆盖
`0.2.0-rc.2` 这条线**：`>=0.2.0-rc.2 <0.2.1-0`，正式版 `0.2.0` 起即采用这个范围。`0.1.17` 的范围不变，旧宿主继续用它。

这个写法同时满足两种解析，缺一不可：

- 宿主的组装期校验用的是 `semver.satisfies(host, range, { includePrerelease: true })`，所以「单范围能不能过宿主」不是关键。
  真正决定装机成败的是 npm/pnpm 的**默认** semver：预发布版本只有在某个比较符自带同号（同 major.minor.patch）预发布时才被判为满足。
  于是 `>=0.1.7-rc.2 <0.2.1-0` 这种写法过得了宿主校验，却会让 `dsh plugin add` 报 ERESOLVE（下界 tuple 是 0.1.7，接不住 0.2.0-rc.2）；
  `>=0.2.0-rc.2` 这个比较符自带 `0.2.0` 的预发布，是**承重**的，必须保留。
- 上界是 `<0.2.1-0` 而不是 `<0.2.1`：后者放行 `0.2.1-alpha.1` 这类 0.2.1 的预发布。收口后，若 0.2.1 真出现破坏，
  会在**组装期**直接报 `is incompatible with dsh 0.2.1` 并点名，而不是拖到用户机器上变成运行期怪错
  （`0.1.5 → 0.1.7` 曾一次性打断所有按 `0.1.5-alpha.1` 构建的插件）。
- 范围只表示「测过哪些」，不等于承诺不破坏；真正的防线是每换一个 DSH 版本重跑一遍这套验证。
  `pnpm run test:peers`（已并入 `pnpm verify`）用两种解析模式逐个断言受管 peer：`0.2.0-rc.2` 必须通过，
  `0.1.7-rc.2`、`0.2.0-rc.1`、`0.2.1-alpha.1` 必须被拒绝；并自带 `--selftest` 已知行为自校验。

`0.1.15` 使用 DSH 新客户端分包：状态存储来自
`dsh-client-store`，设置契约来自 `dsh-client-ui-settings`，客户端 Context
来自 Cordis。npm 上 `0.1.15-alpha.2` 仍声明旧版 DSH peer，不能与本版混用。

设置的读取不再对宿主版本做适配：Host 半边直接使用 Loader 传给 `apply` 的条目配置（设置页由条目的 `Config` schema 派生，
条目 id 为 `browser`），浏览器设置卡片使用 `ConfigForm`/`ctx.configForms`，`devDependencies` 锁定 `0.2.0-rc.2`。
可编辑字段都是 `.volatile()`：保存后新值写入运行中的引用，但浏览器进程、工具暴露与审批规则在启动时一次读取，
所以保存后仍需重启 profile 才生效（只有提示文本覆盖里的目录、错误提示等按调用实时读取，见「自定义提示文本」）。

插件只声明 `inject: ['tools']`，**不依赖宿主的 `settings` 服务**：Cordis 4.0.4 把声明了的 `inject` 一律当作必需，若声明 `settings`，
在没有该服务的组合（如 sdk-minimal，或关了 settings 行的 profile）里插件会一直挂起。插件的 Host 半边从不读取 `ctx.settings`，
配置来自 Loader 条目；没有 Settings 服务时按 `Config` 默认值运行，设置卡片只是不显示（客户端只在宿主提供 `browser` 命名空间时才挂载它）。

## 安装

```bash
# 默认安装（新的 browser_index / browser_call 工具体系，面向 dsh-v0.2.0-rc.2 宿主）：
dsh plugin --profile web add @anweat/dsh-browser@0.2.1
# 宿主仍是 0.1.7 线（dsh-v0.1.7-rc.2）时，固定安装 0.1.17（旧的 browser_* 工具体系）：
dsh plugin --profile web add @anweat/dsh-browser@0.1.17
# 或本地目录 / tarball：
dsh plugin --profile web add ./dsh-browser
# 重启（web profile 关闭了 HMR）：
dsh --profile web
```

> `0.2.0` 与 `0.2.1` 只支持 `dsh-v0.2.0-rc.2`（peer `>=0.2.0-rc.2 <0.2.1-0`）；范围之外的宿主版本未经验证，
> 旧宿主（`dsh-v0.1.7-rc.2` 线）请固定使用 `0.1.17`。预发布通道 `@next` 不再用于安装，`0.2.0-rc.1` 仅作历史记录。
> 若你的 harness 是包含未发布提交的本地源码 checkout，版本号可能有出入——用
> `dsh plugin --profile web add ./<path>` 并在 profile 的 `pnpm-workspace.yaml`
> 里对齐版本后重装即可。

## 从旧版本升级

### 升级到 0.2.2（开发中，尚未发布）

- 从 `0.2.1` 升级即可，DSH 基线与 peer 范围不变；不配置新键时所有行为与 `0.2.1` 相同。
- 新增 context 创建期选项：配置键 `viewportMode` / `viewportWidth` / `viewportHeight` / `userAgent` / `locale` / `timezoneId` / `proxyServer` / `proxyBypass`，以及 `target.open` 的按次参数 `viewport` / `userAgent` / `locale` / `timezoneId` / `proxyServer`（见下文“浏览器上下文选项”）。
- 新增 `target.download` 与 `inspect.downloads`，以及配置 `downloadDir`、`downloadMaxBytes`（见下文“下载落盘”）。动作总数从 34 变为 36。
- **嵌套写法现在会报错而不是被忽略**：配置里写 `viewport: {width, height}`、`proxy: {...}`、`contextOptions`、`download(s)` 会在加载时抛出明确错误，并指出应使用哪些扁平键。
- 带 `proxyServer` 或 `userAgent` 的 `target.open` 在 `standard` / `autonomous` 下需要审批，`read-only` 拒绝，`unrestricted` 放行；`target.download` 与 `act.upload` 同档。

### 升级到 0.2.1

- 从 `0.2.0` 直接升级即可，DSH 基线、peer 范围、动作、参数 schema、面向模型的文本与审批规则都没有变化，已保存的资产、配置与提示文本覆盖照常使用。
- 唯一的行为变化：参数无效的调用（例如 `act.select` 把 `values` 写成 `value`）不再先弹审批、等用户点“允许”之后才返回 `INVALID_ARGS`；现在直接返回 `INVALID_ARGS`（带精简 schema），页面没有任何改动，模型改对后只会询问一次。被当前 `automationMode` 禁用的动作仍直接拒绝。

### 升级到 0.2.0

- 旧的 `browser_open`、`browser_click` 等工具名不再注册。模型通过 `browser_index` 查看动作目录，再用 `browser_call` 执行，例如 `{"action":"act.click","args":{...}}`。需要一次性看到全部动作时，把 `toolSurface` 设为 `flat`。
- 其他插件或自定义提示词里如果写了旧工具名，需要同步修改。Web Search Pro 请使用提示词已更新的版本。
- 已保存的 recipe 和 userscript 资产照常可读、可运行；升级到 v2 用 `automation.develop` 的 `convert`，它只生成新草稿，不改原资产。
- 激活资产现在要求当前版本有通过的测试记录。旧资产加载时会自动补一条“旧版”记录。
- **声明了输入的资产，激活门槛提高了。**新增策略项 `automationAssets.minInputSetsForActivation`（默认 2，范围 1–5）：带 `inputSchema` 或 `inputNames` 的资产，当前版本的通过凭据必须覆盖至少这么多组不同输入（`automation.develop` 的 `test` 传 `inputSets`；设置面板的“测试输入 JSON”填 2 到 5 个对象的数组），否则激活被拒绝，错误里写明原因。只用一组输入测试通过的 recipe 可能把那组输入写死，换一组就失败。没有输入的资产不受影响；升级前已通过测试的旧资产带“旧版”凭据，视为满足，不会因升级而无法激活。要恢复旧行为，把它设为 `1`。
- `BrowserService` 上供其他插件调用的方法（`render`、`snapshot`、`searchResults`、`opencli`、`close`）签名不变。
- **依赖范围收窄到 DSH 0.2.0 线。**peer 范围为 `>=0.2.0-rc.2 <0.2.1-0`（插件自身不再覆盖 `0.1.7-rc.2` 与 `0.2.0-rc.1`）。
- 先确认宿主是 `dsh-v0.2.0-rc.2`。宿主更旧时，`dsh plugin add` 会因 peer 不满足而拒绝，或在组装期点名报 `incompatible`；这类宿主继续使用 `0.1.17`。
- 工具、动作、参数 schema、文本与审批规则都没有变化，已保存的资产、配置与提示文本覆盖照常使用。
- 设置的保存与重启生效路径不变：在设置卡片保存后重启 profile 生效。
- 不再要求宿主提供 `settings` 服务：插件只声明 `inject: ['tools']`；有 Settings 服务时设置卡片照常显示，没有时按配置默认值运行。

### 升级到 0.1.17

Web Search Pro 与浏览器插件应同步升级；面向 `dsh-v0.1.7-rc.2` 不要混用仍声明旧 peer 的 Browser `0.1.15-alpha.2`；两者都升到 `0.1.17` 即可。

```bash
dsh plugin --profile web add @anweat/dsh-browser@0.1.17 dsh-web-search-pro@0.1.17
```

升级后完整停止并重启 Web profile，再调用 `runtime.status`、`opencli.status` 和 `web_backend_status`；仅刷新网页不会重新加载插件服务或 Web Search Pro 配置面板。尤其不要只升级 Web Search Pro：新的工具目录、Patchright 运行时和调用缓冲都来自浏览器插件。

## 快速使用与适用情形

安装并重启后，模型通过 `browser_index` 查看能力目录、用 `browser_call` 执行动作（`runtime.status` 可查看运行时状态），再按任务选择动作。默认
`automationMode: standard`：读取直接执行，点击、输入、按键、选择、勾选、悬停、文件上传及页面写操作走 DSH 原生一次性审批。页面脚本和本地文件上传在 `autonomous` 下仍需审批，只有 `unrestricted` 会跳过确认。

| 情形 | 推荐方式 | 关键边界 |
|---|---|---|
| 公开网页读取、截图 | `target.open` → `observe.read` / `observe.screenshot` | 不需要登录态 |
| 表单、分页、懒加载 | `act.click` / `act.fill` / `act.type` / `act.clear` / `act.press` / `act.select` / `act.check` / `act.scroll` | CSS 或 role/text/label/testId 语义定位，默认严格唯一；`standard` 下审批 |
| SPA 条件等待 | `act.wait` | 支持 locator、URL glob、networkidle 或最多 10 秒固定等待 |
| 悬停菜单与提示 | `act.hover` | 与直接页面交互使用相同审批策略 |
| 文件上传 | `act.upload` | 只接受现有绝对文件路径；最多 20 个、合计 512 MiB；除 `unrestricted` 外审批会显示路径 |
| 页面脚本表达式 | `script.evaluate` | 使用当前页面来源和登录态；可访问 DOM、非 HttpOnly Cookie、Web Storage 和浏览器允许的网络 API |
| 页面故障排查 | `target.open(capture=[console,network])` → `inspect.console` / `inspect.requests` | 只在内存保留最多 200 条；网络仅记录失败及 4xx/5xx，不记录 body/header |
| 登录后站点 | `authProfile` | 必须配置 `allowedDomains`；默认不回写 Cookie |
| 固定站点增强 | `rulePack` | 只允许有界步骤；本地 init script 必须 SHA-256 固定且 ≤64KB |
| 模型生成的多步操作 | `automation.run_recipe` | 声明式步骤；审批策略由 `automationMode` 决定 |
| 默认只读脚本 | `script.catalog` → `script.run_builtin` | 内置 article/links/JSON-LD/forms，不执行外来代码 |
| 外部模型生成 UserScript | `script.validate` → `script.run_userscript` | 必须 `@match` + `@grant none`；除 `unrestricted` 外执行前审批 |
| 有限站点遍历 | `crawl.crawl` | 页数、深度、并发、突发与退避始终受 `usagePolicy` 约束 |
| Reddit/小红书等 OpenCLI 平台 | `opencli.status` → `opencli.catalog` → `opencli.run` | 先发现精确 adapter；通用调用除 `unrestricted` 外需审批 |
| 普通站点兼容性不佳 | `browserRuntime: patchright` | Chromium-only；建议专用 Chrome profile，不与指纹注入库叠加 |

所有网页访问、交互、脚本、Cookie 使用、上传和下载都必须由调用方或操作者根据目标网站规则及适用要求判断并使用。插件只执行被请求或批准的浏览器操作，不判断具体用途是否获得网站授权，也不承担调用方的合规责任。限流、审批、域名和文件边界用于约束执行面，不能替代目标网站规则。

DSH 会话示例：

```text
先调用 browser_call({action:"runtime.status"})；然后用 target.open 打开目标页。
若页面需要登录，使用 authProfile=forum；不要把 Cookie 放进工具参数。
```

## 内核与依赖的"打包 vs 复用"

| 层 | 实际是什么 | 打包还是复用 |
|---|---|---|
| **chromium 内核** | 共享缓存 `%LOCALAPPDATA%\ms-playwright`（约 400MB） | **永远复用共享缓存**，不塞进插件、不重复下载；缺失时 `runtime.install` 一键补 |
| **playwright 驱动**（JS 包） | `playwright` npm 依赖 | 插件本地 node_modules 优先，缺省回退全局 npm |
| **patchright 驱动**（可选） | 与 Playwright 同版本的 Chromium 兼容驱动 | 插件内置；配置 `browserRuntime: patchright` 才启用 |
| **opencli**（纯 Node CLI） | `@jackwener/opencli` npm 依赖 | 同上，本地优先 / 全局复用 |

### 把共享浏览器缓存放到别的盘（可选）

共享缓存默认落在 `%LOCALAPPDATA%\ms-playwright`（Windows 上即系统盘，约 400MB）。
若要把内核放在别的盘、或直接复用一份已有的内核，在 loader 条目上显式给出可执行文件路径：

```yaml
- id: browser
  config:
    executablePath: 'E:/caches/ms-playwright/chromium-1234/chrome-win64/chrome.exe'
```

`executablePath` 必须指向真实的内核可执行文件（不是目录）；设置后 `runtime.status` 会显示该路径，
`runtime.install` 不再需要执行。`browserRuntime: patchright` 时同样适用。
注意该字段在插件挂载时解析：改完需要重新加载 profile（重启 Web profile），仅刷新网页不生效。

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

### 跨 session 隔离

`browser` 服务是**单实例**：`apply()` 只 `ctx.provide` 一次，所有消费者拿到同一个
`BrowserService`。因此交互式页面状态不能是全局的。

宿主在工具执行时带上 `exec.agent`，它是 session 身份（`agent.session.id`，
基础契约里也声明 `agent.id: SessionId`）。插件据此为每个 session 分配独立的
`BrowserContext` + `Page`：

- **共享**：浏览器**进程**。启动 N 个 Chromium 代价高昂，而一个进程开 N 个
  `BrowserContext` 正是 Chromium 自身的多配置文件模型。
- **隔离**：每个 session 的 `BrowserContext`、页面、auth profile、rule pack、
  以及 console / network 抓取缓冲。

注意隔离单位是 **context 而不是标签页**：同一个 context 里的多个标签页共享
cookie 与 storage，跨 session 串号正是要防的事。

由此得到的行为边界：

| 工具 | 作用域 |
|---|---|
| `target.open` / `act.*` / `script.evaluate` / `observe.*` / `target.close` | 仅调用方 session |
| `inspect.console` / `inspect.requests` | 仅返回调用方 session 抓到的记录 |
| `target.download` / `inspect.downloads` | 下载走调用方 session 的 context 与登录态；下载记录只在该 session 的内存里，互不可见 |
| `runtime.status` 的 `activeUrl` | 仅报告调用方 session 的页面 |
| `render` / `snapshot` / `searchResults` / `crawl` / OpenCLI | 每次调用自建临时 context，本就无共享状态 |

`target.close` 关闭的是**调用方**的页面，不影响其他 session；插件卸载时
`close()` 才整体拆掉所有 session 的 context 与进程。

会话槽位上限由 `maxSessions`（默认 8）控制，超出后关闭最久未使用的 session。
读取类调用（`runtime.status` / `inspect.console` / `inspect.requests` / `inspect.downloads`）**不会**
创建槽位，也不会触发淘汰——否则一次查询就会挤掉别人的页面。

不带 `exec.agent` 的调用方（例如其他插件直接消费服务）落在共享桶里，行为与
引入隔离之前一致。

## 自动化自由度

`automationMode` 控制模型可见的工具集合和执行审批。建议从 `standard` 开始，仅在完全只读任务或受控自动化环境中切换：

| 模式 | 浏览器与 Web Search Pro 写操作 | 仍需审批或拒绝 | 不可取消的安全底线 |
|---|---|---|---|
| `read-only` | 只读工具与只读 Recipe；缓存清理、规则写入和安装拒绝 | 页面交互、写 Recipe、UserScript、OpenCLI run 均隐藏或拒绝 | 只能读取、校验、截图及运行只读脚本/Recipe |
| `standard`（默认） | 页面交互、写 Recipe、缓存清理和规则写入均需一次性审批 | UserScript、通用 OpenCLI、浏览器/后端安装也需审批 | 所有安全校验持续启用 |
| `autonomous` | 页面交互、写 Recipe、缓存清理和规则写入可直接执行 | 外部 UserScript、通用 OpenCLI、浏览器/后端安装仍强制审批 | 所有安全校验持续启用 |
| `unrestricted` | 所有上述工具均不触发审批，适合隔离环境中的无人值守测试 | 无审批提示 | 仍执行域名、元数据、参数、大小和步骤数校验 |

`unrestricted` 会允许模型直接运行外部脚本、通用 CLI 和安装命令，只应在隔离的测试 profile 或明确授权的自动化环境中使用；日常 profile 保持 `standard`。它只取消人工确认，**不会取消 `usagePolicy` 的并发、突发、页数、深度、重试与冷却保护**。模式改变后需要重启 DSH profile，工具目录才会按新配置重新注册。

## 工具与动作

模型可见的工具面由 `toolSurface` 决定：

| `toolSurface` | 注册的工具 | 常驻上下文 | 用途 |
|---|---|---|---|
| `indexed`（默认） | `browser_index`、`browser_call` 两个 | 约 0.3k token | 渐进披露：先看目录，再按需查看单个动作的 schema |
| `flat` | 每个可用动作一个工具，名为 `browser_<group>_<action>` | 约 16k token（36 个工具；recipe 的 v2 schema 在 `automation.develop` / `automation.run_recipe` 里内联展开） | 对照与调试；与 `indexed` 共用同一份动作注册表和同一个分发入口 |

`indexed` 下：`browser_index()` 列出能力组和当前环境状态（`automationMode`、Chromium 是否已安装）；`browser_index({group})` 列出该组动作；`browser_index({action})` 给出完整参数 schema；`browser_index({query})` 按关键词检索。`browser_call({action, args})` 执行动作，服务端按 schema 校验参数，校验失败返回 `INVALID_ARGS` 并附上精简 schema。所有动作的返回值使用同一信封：

```json
{ "ok": true, "action": "act.click", "executionStatus": "completed", "result": { } }
{ "ok": false, "action": "act.click", "executionStatus": "failed", "error": { "code": "LOCATOR_NOT_FOUND", "message": "<Playwright 原始信息>", "hint": "…" } }
```

错误码：`INVALID_ARGS`、`UNKNOWN_ACTION`、`CAPABILITY_UNAVAILABLE`、`POLICY_DENIED`、`LOCATOR_NOT_FOUND`、`LOCATOR_AMBIGUOUS`、`NOT_ACTIONABLE`、`TARGET_CLOSED`、`DEADLINE`、`CANCELLED`、`NOT_FOUND`、`ACTION_FAILED`，以及 recipe 专用的 `VALIDATION_FAILED`、`OUTCOME_UNKNOWN`、`INVALID_RECIPE`。会产生副作用的动作超时时 `executionStatus` 为 `outcome_unknown`，调用方应先核验页面再决定是否重试。

**recipe 的执行结果**：`automation.run_recipe`、`automation.run`、`automation.develop` 的 `test` 总是把完整的运行报告放在 `result` 里，失败时也一样（此时 `ok` 为 false，并附带 `error`）：`executionStatus`（`completed` / `failed` / `cancelled` / `outcome_unknown`）、`validationStatus`（`not_checked` / `passed` / `failed`）、`completedSteps`、`failedStep{index, action, errorCode, message, candidates?}`、`effects`（`none` / `observed` / `unknown`）、`outputs`。`ok` 只在“执行完成且没有断言失败”时为 true。extract 和 screenshot 的值只放在 `outputs`（v2 的 `extract` 带 `as` 时有 `name`），`completedSteps[].output` 是指向它的下标，不再重复一份。fill、clear、type、click、press、select、check 视为有副作用：如果超时发生在**已命中元素、动作已开始之后**，`executionStatus` 为 `outcome_unknown`、`effects` 为 `unknown`；如果 Playwright 的 call log 显示一直只在 “waiting for locator”（元素从未出现），该步没有动手，判为 `failed`、`LOCATOR_NOT_FOUND`，`effects` 不受影响；没有 call log 的超时无法证明元素从未命中，仍按 `outcome_unknown`。取消和整体 deadline 在每一步开始前以及最后一步之后检查；正在执行的 Playwright 步骤无法中断，调用会等它返回，已完成的步骤不回滚，session 页面保持打开。测试或运行只有在执行完成且没有断言失败时才算通过；没有 `assert` 步骤的旧式（v1）recipe 仍可通过测试，但资产记为 `evidenceLevel: 'legacy-unverified'`。

**严格定位**：原子动作和 v2 recipe 步骤共用同一套定位（`src/locator.ts`）。locator 必须只匹配一个元素；匹配多个时该动作**不执行**，返回 `LOCATOR_AMBIGUOUS`，`error.candidates` 给出总数和前 5 个候选（`role`、`name`、文本片段、`visible`）。确需选其中一个时写 `index` 并同时写 `indexReason`，否则拒绝。

**Recipe schema v2**：资产和内联 recipe 用 `schemaVersion: 2` 启用，缺省为 1，v1 的语义（CSS `selector`、永远取第一个匹配、fill 不允许空串）一律不变。v2 的变化：

- 步骤用 `locator`（`{role,name?,exact?}` / `{label}` / `{text}` / `{testId}` / `{css}`，可加 `framePath`）；严格唯一，歧义时该步不执行且 `effects` 不变。
- 新增 `goto`（URL 必须落在资产的 `domains` 内，保存时和运行时各查一次，也检查重定向落点；内联 recipe 可停留在起始页同源，或落在显式的 `allowedDomains`）和 `clear`；`fill` 的空串必须写 `allowEmpty: true`，或改用 `clear`。
- `extract` 和 `assert` 默认最多等 5 秒（可用 `timeoutMs` 调整），选择器不存在时不再等约 30 秒；`extract` 可用 `as` 命名输出。
- 资产级字段：`inputSchema`（`string` / `number` / `enum`，可带 `required`、`example`、`enumValues`，运行前按 schema 校验并转换）、`outputSchema`（命名输出及类型 `string` / `number` / `json`）、`postconditions`（`{selector}` / `{text}` / `{urlIncludes}` / `{output, nonEmpty|allowEmpty}`）、`requiredCapabilities`（只记录，不门控）。
- `validationStatus` 为 `passed` 当且仅当所有 `assert` 和 postconditions 都成立。**没有任何 assert 或 postcondition 的 v2 资产可以保存为草稿，但测试不会记为 passed**，`testMessage` 会说明原因。
- `automation.develop` 的 `convert` 把 v1 recipe 资产转成**新的** v2 草稿：CSS selector 变成 `{css, explicitFirst: true}`（仍取第一个匹配），全部列入 `pendingDisambiguation`，草稿记录 `sourceAssetId` / `sourceRevision`，原资产（含 active）不会被修改；未知的 extract mode 或 wait condition 会拒绝转换并说明哪一步。

**审批按动作判断**：Host 的审批理由写明动作和关键参数（例如 `act.click role="button" name="Submit"`），`browser_index` 直接放行，`browser_call` 解析出动作后适用与下表相同的规则，不可用的动作在 `browser_call` 中再拒绝一次。判断顺序：先看动作是否被当前模式禁用（禁用则拒绝），再按动作的参数 schema 校验参数（与执行层是同一个校验；无效则不询问，直接交给执行层返回 `INVALID_ARGS`，不会执行任何页面动作），最后才是审批规则。Host 里按工具名设置的“总是允许”不会跳过插件策略。运行或回放资产（`automation.run`、`automation.develop` 的 `test`）时，审批理由写资产名称、版本和短 id，例如 `automation.run "Host check: docs search" r1 (5fdc912d)`；名称去掉换行并截断到 60 个字符。

旧的 30 个 `browser_*` 工具名已不再注册（`flat` 形态中 `browser_<group>_<action>` 与个别旧名相同，但它们现在就是注册表里的动作，返回统一信封）。

### 动作目录

| 动作 | 作用 |
|---|---|
| `target.open` | 打开 URL，返回标题/可读文本/全页截图路径；可显式启用 console/network 内存捕获；可选 `viewport`、`userAgent`、`locale`、`timezoneId`、`proxyServer`（context 创建期选项，见“浏览器上下文选项”） |
| `target.download` | 把 URL 的文件保存到 `downloadDir`（带本 session 登录态），返回绝对路径、字节数、sha256；失败即报错，不留 0 字节文件 |
| `target.close` | 关闭当前页（下次 open 全新） |
| `target.list` | 列出本 session 的页面（自己打开的页加上弹窗），含 `id`、`url`、`title`、`active` |
| `target.select` | 把本 session 的某个页面（`target.list` 里的 id）切换为当前页；弹窗不会自动成为当前页 |
| `observe.read` | 读当前页 URL/标题/文本（不截图） |
| `observe.screenshot` | 当前页、locator 或区域截图；普通文件名固定落在 `snapshotDir` |
| `act.click` | 按 CSS 或结构化 Playwright locator 点击 |
| `act.fill` | 向 CSS 或语义定位的 input/textarea 填入文本，整体替换（原 `browser_type`） |
| `act.type` | 逐键输入（`pressSequentially`），触发每个按键事件；用于自动补全、掩码输入框 |
| `act.clear` | 清空输入框并触发 input 事件，受控输入的状态会同步 |
| `act.wait` | 等待 locator 状态、URL glob、networkidle 或固定时间 |
| `act.press` | 对 locator 或全局键盘发送按键 |
| `act.select` | 按 locator 选择一个或多个 option value |
| `act.check` | 按 locator 勾选或取消勾选控件 |
| `act.hover` | 悬停 CSS 或语义 locator 并返回页面状态 |
| `act.scroll` | 纵向滚动（触发懒加载） |
| `act.upload` | 把现有本地文件设置到 `input[type=file]`；绝对路径、数量和总大小受限 |
| `inspect.console` | 读取本次显式捕获的脱敏 console 记录 |
| `inspect.requests` | 读取本次显式捕获的失败及 HTTP 4xx/5xx 请求；无 body/header |
| `inspect.downloads` | 列出本 session 的下载记录（含点击/导航触发的），只含内存记录，`clear` 只清记录不删文件 |
| `script.evaluate` | 在当前页执行最长 20,000 字符的 JavaScript 表达式，返回最多 100,000 字符 JSON |
| `script.catalog` | 列出内置只读脚本及其 SHA-256 |
| `script.validate` | 解析外部 UserScript 的元数据、域名、grant、能力与哈希，不执行 |
| `script.run_builtin` | 在独立 Playwright context 中运行内置只读脚本 |
| `script.run_userscript` | 运行外部 UserScript；强制域名匹配，审批策略由模式决定 |
| `runtime.status` | 运行时状态（含 automationMode、已暴露工具/动作及各类审批策略） |
| `runtime.install` | 安装 playwright chromium（`runtime.status` 报缺失时执行一次） |
| `automation.run_recipe` | 最多 25 步 Playwright Recipe；支持等待、定位、表单、键盘、提取、断言和截图；`schemaVersion: 2` 启用严格定位、`goto`、`clear` 与 postconditions |
| `automation.search` | 只有显式关键词调用才检索；可限定 active/draft/all、域名和类型，最多返回 `retrievalTopK` 条摘要 |
| `automation.develop` | 按确切 ID 读取源码，或显式保存、静态校验、真实回放、`convert`（v1 转 v2 新草稿）；永远不能激活资产 |
| `automation.run` | 按 ID 运行已激活资产；再次执行限域和输入大小校验，审批由 `automationMode` 决定 |
| `opencli.status` | 实际运行 OpenCLI doctor，报告 daemon/extension/profile 连通性 |
| `opencli.catalog` | 对 OpenCLI 大目录按 query/site/access/strategy 过滤，单次最多返回 100 条 |
| `opencli.run` | 通用 OpenCLI argv 网关；除 `unrestricted` 外触发 DSH 原生一次性审批 |
| `crawl.crawl` | 匿名、有限广度遍历；默认同源，强制使用全局调用缓冲和单次页数/深度预算 |

### dsh-browser skill

插件在 Host 提供 `skills` 服务时注册 `dsh-browser` skill（`assets/skills/dsh-browser/`：SKILL.md 与 `references/`），内容为复用优先、定位策略、按错误码处理失败、沉淀资产和边界。`skills` 不是必需依赖：没有该服务时插件照常工作，`browser_index()` 的根目录附一段不超过 300 token 的精简指南。skill 与精简指南都可以用 `prompts` 配置覆盖，见“自定义提示文本”。

## 可复用自动化资产（实验性）

> **Experimental:** Recipe/UserScript 的积累、模型开发、检索和复用接口仍可能调整。建议先在隔离 profile 中启用，审阅草稿并完成真实浏览器回放后再手动激活；不要把它作为无人监管的生产写操作入口。

自动化执行自由度与资产持久化是两套独立开关。`automationMode: unrestricted` 只影响执行审批，不会让 Agent 自动保存脚本；默认 `automationAssets.persistenceMode: suggest` 仅对成功的 `automation.run_recipe` 记录脱敏语义步骤。具体输入会替换为 `{{input}}` / `{{secret}}`，会话 ID 只保存短哈希，不保存页面正文、cookie、token、密码或聊天记录。

默认在 14 天窗口内，同一域名和步骤指纹至少成功 3 次、来自至少 2 个会话且成功率达到 80%，面板才出现“是否总结”候选。每天最多提示 2 次；候选、草稿和已激活资产均有数量上限。推荐流程是：

1. 候选达到阈值后，在“浏览器自动化 → 可复用自动化资产”选择“总结为草稿”或“暂不总结”。
2. 在脚本列表点选草稿；只有此时前端才按 ID 读取完整 recipe / UserScript。编辑器支持 recipe 和带 `@match`、`@grant none` 的 UserScript。UserScript 可从只读对象 `__DSH_INPUTS__` 读取 `inputNames` 声明的运行时输入，输入不会写入资产文件。
3. 保存后先做静态校验，再填写测试 URL/输入执行真实浏览器回放。只有真实回放成功才可手动激活；已激活版本不可原地编辑，避免后台行为静默漂移。
4. Agent 用 `automation.search` 获取有界摘要，再用 `automation.run` 按 ID 调用。检索默认 top 5、目录预算约 800 tokens，源码不会进入模型上下文。

`persistenceMode` 可选 `off | manual | suggest | auto-draft`。日常使用建议 `suggest`；`auto-draft` 只适合隔离测试 profile，并且仍不会自动激活。`activationMode` 当前默认并推荐 `manual`；`auto-tested` 作为后续真实沙箱回放策略的保留配置，不会把一次静态校验当成生产激活依据。

### 模型显式开发 recipe / UserScript

模型目录不会预载任何 recipe 或源码。需要批量索引等强指向自动化时，模型按以下顺序显式访问：

1. 调用 `automation.search(query="batch-index issues", status="draft|active", kind="recipe")`，仅得到 ID、名称、标签、域名、输入名和运行统计。
2. 确认要修改某项后，调用 `automation.develop(action="get", id="...")`；只有这一步会把单个资产的完整 recipe/源码带入当前上下文。
3. `action="save"` 可直接声明新的 recipe（建议 `schemaVersion: 2`，见上文），或保存带 `@match` / `@grant none` 的 UserScript；只能生成/更新 draft，且整体替换。`action="convert"` 把 v1 资产复制成新的 v2 草稿。默认每个模型会话最多写 3 次（save 与 convert 合计），仍受全局 `maxDrafts` 限制。
4. `action="validate"` 只做结构与 UserScript 元数据校验，不提供激活资格；`action="test"` 必须给 URL 和声明输入，执行真实 Playwright 回放，成功后才标记 `passed`。
5. 激活、归档和回滚只在可视化面板完成，模型开发工具没有对应动作。

recipe 建议把检索意图固化在 `name`、`description` 和 `tags`，例如 `batch-index`、`issues`、`community-search`。检索采用小规模确定性关键词评分和 token 预算，不自动把整个资产库升级成模型工具，也不使用隐藏的全量 prompt 注入。

`modelDevelopmentEnabled: false` 会在重启后直接从模型工具目录移除开发入口；`standard` 保存草稿和真实回放均需审批，`autonomous` 可直接保存草稿但真实回放仍需审批，只有 `unrestricted` 才会跳过回放审批。所有模式仍执行域名、UserScript 元数据、输入、源码大小和使用频率限制。

## 使用策略：防止过度调用的缓冲

`usagePolicy` 是资源与站点压力保护，不是审批系统。所有模式共用同一个进程内 Governor：

- `maxConcurrency` 限制同时发起的导航，超出后排队；`burst` + `minDelayMs` 限制单站点短时突发。
- OpenCLI adapter / Browser Bridge 调度也占用同一全局并发与 burst 缓冲，不会因绕过 Playwright 而失去节流。
- 站点返回 429、502、503、504 时，按 `Retry-After` 或指数退避进入站点级冷却，最多重试 `retryLimit` 次。
- `crawl.crawl` 还受 `maxPagesPerRun` 和 `maxDepth` 硬上限约束；调用参数只能收紧，不能突破配置。
- 泛爬取默认使用匿名 context，不继承全局 `storageStatePath` 或 `defaultAuthProfile`；登录后读取仍使用显式限域的单页/Recipe 工具。
- `runtime.status` 显示累计运行、排队、等待和 backoff 次数，便于判断是否调用过密。
- 泛爬取能力本身不隐藏，但调用方仍应遵守目标站点条款、robots 指令、版权、隐私和适用法律；工具每次返回该警告。

## 外部模型脚本：推荐流程

外部模型可以输出 Tampermonkey/UserScript 格式源码，但不要直接执行。让当前 DSH Agent 先调用
`script.validate`，展示名称、`@match`、SHA-256 和能力，再调用
`script.run_userscript`。除 `unrestricted` 外，执行调用会进入 Harness 的
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

`script.evaluate` 是面向当前持久页的短表达式入口，不使用 UserScript 元数据。它能调用页面已有 JavaScript、读取或修改 DOM、访问非 HttpOnly Cookie 和 Web Storage，也能通过 `fetch` 等浏览器 API 发起页面来源允许的请求。插件会明确报告这些能力，但不会判断具体网站是否允许该访问；调用方应根据目标网站规则及适用要求使用并承担相应责任，插件只执行被批准的浏览器操作。表达式没有 Node.js 全局对象或直接主机文件系统权限，结果必须可 JSON 序列化；超时会通过 Chromium DevTools 终止页面 JavaScript，保留当前 page/context 供后续读取或导航。需要可复用、可审阅的脚本时仍使用 UserScript 资产流程。

## Cookie 与文件落盘

- `authProfile` 从配置的 `storageStatePath` 载入 Cookie、localStorage 等登录态。只有 `persistState: true` 才在 context 关闭时原子回写该文件；全局兼容路径默认不会被交互会话改写。
- `script.evaluate` 可读取 `document.cookie`，因此能看到当前来源的非 HttpOnly Cookie；浏览器不会向页面 JavaScript 暴露 HttpOnly Cookie。除 `unrestricted` 外，每次执行都需要确认。
- `act.upload` 只读取调用中列出的绝对路径并交给当前页面上传控件，不修改源文件，也不会遍历目录。除 `unrestricted` 外，即使在 `autonomous` 模式也需要确认。
- `observe.screenshot` 和 `snapshot` 只向 `snapshotDir` 写入截图或 HTML；自定义截图名只允许普通文件名，拒绝绝对路径、目录分隔符和 `..`。持久登录态只写配置的状态文件。下载文件只写入 `downloadDir`，见下一节。`script.evaluate` 触发的浏览器下载不由该动作保存或返回：那个下载事件虽然会被同一个监听器按下面的规则落盘并出现在 `inspect.downloads`，但 `script.evaluate` 的结果里不会带路径；需要文件时直接用 `target.download`。
- console/network 捕获必须由 `target.open.capture` 显式启用，只在内存保留最多 200 条；记录文本和 URL 查询中的常见 token/cookie/password 字段会脱敏，网络只保留方法、URL、失败原因或 4xx/5xx 状态，不保存 header/body。

常见读取任务优先用内置脚本：`article-clean`、`links`、`jsonld`、`forms`。它们不返回表单当前值，
也不触发点击或网络写操作。

## 下载落盘

`target.download({url, filename?, timeoutMs?})` 把一个 HTTP(S) URL 的文件保存到 `downloadDir`：

- **带登录态**：使用调用方 session 自己的 context（它的 Cookie、auth profile、代理和 UA）。session 没有页面时按 `defaultAuthProfile` 规则新建 context。session 的 auth profile 只允许发往其 `allowedDomains`：URL（以及重定向落点）在域名之外会被拒绝（`POLICY_DENIED`），不会带着登录态发出去。
- **两步**：先用 context 发 HTTP 请求取回内容；请求失败（非 2xx、网络错误、空内容）再回退为在同一 context 的临时页面里导航，捕获 attachment 下载事件。当前页面不会被导航走。
- **失败即报错**：0 字节结果删除文件并报错，绝不当成功；两步都失败时错误里同时给出两步的原因。失败也会记入 `inspect.downloads`。
- **调用缓冲**：与 `target.open` 一样经过 `usagePolicy`（并发、突发、429/503 退避）。
- **审批**：与 `act.upload` 同档——`read-only` 拒绝，`unrestricted` 放行，其余模式询问，理由里写出 URL。

文件名与位置：

- 默认取服务器建议的名字（`Content-Disposition`，否则 URL 最后一段，否则 `download`），也可用 `filename` 指定。只取 basename：来自服务器的名字会截掉目录部分并替换不可用字符；**你指定的 `filename` 更严格**——绝对路径、含 `/` 或 `\`、`..`、空名、Windows 保留名（`CON`、`NUL`、`COM1`…）以及含 `< > : " | ? *` 都会被拒绝（`INVALID_ARGS`）。控制字符一律去掉，扩展名保留，过长的名字被截断且保留扩展名。
- **不覆盖**：重名时自动加递增后缀（`report.pdf` → `report-1.pdf`），先写到 `downloadDir` 内的临时文件，再用硬链接/独占复制原子地占用最终名字。文件只可能落在 `downloadDir` 内。
- `downloadDir` 默认为 `$DSH_HOME/data/browser/downloads`（与 `snapshotDir` 的默认值同级），必须是绝对路径；`downloadMaxBytes` 默认 100 MiB（上限 10 GiB），超限即中止、删除半成品并报错。
- 返回值：`path`（最终绝对路径）、`filename`、`bytes`、`sha256`、`suggestedFilename`、`source`（`request` 或 `browser`）、`finalUrl`（重定向后与请求不同时）。

`inspect.downloads({limit?, clear?})` 读取**本 session** 的下载记录，除了 `target.download`，也包含点击、导航或脚本触发的下载（浏览器的 download 事件挂在 session 的页面上，统一按同样的规则落盘）。记录只在内存里，每个 session 最多 50 条，`clear` 只清记录不删文件；一个 session 看不到另一个 session 的记录，关闭或重建 context 不会清掉记录（文件还在磁盘上）。状态放在每个 session 自己的状态桶里，不存在会泄漏到别的调用结果里的全局“最近下载”标记；`target.open` 等动作的结果不会附带下载路径。

PDF：本插件不抽取 PDF 文本。用 `target.download` 落盘后取返回的 `path` 交给其他工具处理。

已知限制：第一步的 HTTP 请求由 Playwright 把响应体整体读入内存后再检查大小（`Content-Length` 超限会立即拒绝，但无法在读取途中中止）；浏览器下载事件那一步是流式写盘并按 `downloadMaxBytes` 中止的。把 `downloadMaxBytes` 调得很大时请留意内存。

## 浏览器上下文选项

视口、User-Agent、语言区域、时区和代理只能在 context **创建时**指定，因此有两层：

1. **配置默认值**（扁平键，作用于插件创建的每一个 context，包括 `render`、`snapshot`、`crawl` 的临时 context）：

| 键 | 含义 |
|---|---|
| `viewportMode` | `window`（默认，不传 viewport，保持现状）、`720p`（1280×720）、`1080p`（1920×1080）、`custom` |
| `viewportWidth` / `viewportHeight` | 仅 `custom`：200–7680 / 200–4320 的整数；`custom` 缺任一项会报错，其他模式下写了会在 `runtime.status` 的 `runtimeWarnings` 里提示并忽略 |
| `userAgent` | 不带控制字符，≤512 字符 |
| `locale` | BCP 47，如 `en-US`、`zh-CN` |
| `timezoneId` | IANA 时区，如 `Asia/Shanghai`、`UTC` |
| `proxyServer` | `http://host:port`、`https://…`、`socks5://…`、`socks4://…`（缺省协议按 http）；**不支持账号密码**，带用户名/密码的地址会被拒绝 |
| `proxyBypass` | 逗号分隔的主机列表（需要先有 `proxyServer`，否则提示并忽略） |

非法值在加载配置时抛出带键名的错误，不会被静默忽略。这些键在插件挂载时解析，保存后需重启 profile。

2. **按次参数**：`target.open` 的 `viewport {width,height}`、`userAgent`、`locale`、`timezoneId`、`proxyServer`。语义沿用 `authProfile` / `rulePack` 的先例：

- 选项属于 session 的 context，直到 `target.close`。**省略的选项保持 context 当前值**（不会因为后一次调用没写而重建）；值与 context 已应用的不同，才会关闭旧 context 并用新选项重建。重建后原页面（含弹窗）已关闭，登录态只按 auth profile 的 `persistState` 规则持久化，其余 Cookie 丢失。结果里带 `contextRebuilt: {changed, note}` 和 `contextOptions`（当前生效的选项）。要回到配置默认值，先 `target.close` 再 `target.open`。
- 参数在创建或关闭任何东西之前就校验，无效值返回 `INVALID_ARGS` 且不动当前页面。
- **审批**：`proxyServer` 改变出口、`userAgent` 改变浏览器指纹，所以带这两项的 `target.open` 在 `read-only` 拒绝、`unrestricted` 放行、其余模式询问（理由里写出被改的项）；`viewport`、`locale`、`timezoneId` 不需要额外审批。配置里的默认值是部署方自己的设置，不再逐次审批。

**代理实测（macOS，Chromium 1243 headless shell，Playwright 1.62.1 与 Patchright 1.62.1）**：启动浏览器时不带任何全局 `proxy`，仅在 `newContext({proxy})` 里设置，页面导航和 `context.request` 都确实经过了该代理，两个运行时表现一致，所以插件**没有**设置 `proxy: { server: 'per-context' }` 这个启动选项。注意 Chromium 对回环地址（`localhost`、`127.0.0.1`）本来就不走代理，这是浏览器自己的规则，不是配置失效；Windows 与 Linux 未在本机验证——若在某平台上发现 context 级代理不生效，需要在 `args` 里加 `--proxy-server=per-context` 之类的启动参数（尚未实测，不要当成已验证的方案）。

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
        toolSurface: indexed     # indexed（默认，browser_index + browser_call）| flat（每个动作一个工具）
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
        automationAssets:
          enabled: true
          persistenceMode: suggest # off | manual | suggest | auto-draft
          activationMode: manual   # 当前推荐值；不会因静态校验自动激活
          minSuccessfulRuns: 3
          minDistinctSessions: 2
          successWindowDays: 14
          minSuccessRate: 0.8
          maxCandidates: 20
          candidateTtlDays: 14
          maxSuggestionsPerDay: 2
          maxDrafts: 10
          maxActiveAssets: 50
          retrievalTopK: 5
          catalogTokenBudget: 800
          modelDevelopmentEnabled: true
          maxModelDraftWritesPerSession: 3
          maxTestCredentials: 5     # 每个资产保留最近 N 条测试凭据（激活只认绑定当前 revision 与内容哈希的 passed 凭据）
          minInputSetsForActivation: 2  # 声明了输入的资产，激活要求当前版本的通过凭据至少覆盖 N 组输入（1–5）；无输入的资产不受影响
        maxSessions: 8           # 同时持有 context+page 的 session 上限，超出淘汰最久未使用者
        viewportMode: window     # window（默认）| 720p | 1080p | custom；custom 时再写 viewportWidth / viewportHeight
        # userAgent: ''          # 留空 = 浏览器自带
        # locale: en-US
        # timezoneId: Asia/Shanghai
        # proxyServer: http://127.0.0.1:7890   # 不支持账号密码
        # proxyBypass: example.com,.internal.test
        # downloadDir: D:/dsh/downloads        # 绝对路径；默认 $DSH_HOME/data/browser/downloads
        downloadMaxBytes: 104857600            # 单个下载上限，默认 100 MiB
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

这些字段同时进入 Host settings 命名空间和专用可视化卡片：打开 `设置 → 插件 → 插件配置 → 浏览器自动化`，可调整工具自由度、Playwright/Patchright、OpenCLI、`usagePolicy`、自动化资产策略与限域登录态；同一卡片包含候选提示、脚本列表、JSON 编辑器、测试、激活和归档操作。

- **卡片覆盖全部公开配置字段**：`viewportMode` 等上下文选项在“浏览器上下文”分区，`downloadDir` / `downloadMaxBytes` 在“登录态与高级设置”分区；`maxSessions`（会话上限）和 `args`（Chromium 启动参数，JSON 字符串数组）在“浏览器运行时”分区；`authProfiles`、`rulePacks` 结构较复杂，卡片里不提供表单，只列出名称并注明“在配置文件中编辑”。“调用缓冲 JSON”和“自动化资产策略 JSON”的提示由代码生成，列出全部可用键名。
- **测试输入 JSON** 填一个对象是在当前页面运行一次；填 2 到 5 个对象组成的数组是逐组在全新上下文中回放（等价于 `inputSets`）。卡片逐组显示结果和 `PARAMETERIZATION_SUSPECT` 警告；声明了输入的资产在通过凭据覆盖的输入组数不足 `minInputSetsForActivation` 时，“激活”按钮旁给出说明并保持禁用。
- **新建 recipe** 从 v2 模板开始（带 `schemaVersion: 2`、locator 步骤、`inputSchema` 和 `postconditions` 占位），模板本身可以直接保存。v1 recipe 有“转换为 v2”按钮：生成新草稿并选中，显示仍取第一个匹配的步骤数（`pendingDisambiguation`），原资产不变；有未保存修改时会先确认。
- “提示文本”分区的“导出默认文本”按钮在只读文本框里显示全部默认值（与 `pnpm prompts:dump` 相同的 JSON），复制后按需改写。
- 估算的常驻 L0 token 数与 `node scripts/measure-tool-surface.mjs` 使用同一个估算函数和同一份工具定义，两处数字一致。保存运行时配置后需要重启 profile；资产 CRUD 通过 loopback-only Host RPC 即时落盘。若没有看到卡片，先确认浏览器插件已同步升级并完整重启，而不是只刷新 Web Search Pro 页面。

### Patchright 可选内核

Patchright 是 Playwright-compatible 的 Chromium 驱动，适合普通 Playwright 在搜索页遇到自动化检测时显式启用：

```yaml
browserRuntime: patchright
channel: chrome
headless: false
```

`channel: chrome + headless: false` 是更贴近其推荐的兼容配置；CI/无人值守也可使用 headless，但 `runtime.status.runtimeWarnings` 会如实提示差异。Patchright 会禁用 Playwright console API，因此依赖控制台监听的 Recipe/脚本不应切换到它。不要再叠加自定义 User-Agent、额外请求头或指纹注入器；这类组合更容易形成自相矛盾的指纹。

Camoufox 当前没有硬集成：截至本版，其 JS 包要求 Node 22 且 peer 约束为 `playwright-core <1.61`，与本插件验证的 Playwright/Patchright 1.62.1 不兼容，并需要独立下载 Firefox 内核。后续等版本边界对齐后再作为第三 provider 接入，避免安装后才发生依赖漂移。

## 自定义提示文本

模型读到的提示和建议文本都可以由部署方覆盖：两个常驻工具的描述、`browser_index` 根目录的指南和附言、分组与动作的摘要和说明、错误提示、以及 `dsh-browser` skill。不配置 `prompts` 时所有输出与内置默认逐字节一致。

**键结构**（全部可选；写在 `config.prompts` 下）：

```yaml
- insert:
    - id: browser
      name: '@anweat/dsh-browser'
      config:
        prompts:
          tools:
            browser_index: { description: '浏览器能力目录。无参数：分组与环境状态。' }
            browser_call:  { description: '执行一个浏览器动作；动作名见 browser_index。' }   # 合规声明始终自动追加在末尾
          rootGuide: '先 automation.search；没有合适资产再 target.open -> observe.read -> act.*。'  # 无 skill 时替换精简指南
          rootNote: '内网站点优先用 opencli.run；不要访问生产后台。'                              # 追加在根目录末尾，有 skill 时也显示
          groups:
            act: { summary: '点击、填写、输入（会改变页面）' }
          actions:
            act.click: { summary: '点击元素', notes: '提交类按钮点击后先 observe.read 确认结果。' }
            automation.develop.save: { notes: '保存前先 validate。' }   # 子动作
            observe.read.controls: { notes: '……' }                       # 详情页（notes 替换整页正文）
          errorHints:
            LOCATOR_NOT_FOUND: '没找到元素：先 observe.read 看页面，再换定位方式。'
          skill:
            enabled: true                       # false：不注册 skill，根目录改用精简指南
            description: '浏览器工具使用指南'
            bodyFile: 'D:/dsh/prompts/skill.md' # 绝对路径，替换 SKILL.md 正文（文件缺失/不可读时回退到内置正文）
            append: '## 本部署的约定\n……'      # 追加到正文末尾
```

动作键可以是 `group.action`、子动作（`automation.develop.save`）或详情页（`observe.read.controls`，其 `notes` 即该页正文）。空字符串等于不覆盖。

**导出全部默认文本**：设置面板“提示文本”分区的“导出默认文本”按钮会在只读文本框里显示一份 JSON，结构与 `prompts` 完全一致，包含每个可覆盖项的内置文本，安装包用户不需要任何脚本环境。在仓库检出里也可以运行 `pnpm prompts:dump`（`node scripts/dump-prompts.mjs`），输出与按钮完全相同。复制它，删掉保持默认的部分，改写其余部分，放进配置即可；原样放回不改变任何输出（有测试保证）。

**长度上限**（超限的值整条忽略，不会被截断，并写入诊断）：

| 项 | 上限（字符） |
|---|---|
| 分组/动作/子动作/详情页 `summary` | 300 |
| 动作/子动作 `notes` | 1000（详情页 `notes` 为 3500） |
| `tools.*.description` | 1500 |
| `rootGuide` | 1500 |
| `rootNote` | 800 |
| `errorHints.<CODE>` | 600 |
| `skill.description` | 1000 |
| `skill.append` | 4000 |
| `skill.bodyFile` 文件内容 | 20000 |

**未知或无效的键**（不存在的分组、动作、错误码，类型不对，`bodyFile` 不是绝对路径等）不会报错，只是被忽略。`errorHints` 只覆盖有固定文案的错误码；`INVALID_ARGS`、`ACTION_FAILED`、`UNKNOWN_ACTION` 的提示依上下文生成，不可覆盖，`DEADLINE` 对会改变状态的动作仍使用“结果未知，先核对再重试”的固定提示。

**诊断**：`browser_call({action:"runtime.status"})` 的结果有 `prompts` 段，列出生效的覆盖项（只有键名和长度，不回显全文）、被忽略的条目及原因、`bodyFile` 回退、L0 与各目录层的估算 token。设置卡片的“提示文本”分区显示同样的信息。

**热更新范围**：
- 目录（根目录、分组、动作、子动作、详情页、搜索）、错误提示：下一次调用即生效，无需重启。
- skill：开关、描述、正文文件和追加文本在下一次 `browser_index` / `browser_call` 时检测变化，注册或撤销 provider，或通过 provider 的 `invalidate()` 通知 Host；正文文件内容变化同样会被发现。
- 两个常驻工具的 `description`，以及 `flat` 表面的各动作工具描述：Host 在注册时固定，**保存后需重启 profile 才生效**。

**预算提醒**：默认 L0（两个常驻工具）约 325 token，预算 1500；`browser_index` 每一层（根、分组、动作、子动作、详情页）预算 1000 token。覆盖后超出预算不会被拒绝，但 `runtime.status` 与设置卡片会给出警告和实际数值。写得越长，每次对话常驻的上下文越多，建议先 `pnpm measure:tools` 看一眼。

**不可配置的内容**：动作名、参数 schema、错误码、审批理由（审批弹窗里的措辞与权限模式挂钩，改写可能误导审批人）、`browser_call` 描述末尾的合规声明、结果里带参数的运行时警告文案（`warnings` 以 `code` 为稳定标识）、参数描述和示例（示例是被测试校验过的可执行调用）。

## 登录态复用

- `channel: chromium` + `storageStatePath` 指向一份 storageState JSON，即可用你已登录的身份抓受限页面。
- 新配置优先使用 `authProfiles`：按名称复用全局登录态，但必须用 `allowedDomains` 限域；默认只读，避免一次搜索意外改写 Cookie Vault。
- `target.open` 和 web-search-pro 的平台搜索可选择 `authProfile` / `rulePack`。`runtime.status` 只显示 profile 名称、域名和回写状态，不显示文件路径或 Cookie。
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

在 DSH Desktop（Electron）中，插件会从 `PATH` 查找真正的 Node.js 可执行文件来运行内置 OpenCLI 和浏览器运行时 CLI。若 `opencli.status` 报告找不到 Node.js，可在启动 DSH Desktop 的环境中设置 `DSH_BROWSER_NODE` 为 `node.exe` 的绝对路径，然后重启 Desktop。

插件内先调用 `opencli.status`，不要只看 `runtime.status.opencliEnabled`。后者表示配置开关，
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

`opencli.catalog` 从 `opencli list -f json` 读取并缓存目录，只暴露过滤后的最多 100 条；它不执行站点命令，也不读取站点登录数据。

优先级建议：已有站点 adapter（`opencli <site> <command>`）→ `opencli web read` / `extract` →
`browser network` → DOM state/find/action → 最后才是只读 `eval`。`opencli browser` 必须包含显式 session：

```text
["browser", "research", "open", "https://example.com"]
["browser", "research", "state"]
["browser", "research", "network", "--filter", "title,url"]
["browser", "research", "extract", "--selector", "main"]
["browser", "research", "close"]
```

`opencli.run` 是通用高级入口，可能调用发布、删除、发帖等 adapter，因此无论命令看起来是否只读，
除 `unrestricted` 外都要求原生一次性审批。常规搜索仍优先走 `dsh-web-search-pro` 的只读工具。

## 发布 / 构建

```bash
pnpm install          # 装依赖（playwright / patchright / opencli / @deepseek-ai/*）
pnpm test
pnpm run build        # tsc → lib/
pnpm run verify       # typecheck → build → real-browser tests → client bundle check
node scripts/install-browser.mjs   # 安装 chromium 内核（发布前验证，可选）
```

## 与 dsh-web-search-pro 的关系

`dsh-web-search-pro` 现在 `inject: ['browser']`，其 `web_snapshot` / `web_fetch_pro`(playwright 后端) /
`web_platform_search`(中文社区 playwright + 社交平台 opencli) 全部走本插件的 `browser` 服务。
两者可独立安装，但 web-search-pro 的浏览器类能力依赖 dsh-browser 先行提供 `browser` 服务（Cordis `inject` 自动排序，无需手动控制挂载顺序）。
