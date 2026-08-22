# dsh-browser

自包含的浏览器运行时插件 for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）。

把 **Playwright（chromium 内核）** 与 **OpenCLI** 作为插件自身的 npm 依赖打包（优先插件本地，缺省回退全局复用），对外提供一个 `browser` 服务 + 一组交互式浏览器工具。`dsh-web-search-pro` 通过 `inject: ['browser']` 注入该服务，驱动它的 playwright / opencli 后端——**不再依赖全局 CLI**。

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

## 快速使用与适用情形

安装并重启后，可先让模型调用 `browser_status`，再按任务选择工具：

| 情形 | 推荐方式 | 关键边界 |
|---|---|---|
| 公开网页读取、截图 | `browser_open` → `browser_read` / `browser_screenshot` | 不需要登录态 |
| 表单、分页、懒加载 | `browser_click` / `browser_type` / `browser_scroll` | 选择器由调用方明确提供 |
| 登录后站点 | `authProfile` | 必须配置 `allowedDomains`；默认不回写 Cookie |
| 固定站点增强 | `rulePack` | 只允许有界步骤；本地 init script 必须 SHA-256 固定且 ≤64KB |
| Reddit/小红书等 OpenCLI 平台 | `browser` 服务的 `opencli()` | Chrome 扩展与目标站点登录态必须在线 |

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
| **opencli**（纯 Node CLI） | `@jackwener/opencli` npm 依赖 | 同上，本地优先 / 全局复用 |

## 服务：`browser`

`dsh-browser` 在 `apply()` 里 `ctx.provide('browser', service)`。任何插件声明
`inject: ['browser']` 即可消费：

```ts
export const inject = ['tools', 'browser']
export function apply(ctx: Context) {
  const browser = ctx.get('browser') as BrowserService
  // browser.render / snapshot / searchResults / opencli / open / click / type / scroll / read / screenshot / close
}
```

服务接口（结构性，无需共享类型包）见 `src/browser-service.ts`。

## 工具（9 个）

| 工具 | 作用 |
|---|---|
| `browser_open` | 打开 URL，返回标题/可读文本/全页截图路径（持久页会话） |
| `browser_click` | 按 CSS 选择器点击 |
| `browser_type` | 向 input/textarea 输入 |
| `browser_scroll` | 纵向滚动（触发懒加载） |
| `browser_read` | 读当前页 URL/标题/文本（不截图） |
| `browser_screenshot` | 当前页全页截图 |
| `browser_close` | 关闭当前页（下次 open 全新） |
| `browser_status` | 运行时状态（channel/headless/chromium 是否就绪/opencli 是否启用/当前页） |
| `browser_install` | 安装 playwright chromium（`browser_status` 报缺失时执行一次） |

## 配置（cordis.yml / patch config）

```yaml
- insert:
    - id: browser
      name: '@anweat/dsh-browser'
      config:
        channel: chromium        # 'chromium'（打包内核）| 'msedge'（系统 Edge）
        headless: true
        opencliEnabled: true
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

## 登录态复用

- `channel: chromium` + `storageStatePath` 指向一份 storageState JSON，即可用你已登录的身份抓受限页面。
- 新配置优先使用 `authProfiles`：按名称复用全局登录态，但必须用 `allowedDomains` 限域；默认只读，避免一次搜索意外改写 Cookie Vault。
- `browser_open` 和 web-search-pro 的平台搜索可选择 `authProfile` / `rulePack`。`browser_status` 只显示 profile 名称、域名和回写状态，不显示文件路径或 Cookie。
- RulePack 只允许有界动作；init script 必须是本地、SHA-256 固定且不超过 64KB，不提供“模型直接执行任意 JS”的入口。
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

## 发布 / 构建

```bash
pnpm install          # 装依赖（playwright / opencli / @deepseek-ai/*）
pnpm test
pnpm run build        # tsc → lib/
node scripts/install-browser.mjs   # 安装 chromium 内核（发布前验证，可选）
```

## 与 dsh-web-search-pro 的关系

`dsh-web-search-pro` 现在 `inject: ['browser']`，其 `web_snapshot` / `web_fetch_pro`(playwright 后端) /
`web_platform_search`(中文社区 playwright + 社交平台 opencli) 全部走本插件的 `browser` 服务。
两者可独立安装，但 web-search-pro 的浏览器类能力依赖 dsh-browser 先行提供 `browser` 服务（Cordis `inject` 自动排序，无需手动控制挂载顺序）。
