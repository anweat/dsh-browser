# 2026-09-10 代码、issue 与构建审查

基于 `2f6a134` / 0.1.12；本地候选包 0.1.13，尚未发布。Windows x64、Node 24.14.0、pnpm 11.7.0。

## 本轮修复

| 问题 | 影响与处理 | 验证 |
|---|---|---|
| 激活资产的 UserScript 在 autonomous 下直接放行 | 资产入口读取 Host 保存的真实 kind；UserScript 和未知 kind 继续审批，recipe 维持原策略 | 策略回归覆盖三种 kind 情形 |
| UserScript 只验证输入 URL | 重定向后可能在不匹配的页面执行源码；现在执行前再次验证最终 URL | 本地 HTTP 302 + 真实 Chrome 拒绝执行 |
| authProfile 把整个 storageState 文件装入 context | 文件中的无关域 Cookie/Storage 可能被带入页面请求；现在只装载 allowedDomains 内的条目 | 真实 context storageState 检查 |
| open 接受 file 等非网页协议 | 与 HTTP(S) 工具契约不一致；在创建/复用 context 前拒绝 | file URL 负例 |
| 资产 UI 使用专用旧 Connection RPC channel | 在 Connection 先于 WebServer 时可能无物理路由；迁到共享认证 /api 的八个精确 POST 路由 | 真实 0.1.5-rc.1 Connection/WebServer：认证成功、未认证 401、未知路径 404、卸载撤销 |
| 隐藏 input[type=file] 等待可见导致超时 | 改为等待 attached，再执行 setInputFiles | 真实隐藏控件上传 fixture |
| wait timeoutMs=0 实际关闭超时 | 改为 1–30000 ms，拒绝未知 condition | 参数负例 |

增加 browser_wait / browser_press / browser_select / browser_check，复用 Recipe 执行路径、取消信号和现有审批规则。当前最多 28 个工具，read-only 为 15 个。

## 必须准确理解的边界

- `allowedDomains` 是登录态选择及装载过滤，不是网络隔离。站点重定向、子资源、iframe、页面 fetch、WebSocket 等不受完整网络出口策略约束；本插件不是 SSRF 沙箱。对不可信网页需要独立浏览器/账号及 OS 或代理层网络控制。
- `@match` 是执行准入规则，不是 JavaScript 沙箱；代码启动后可导航、读写页面或调用网络。UserScript 能力标签来自静态识别，不是权限强制执行。
- rulePack 是操作者提供的受信配置。固定 SHA-256 证明文件身份，不限制代码能力；init script 也不能解释为来源隔离。
- read-only 限制模型工具的直接写操作，不保证网页无副作用。页面加载、站点脚本和操作者配置的 rulePack 都可能改变站点状态。
- Cordis `browser` 服务是供受信插件调用的底层接口；模型审批发生在 Host 工具钩子，不能当作任意插件直接调用服务时的安全边界。
- 一份 BrowserService 只有一份持久活动页；这里没有实现每 Agent/会话独立浏览器容器。与内置 browser 共存还需 service realm、工具 scope 和 Agent 绑定；仅改 entry id 或工具前缀不够。
- browser_evaluate 超时仍关闭活动页。单纯 Promise.race 超时不会停止页面代码，不能为了保留页面而宣称执行已取消。
- 资产 UI 操作通过 Host 认证通道，由操作者点击触发，不经过模型工具审批。没有新增匿名写接口。

## 真实 issue 对照与剩余工作

| 来源 | 当前判断 |
|---|---|
| [#19 基础操作与诊断](https://github.com/anweat/dsh-browser/issues/19) | wait/press/select/check 已补；语义定位、console/network 缓冲、局部截图、iframe 和会话参数仍是后续功能，未宣称整条关闭 |
| [#15 evaluate、上传、hover](https://github.com/anweat/dsh-browser/issues/15) | 0.1.12 已存在；本轮补隐藏上传与脚本边界 |
| [#11 内置 browser 冲突](https://github.com/anweat/dsh-browser/issues/11) | 仍成立：默认 bundle id=browser、service=browser，五个同名工具；substrate npm 包只修 entry id |
| [#13 settingsNamespace](https://github.com/anweat/dsh-browser/issues/13) | 当前代码已移除运行时导入；保留类型依赖不等于运行时旧导出依赖 |
| [#10 prompt 变量](https://github.com/anweat/dsh-browser/issues/10) | 工具 schema 回归通过 |
| [#9 Chromium 状态](https://github.com/anweat/dsh-browser/issues/9) | 当前有文件存在性检查；系统 Chrome 状态与缓存 Chromium 状态仍须区分 |

后续调用记录应依托 Host 的 callId/owner/scope/approval/result 事件；默认不记录输入正文、Cookie、脚本、文件路径或网页全文。全局按名字匹配的审批钩子在多 provider 组合中还需要归属隔离，不能靠名字列表自动推断所有权。

## 验收范围

`npm run verify`：42 项测试通过、TypeScript 与构建通过、client bundle 检查通过。包含真实 Chrome、Playwright、Patchright 测试。`node scripts/check-host-rpc.mjs <exact-installed-host-root>` 验证真实 HTTP/认证路由。

这不是完整 DSH UI/所有旧版 Host/多 Agent 隔离/网络沙箱的生产证明。旧问题解决与新功能缺口分别记录，未向外发布或关闭 issue。
