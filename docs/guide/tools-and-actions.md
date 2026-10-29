# 工具与动作

> 适用版本：`@anweat/dsh-browser` 0.2.2 ｜ [返回 README](../../README.md)

模型通过 `browser_index` 查看动作目录、用 `browser_call` 执行动作。本篇讲按任务选动作、工具面、统一信封与错误码、严格定位、完整动作目录，以及随包的 skill。

## 按任务选动作

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

## 工具面与统一信封

模型可见的工具面由 `toolSurface` 决定：

| `toolSurface` | 注册的工具 | 常驻上下文 | 用途 |
|---|---|---|---|
| `indexed`（默认） | `browser_index`、`browser_call` 两个 | 约 0.3k token | 渐进披露：先看目录，再按需查看单个动作的 schema |
| `flat` | 每个可用动作一个工具，名为 `browser_<group>_<action>` | 约 17.4k token（41 个工具；recipe 的 v2 schema 在 `automation.develop` / `automation.run_recipe` 里内联展开） | 对照与调试；与 `indexed` 共用同一份动作注册表和同一个分发入口 |

`indexed` 下：`browser_index()` 列出能力组和当前环境状态（`automationMode`、Chromium 是否已安装）；`browser_index({group})` 列出该组动作；`browser_index({action})` 给出完整参数 schema；`browser_index({query})` 按关键词检索。`browser_call({action, args})` 执行动作，服务端按 schema 校验参数，校验失败返回 `INVALID_ARGS` 并附上精简 schema。所有动作的返回值使用同一信封：

```json
{ "ok": true, "action": "act.click", "executionStatus": "completed", "result": { } }
{ "ok": false, "action": "act.click", "executionStatus": "failed", "error": { "code": "LOCATOR_NOT_FOUND", "message": "<Playwright 原始信息>", "hint": "…" } }
```

错误码：`INVALID_ARGS`、`UNKNOWN_ACTION`、`CAPABILITY_UNAVAILABLE`、`POLICY_DENIED`、`LOCATOR_NOT_FOUND`、`LOCATOR_AMBIGUOUS`、`NOT_ACTIONABLE`、`TARGET_CLOSED`、`TARGET_STALE`、`DEADLINE`、`CANCELLED`、`NOT_FOUND`、`ACTION_FAILED`，以及 recipe 专用的 `VALIDATION_FAILED`、`OUTCOME_UNKNOWN`、`INVALID_RECIPE`、`VALIDATION_MISSING`（v2 草稿没有任何 `assert` 或 postcondition，测试无法通过）。会产生副作用的动作超时时 `executionStatus` 为 `outcome_unknown`，调用方应先核验页面再决定是否重试。

**严格定位**：原子动作和 v2 recipe 步骤共用同一套定位（`src/locator.ts`）。locator 必须只匹配一个元素；匹配多个时该动作**不执行**，返回 `LOCATOR_AMBIGUOUS`，`error.candidates` 给出总数和前 5 个候选（`role`、`name`、文本片段、`visible`）。确需选其中一个时写 `index` 并同时写 `indexReason`，否则拒绝。

**页面代次（generation）**：`target.open`、`observe.read` 和 `act.*` 的结果带 `targetId` 与 `generation`。把 `generation` 作为 `expectGeneration` 传给下一次 `act.*`：如果页面在这期间已经导航，动作返回 `TARGET_STALE`（附当前的 `targetId` / `generation`）且什么都不做，而不是在新页面上误操作。

旧的 30 个 `browser_*` 工具名已不再注册（`flat` 形态中 `browser_<group>_<action>` 与个别旧名相同，但它们现在就是注册表里的动作，返回统一信封）。

## 动作目录

九个动作组（`browser_index()` 的根视图列出同样的组）：

| 组 | 用途 |
|---|---|
| `runtime` | 运行时状态、Chromium 安装、登录 profile 与限流的策略覆盖层 |
| `target` | 打开 / 关闭 / 列出 / 切换本 session 的页面，下载文件 |
| `observe` | 读页面文本、结构化观察（controls / links / tables）、截图 |
| `act` | 点击、填写、输入、清空、按键、选择、勾选、悬停、滚动、上传、等待 |
| `inspect` | 捕获的 console 与失败请求、下载记录、生效的策略 |
| `script` | 页面 JavaScript、内置只读脚本、UserScript |
| `automation` | 检索 / 运行可复用资产、开发草稿、内联 recipe |
| `crawl` | 有界多页遍历 |
| `opencli` | OpenCLI 站点 adapter |

共 41 个动作：

| 动作 | 作用 |
|---|---|
| `target.open` | 打开 URL，返回标题/可读文本/全页截图路径；可显式启用 console/network 内存捕获；可选 `viewport`、`userAgent`、`locale`、`timezoneId`、`proxyServer`（context 创建期选项，见 [下载与上下文选项](downloads-and-context.md#浏览器上下文选项)） |
| `target.download` | 把 URL 的文件保存到 `downloadDir`（带本 session 登录态），返回绝对路径、字节数、sha256；失败即报错，不留 0 字节文件 |
| `target.close` | 关闭当前页（下次 open 全新） |
| `target.list` | 列出本 session 的页面（自己打开的页加上弹窗），含 `id`、`url`、`title`、`active` |
| `target.select` | 把本 session 的某个页面（`target.list` 里的 id）切换为当前页；弹窗不会自动成为当前页 |
| `observe.read` | 读当前页 URL/标题/文本（不截图）；`sections` 可选 `content`（默认）/ `controls` / `links` / `tables`，后三者给出已验证唯一的 locator，可直接传给 `act.*`；可用 `locator` / `region` / `maxItems` / `maxBytes` 限定范围 |
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
| `inspect.policy` | 读生效的 authProfile 与限流项、覆盖层改了什么、最近的审计；`revision` 供写动作作乐观锁 |
| `runtime.set_auth_profile` | 新建或修改 authProfile 的 `allowedDomains` / `persistState` / `storageStatePath`；收紧不询问，放宽按模式处理 |
| `runtime.remove_auth_profile` | 删除 authProfile（总是允许，用到它的 session 立即关闭） |
| `runtime.set_usage_policy` | 修改 `usagePolicy` 限流项；更严不询问，更松按模式处理 |
| `runtime.reset_policy` | 把覆盖层回滚到基线（全部、仅限流项或某个 profile） |
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
| `automation.develop` | 按确切 ID 读取源码，或显式保存、静态校验、真实回放、`convert`（v1 转 v2 新草稿）、`fork`（给已激活资产生成可编辑的修复副本）、`draft_from_journal`（把本 session 的探索记录转成 v2 草稿）；永远不能激活资产 |
| `automation.run` | 按 ID 运行已激活资产；再次执行限域和输入大小校验，审批由 `automationMode` 决定 |
| `opencli.status` | 实际运行 OpenCLI doctor，报告 daemon/extension/profile 连通性 |
| `opencli.catalog` | 对 OpenCLI 大目录按 query/site/access/strategy 过滤，单次最多返回 100 条 |
| `opencli.run` | 通用 OpenCLI argv 网关；除 `unrestricted` 外触发 DSH 原生一次性审批 |
| `crawl.crawl` | 匿名、有限广度遍历；默认同源，强制使用全局调用缓冲和单次页数/深度预算 |

## dsh-browser skill

插件在 Host 提供 `skills` 服务时注册 `dsh-browser` skill（`assets/skills/dsh-browser/`：SKILL.md 与 `references/`），内容为复用优先、定位策略、按错误码处理失败、沉淀资产和边界。`skills` 不是必需依赖：没有该服务时插件照常工作，`browser_index()` 的根目录附一段不超过 300 token 的精简指南。skill 与精简指南都可以用 `prompts` 配置覆盖，见 [自定义提示文本](prompts.md)。
