# 使用策略：防止过度调用的缓冲

> 适用版本：`@anweat/dsh-browser` 0.2.2 ｜ [返回 README](../../README.md)

`usagePolicy` 是资源与站点压力保护，不是审批系统。所有模式共用同一个进程内 Governor：

- `maxConcurrency` 限制同时发起的导航，超出后排队；`burst` + `minDelayMs` 限制单站点短时突发。
- OpenCLI adapter / Browser Bridge 调度也占用同一全局并发与 burst 缓冲，不会因绕过 Playwright 而失去节流。
- 站点返回 429、502、503、504 时，按 `Retry-After` 或指数退避进入站点级冷却，最多重试 `retryLimit` 次。
- `crawl.crawl` 还受 `maxPagesPerRun` 和 `maxDepth` 硬上限约束；调用参数只能收紧，不能突破配置。
- 泛爬取默认使用匿名 context，不继承全局 `storageStatePath` 或 `defaultAuthProfile`；登录后读取仍使用显式限域的单页/Recipe 工具。
- `runtime.status` 显示累计运行、排队、等待和 backoff 次数，便于判断是否调用过密。
- 泛爬取能力本身不隐藏，但调用方仍应遵守目标站点条款、robots 指令、版权、隐私和适用法律；工具每次返回该警告。
