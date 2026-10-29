# 登录态复用与 OpenCLI

> 适用版本：`@anweat/dsh-browser` 0.2.2 ｜ [返回 README](../../README.md)

## 登录态复用

- `channel: chromium` + `storageStatePath` 指向一份 storageState JSON，即可用你已登录的身份抓受限页面。
- 新配置优先使用 `authProfiles`：按名称复用全局登录态，但必须用 `allowedDomains` 限域；默认只读，避免一次搜索意外改写 Cookie Vault。
- `target.open` 和 web-search-pro 的平台搜索可选择 `authProfile` / `rulePack`。`runtime.status` 只显示 profile 名称、域名和回写状态，不显示文件路径或 Cookie。
- RulePack 仍只允许有界动作；init script 必须是本地、SHA-256 固定且不超过 64KB。外部模型 JavaScript 使用独立的 UserScript 工具，不能冒充 RulePack；除 `unrestricted` 外需一次性审批。
- 生成登录态：`npx playwright codegen --save-storage=storageState.json`（或复用 `dsh-web-search-pro` 的 `scripts/save-login.mjs`），把产物路径填进 `storageStatePath`。
- opencli 的社交平台后端（小红书/推特/Reddit/IG/FB）仍需浏览器扩展 + 登录态在线，装好 opencli 也绕不开扩展。

## OpenCLI 的安装与查找

要用站点 adapter（`opencli.*`）或 Web Search Pro 的 `browser-opencli` 后端时：`npm i -g @jackwener/opencli`，装完重启 DSH，再调用 `opencli.status`。插件按这个顺序找它：环境变量 `DSH_BROWSER_OPENCLI`（`main.js`、`opencli` 启动器或包目录）→ profile 里自己装的 → `PATH` 上的 `opencli` → `npm root -g` → 常见全局目录（Homebrew、`~/.npm-global`、nvm / fnm / Volta 的各个 Node 版本）。从程序坞启动的桌面版没有 shell 的 `PATH`，所以最后两步专门兜这种情况；找不到时设 `DSH_BROWSER_OPENCLI`。`DSH_BROWSER_OPENCLI` 一旦设置就只认它：路径写错时不会悄悄改用别处的 OpenCLI，而是在 `opencli.status` 里点名报错。

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
