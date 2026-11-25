# 登录态复用与 OpenCLI

> 适用版本：`@anweat/dsh-browser` 0.2.3 ｜ [返回 README](../../README.md)

## 登录态复用

- `channel: chromium` + `storageStatePath` 指向一份 storageState JSON，即可用你已登录的身份抓受限页面。
- 新配置优先使用 `authProfiles`：按名称复用全局登录态，但必须用 `allowedDomains` 限域；默认只读，避免一次搜索意外改写 Cookie Vault。
- `target.open` 和 web-search-pro 的平台搜索可选择 `authProfile` / `rulePack`。`runtime.status` 只显示 profile 名称、域名和回写状态，不显示文件路径或 Cookie。
- RulePack 仍只允许有界动作；init script 必须是本地、SHA-256 固定且不超过 64KB。外部模型 JavaScript 使用独立的 UserScript 工具，不能冒充 RulePack；除 `unrestricted` 外需一次性审批。
- 回写（`persistState: true`）的规则见下一节：只写“这次改了什么”，不会拿一个被登出的结果覆盖好的登录。
- 生成登录态：`npx playwright codegen --save-storage=storageState.json`（或复用 `dsh-web-search-pro` 的 `scripts/save-login.mjs`），把产物路径填进 `storageStatePath`。
- opencli 的社交平台后端（小红书/推特/Reddit/IG/FB）仍需浏览器扩展 + 登录态在线，装好 opencli 也绕不开扩展。

## persistState 怎么回写

`persistState: true` 的 profile 在 context 关闭时把刷新后的状态写回文件（轮换的 refresh token、续期的 cookie、localStorage）。写法是**合并增量**，不是用 context 的全量状态覆盖文件：

- **增量**：context 创建时载入的（按 `allowedDomains` 过滤后的）状态是基线；关闭时只算出“相对基线改了什么”（cookie 的身份是 name + domain + path + partitionKey），再合并进**此刻的**文件内容。profile 域名之外的 cookie 和 origin 原样保留；context 里顺手收到的其他域名 cookie 一律不写；context 里没出现的 origin 不会删掉文件里的。所以一个文件里放两个站点、或两个 profile 共用一个文件，都不会互相丢数据。
- **独占**：render / snapshot / 平台搜索（`searchPage` / `searchResults`）/ 脚本 / 隔离 recipe 这类短操作，从读文件到写回结束，**同一个状态文件一次只允许一个**（按文件真实路径，两个 profile 共用一个文件也排队；`persistState: false` 的 profile 和不同文件互不阻塞）。这样并发的搜索不会拿着同一个一次性 token 各自刷新。等待遵从取消信号，最长 60 秒，超时报“login state … is in use by another operation”。`target.open` 开的交互会话是长期的，**不占这把锁**，只靠增量合并。
- **不拿坏结果覆盖好登录**：短操作遇到下面的情况**不写回**：平台搜索的结论是 `needs_login` / `captcha` / `blocked` / `rate_limited` / `site_error` / `network` / `timeout`；render / snapshot / 脚本的主文档状态是 401 / 403 / 429 / 5xx，或页面有登录 / 验证码信号且这次删掉了基线里的 cookie；任何短操作的增量会删掉基线里**全部**cookie。交互会话照写，因为用户可能是有意登出。
- **备份与保护**：内容有变化时，先把原文件留成 `<文件>.bak`（0600，只留一代，原子写），再原子替换；没有变化就不写。目录 0700、文件 0600。当前文件解析不了（损坏）时**不覆盖**，直接报错，不假装成功。
- **IndexedDB**：关闭时用 `storageState({ indexedDB: true })` 取状态，所以 IndexedDB 里的登录信息能活到下次。取失败或结果超过 5 MiB 时退回不含 IndexedDB 的状态，文件里已有的 IndexedDB 原样保留。
- **看结果**：`runtime.status` 的 `authProfiles[].writeBack` 给出该 profile 最近一次回写的结果：`written` / `unchanged` / `skipped`（带一句原因，如 `search page state needs_login`）/ `failed`（带错误码）和时间；没有 cookie 名、值或路径。只反映本进程内的最近一次。

**不保证的事**：多个 DSH 进程同时用一个状态文件时，锁只在进程内；增量合并仍保证不丢别人的数据，但两个进程可能从同一个一次性 token 起步。站点端的设备绑定、IP 变化、行为风控不在这里的范围。

## 平台搜索页的结论：`searchPage`

web-search-pro 之类的调用方可用 `browser.searchPage(url, spec, opts)`，拿到的是**状态**而不是“空数组”（dsh-browser 提供，web-search-pro 可选使用；没有这个方法的旧版本服务，调用方退回 `searchResults`）：

| `state` | 含义 |
|---|---|
| `ok` | 取到结果（`items`，最多 20 条，形状同 `searchResults`） |
| `empty` | 页面明确说没有结果 |
| `empty_unconfirmed` | 没有结果，也没有任何说明 |
| `needs_login` / `captcha` / `blocked` / `rate_limited` / `site_error` | 登录墙或跳转登录 / 验证码 / HTTP 403 / HTTP 429 / HTTP 5xx |
| `network` / `timeout` | 连不上 / 导航没在时限内完成 |
| `contract_drift` | 页面上有列表，但 `spec` 的选择器读不到 |

判决是几个信号之间的**竞争**，不是固定睡眠：约每 150 ms 读一次页面；有结果且连续两次数量相同就是 `ok`，结果永远优先（哪怕同时有登录框）；验证码、登录、明确的“没有结果”要连续出现 1.2 秒才算数；`contract_drift` 至少 4 秒后、DOM 节点数 1 秒没变才判，导航、页脚、侧栏里的链接不算列表；到总时限（默认 12 秒，`opts.timeoutMs`）仍无信号就是 `empty_unconfirmed`。页面信号只看**可见**元素（隐藏的密码框不是登录信号），页头里的“登录”二字也不是。`PlatformSpec` 可选带 `emptySelector` / `loginSelector` / `captchaSelector`，站点自己的标记优先于通用判断。`detail` 是一句英文依据，不含 cookie、token 或页面正文；`finalUrl` 去掉了 query 和 hash。

取消（`signal`）和配置错误（未知 profile、域名不允许）照旧抛出，站点与网络造成的失败一律是状态。`searchResults` 现在建在 `searchPage` 之上，公开行为不变：返回条目（没有就是空数组），`network` / `timeout` 仍抛 `browser platform search failed for …`；规则包步骤、`opts.waitMs`、`opts.cookies`、20 条上限、条数不足时滚动一次都保留。

## OpenCLI 的安装与查找

要用站点 adapter（`opencli.*`）或 Web Search Pro 的 `browser-opencli` 后端时：`npm i -g @jackwener/opencli`，装完重启 DSH，再调用 `opencli.status`。插件按这个顺序找它：环境变量 `DSH_BROWSER_OPENCLI`（`main.js`、`opencli` 启动器或包目录）→ profile 里自己装的 → `PATH` 上的 `opencli` → `npm root -g` → 常见全局目录（Homebrew、`~/.npm-global`、nvm / fnm / Volta 的各个 Node 版本）。从程序坞启动的桌面版没有 shell 的 `PATH`，所以最后两步专门兜这种情况；找不到时设 `DSH_BROWSER_OPENCLI`。`DSH_BROWSER_OPENCLI` 一旦设置就只认它：路径写错时不会悄悄改用别处的 OpenCLI，而是在 `opencli.status` 里点名报错。

**版本**：插件支持 OpenCLI `>=1.8.0 <2`。2.x 把结果默认包成 `{ok,data}` 信封、`list` 改成分页对象，目前**没有适配**。已装的是 2.x 时，`opencli.status`、`opencli.catalog`、`opencli.run` 会直接说明“OpenCLI 2.x.y is installed, but dsh-browser supports OpenCLI >=1.8.0 <2 only”并给出 `npm i -g @jackwener/opencli@1.8.8`，不再报笼统的“must be an array”。版本从定位到的入口旁的 `package.json` 读出，判断时不启动 OpenCLI 进程；`runtime.status` 里 `opencliVersion` 是版本，`opencliUnsupported` 是这句话，同时进 `runtimeWarnings`。

想把 OpenCLI 装进 profile 里（而不是全局）：先在 profile 的 `pnpm-workspace.yaml` 写 `allowBuilds: { '@jackwener/opencli': false }`（它的安装脚本只做 shell 补全和清理测试文件，不运行也不影响功能），再 `dsh plugin --profile <name> add @jackwener/opencli`。

## OpenCLI 连接检查

OpenCLI 是可选组件，不随插件安装（见上一节）。先全局安装它，再用同一个 CLI 在终端排查 Browser Bridge：

```bash
npm i -g @jackwener/opencli
opencli daemon status
opencli doctor
```

健康状态应同时包含 daemon running、extension connected 和一个 connected Chrome profile。仅安装 npm 包不等于 Browser Bridge 可用；Chrome 扩展断开时，OpenCLI 社区搜索会明确失败，而普通 Playwright 浏览器工具不受影响。

在 DSH Desktop（Electron）中，插件会从 `PATH` 查找真正的 Node.js 可执行文件来运行 OpenCLI 和浏览器运行时 CLI。若 `opencli.status` 报告找不到 Node.js，可在启动 DSH Desktop 的环境中设置 `DSH_BROWSER_NODE` 为 Node.js 可执行文件（Windows 上是 `node.exe`）的绝对路径，然后重启 Desktop。

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
