# `browser` 服务与 session 隔离

> 适用版本：`@anweat/dsh-browser` 0.2.2 ｜ [返回 README](../../README.md)

面向把本插件当底层服务使用的其他插件作者，也解释多个 session 同时用浏览器时的隔离边界。

## 服务：`browser`

`dsh-browser` 在 `apply()` 里 `ctx.provide('browser', service)`。任何插件声明
`inject: ['browser']` 即可消费：

```ts
export const inject = ['tools', 'browser']
export function apply(ctx: Context) {
  const browser = ctx.get('browser') as BrowserService
  // 例如 browser.render / snapshot / searchResults / opencli / recipe / crawl /
  // runBuiltinScript / runUserscript / open / observe / read / click / type / scroll / screenshot / download / close
}
```

服务接口（结构性，无需共享类型包）见 `src/browser-service.ts` 里的 `BrowserService`；`render`、`snapshot`、`searchResults`、`opencli`、`close` 供其他插件调用，签名从 0.2.0 起不变。

## 跨 session 隔离

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
| `inspect.policy` / `runtime.*_policy` / `runtime.set_auth_profile` | 策略覆盖层是全局的（所有 session 共用一份生效策略），不属于任何 session；审计里的 session id 只对产生它的 session 可见，别的 session 看到 `another session` |
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

## 与 dsh-web-search-pro 的关系

`dsh-web-search-pro`（0.2.x）是本插件的可选搭档：它的 `read.snapshot`、`read.fetch mode=playwright`、搜索页类平台和 OpenCLI 后备后端都走本插件的 `browser` 服务；网页搜索、证据管线和 CLI 平台不需要浏览器。两者可独立安装，没有 dsh-browser 时这些浏览器类能力不可用。

Web Search Pro **没有**把 `browser` 写进 `inject`（Cordis 4.0.x 把声明的每个 `inject` 都当作必需，没有可选写法，会让它在没装浏览器插件时一直挂起），而是在每次调用时用 `ctx.get('browser')` 读取，所以挂载顺序不用手动控制。Web Search Pro 0.2+ 只支持本插件 0.2.x，旧的 0.1.x 会被识别为不支持。
