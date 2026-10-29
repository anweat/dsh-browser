# 外部模型脚本：推荐流程

> 适用版本：`@anweat/dsh-browser` 0.2.2 ｜ [返回 README](../../README.md)

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
