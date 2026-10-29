# 下载、文件落盘与浏览器上下文选项

> 适用版本：`@anweat/dsh-browser` 0.2.2 ｜ [返回 README](../../README.md)

## Cookie 与文件落盘

- `authProfile` 从配置的 `storageStatePath` 载入 Cookie、localStorage 等登录态。只有 `persistState: true` 才在 context 关闭时原子回写该文件；全局兼容路径默认不会被交互会话改写。
- `script.evaluate` 可读取 `document.cookie`，因此能看到当前来源的非 HttpOnly Cookie；浏览器不会向页面 JavaScript 暴露 HttpOnly Cookie。除 `unrestricted` 外，每次执行都需要确认。
- `act.upload` 只读取调用中列出的绝对路径并交给当前页面上传控件，不修改源文件，也不会遍历目录。除 `unrestricted` 外，即使在 `autonomous` 模式也需要确认。
- `observe.screenshot` 和 `snapshot` 只向 `snapshotDir` 写入截图或 HTML；自定义截图名只允许普通文件名，拒绝绝对路径、目录分隔符和 `..`。持久登录态只写配置的状态文件。下载文件只写入 `downloadDir`，见下面的“下载落盘”。`script.evaluate` 触发的浏览器下载不由该动作保存或返回：那个下载事件虽然会被同一个监听器按下面的规则落盘并出现在 `inspect.downloads`，但 `script.evaluate` 的结果里不会带路径；需要文件时直接用 `target.download`。
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
| `viewportWidth` / `viewportHeight` | 仅 `custom`：200–7680 / 200–4320 的整数；`custom` 缺任一项时回退为 `window` 并给出警告，其他模式下写了宽高会提示并忽略 |
| `userAgent` | 不带控制字符，≤512 字符 |
| `locale` | BCP 47，如 `en-US`、`zh-CN` |
| `timezoneId` | IANA 时区，如 `Asia/Shanghai`、`UTC` |
| `proxyServer` | `http://host:port`、`https://…`、`socks5://…`、`socks4://…`（缺省协议按 http）；**不支持账号密码**，带用户名/密码的地址会被拒绝 |
| `proxyBypass` | 逗号分隔的主机列表（需要先有 `proxyServer`，否则提示并忽略） |

非法值**不会让插件加载失败**：该键回退到默认值，`runtime.status` 的 `runtimeWarnings` 与设置卡片顶部状态摘要里的警告数（点开看详情）给出一条警告（键名、原值摘要、原因、如何修，代理地址里的账号密码会被遮蔽）。设置卡片的“默认参数”编辑区在保存前用同一套规则逐行校验，非法行显示行号与原因并禁用保存。这些键在插件挂载时解析，保存后需重启 profile。

2. **按次参数**：`target.open` 的 `viewport {width,height}`、`userAgent`、`locale`、`timezoneId`、`proxyServer`。语义沿用 `authProfile` / `rulePack` 的先例：

- 选项属于 session 的 context，直到 `target.close`。**省略的选项保持 context 当前值**（不会因为后一次调用没写而重建）；值与 context 已应用的不同，才会关闭旧 context 并用新选项重建。重建后原页面（含弹窗）已关闭，登录态只按 auth profile 的 `persistState` 规则持久化，其余 Cookie 丢失。结果里带 `contextRebuilt: {changed, note}` 和 `contextOptions`（当前生效的选项）。要回到配置默认值，先 `target.close` 再 `target.open`。
- 参数在创建或关闭任何东西之前就校验，无效值返回 `INVALID_ARGS` 且不动当前页面。
- **审批**：`proxyServer` 改变出口、`userAgent` 改变浏览器指纹，所以带这两项的 `target.open` 在 `read-only` 拒绝、`unrestricted` 放行、其余模式询问（理由里写出被改的项）；`viewport`、`locale`、`timezoneId` 不需要额外审批。配置里的默认值是部署方自己的设置，不再逐次审批。

**代理实测（macOS，Chromium 1243 headless shell，Playwright 1.62.1 与 Patchright 1.62.1）**：启动浏览器时不带任何全局 `proxy`，仅在 `newContext({proxy})` 里设置，页面导航和 `context.request` 都确实经过了该代理，两个运行时表现一致，所以插件**没有**设置 `proxy: { server: 'per-context' }` 这个启动选项。注意 Chromium 对回环地址（`localhost`、`127.0.0.1`）本来就不走代理，这是浏览器自己的规则，不是配置失效；Windows 与 Linux 未在本机验证——若在某平台上发现 context 级代理不生效，需要在 `args` 里加 `--proxy-server=per-context` 之类的启动参数（尚未实测，不要当成已验证的方案）。
