# 宿主兼容与 peer 范围

> 适用版本：`@anweat/dsh-browser` 0.2.3 ｜ [返回 README](../../README.md)

面向维护者：为什么 peer 范围写成两段、上界为什么是 `<0.2.3-0`、设置读取与 `inject` 的取舍。每个版本的兼容声明见 [CHANGELOG](../../CHANGELOG.md)。

`0.2.2` 的范围是**三段**：`>=0.2.0-rc.2 <0.2.1-0 || >=0.2.1-rc.2 <0.2.2-0 || >=0.2.2-rc.1 <0.2.3-0`，各对应一条实测过的线（0.2.0 线只有 `0.2.0-rc.2`，
0.2.1 线是 `rc.2` / `rc.3` / `rc.4` / `rc.5`，0.2.2 线目前只实测了 `rc.1`）。`0.2.0-rc.1`、`0.2.1-alpha.*`、`0.2.1-rc.1`、`0.2.2-alpha.*` 与 `0.2.3` 及以上（含它的预发布）一律拒绝。
第三段的下界写 `>=0.2.2-rc.1`，上界写 `<0.2.3-0`：semver 里 0.2.2 正式版排在它的 rc 之上，放行 rc.1 就必然放行 0.2.2 正式版；
写 `<0.2.2` 只会放行 rc 线，等正式版出来就挡住它。所以 **0.2.2 正式版是靠 rc.1 的验证放行的**，它没有在真实宿主上跑过；如果它回归，问题会出在一个本仓库没跑过的版本上。
Cordis peer 是 `~4.0.4 || ~4.1.0`（0.2.2-rc.1 宿主带 cordis 4.1.0 与 schemastery 3.19.0；`>=3.18.2 <4` 仍覆盖 3.19.0）：4.0.x 是 `~4.0.4`：0.2.0-rc.2 宿主声明 `~4.0.4`，0.2.1-rc.2 起声明 `~4.0.5`，两个小版本在本插件用到的契约上没有差别
（插件只把 Cordis 当类型用；在把 Cordis 固定成 4.0.4 的 0.2.0-rc.2 宿主上也验证了加载与工具注册）。cordis 4.1 改了两件事，一件不影响本插件，一件影响：`fiber.config` 变成未解析的原始输入（本插件用 `apply` 的参数，不读它，不受影响）；服务只对提供者 fiber 的后代可见，root 读不到嵌套 fiber 里的 `webServer`，宿主的 `connection.rpc.handle` 因此抛错，见下面“资产 RPC 通道”。schemastery 3.18.5 仍被 `>=3.18.2 <4` 覆盖。
把 `0.2.0` 线放回范围的依据：插件在 0.2.0-rc.2 上用到的宿主接口（`tools` 注册与 `tools/pre-execute` 钩子、`Config` 的 `.volatile()` 与
`settings/mutate` 原子保存、`connection.rpc.handle` + `webServer`、`skills.registerProvider`、客户端模块表里的 primitives / slots /
plugin-manager）与 0.2.1 线逐项一致，真实宿主上的差别只有 Cordis 小版本。`test:peers` 把六个基线并入受支持矩阵，并断言被拒绝的版本。

`0.1.17` 把 DSH 运行时依赖由精确锁定改为范围声明（`^0.1.7-rc.2 || >=0.2.0-rc.1 <0.2.1-0`），
使同一份包可装在 `0.1.7-rc.2` 与 `0.2.0-rc.2` 两代宿主上。`0.2.0-rc.1` 起的新功能（动作体系、skill、recipe v2、
资产版本、提示文本配置等）只在 `0.2.0-rc.2` 上验证过，没有在 `0.1.7-rc.2` 上跑过，所以 `0.2.0` 把范围收成**只覆盖
`0.2.0-rc.2` 这条线**：`>=0.2.0-rc.2 <0.2.1-0`，正式版 `0.2.0` 起即采用这个范围。`0.1.17` 的范围不变，旧宿主继续用它。

这个写法同时满足两种解析，缺一不可：

- 宿主的组装期校验用的是 `semver.satisfies(host, range, { includePrerelease: true })`，所以「单范围能不能过宿主」不是关键。
  真正决定装机成败的是 npm/pnpm 的**默认** semver：预发布版本只有在某个比较符自带同号（同 major.minor.patch）预发布时才被判为满足。
  于是一段式的 `>=0.2.0-rc.2 <0.2.2-0` 过得了宿主校验，却会让 `dsh plugin add` 报 ERESOLVE（下界 tuple 是 0.2.0，接不住 0.2.1-rc.2）；
  所以写成两段，每一段的下界（`>=0.2.0-rc.2`、`>=0.2.1-rc.2`）都自带该线的同号预发布，是**承重**的，必须保留。
- 每一段的上界都是 `<X-0` 而不是 `<X`：后者放行 X 的 alpha 预发布。收口后，若下一条线真出现破坏，
  会在**组装期**直接报 `is incompatible with dsh 0.2.3` 之类并点名，而不是拖到用户机器上变成运行期怪错
  （`0.1.5 → 0.1.7` 曾一次性打断所有按 `0.1.5-alpha.1` 构建的插件）。
- 范围只表示「测过哪些」，不等于承诺不破坏；真正的防线是每换一个 DSH 版本重跑一遍这套验证。
  `pnpm run test:peers`（已并入 `pnpm verify`）用两种解析模式逐个断言受管 peer：`0.2.0-rc.2`、`0.2.1-rc.2` / `rc.3` / `rc.4` / `rc.5`、`0.2.2-rc.1` 必须通过，
  `0.1.7-rc.2`、`0.2.0-rc.1`、`0.2.1-alpha.*`、`0.2.1-rc.1`、`0.2.2-alpha.1`、`0.2.3-rc.1`、`0.2.3` 必须被拒绝；并自带 `--selftest` 已知行为自校验。

`0.1.15` 使用 DSH 新客户端分包：状态存储来自
`dsh-client-store`，设置契约来自 `dsh-client-ui-settings`，客户端 Context
来自 Cordis。npm 上 `0.1.15-alpha.2` 仍声明旧版 DSH peer，不能与本版混用。

设置的读取不再对宿主版本做适配：Host 半边直接使用 Loader 传给 `apply` 的条目配置（设置页由条目的 `Config` schema 派生，
条目 id 为 `browser`），浏览器设置卡片使用 `ConfigForm`/`ctx.configForms`，`devDependencies` 锁定 `0.2.2-rc.1`（cordis 4.1.0；类型与单测按这一版；0.2.0-rc.2 与 0.2.1-rc.x 靠真实宿主验证，不在 devDependencies 里）。
可编辑字段都是 `.volatile()`：保存后新值写入运行中的引用，但浏览器进程、工具暴露与审批规则在启动时一次读取，
所以保存后仍需重启 profile 才生效（只有提示文本覆盖里的目录、错误提示等按调用实时读取，见 [自定义提示文本](../guide/prompts.md)）。

插件只声明 `inject: ['tools']`，**不依赖宿主的 `settings` 服务**：Cordis 4.0.5 把声明了的 `inject` 一律当作必需，若声明 `settings`，
在没有该服务的组合（如 sdk-minimal，或关了 settings 行的 profile）里插件会一直挂起。插件的 Host 半边从不读取 `ctx.settings`，
配置来自 Loader 条目；没有 Settings 服务时按 `Config` 默认值运行，设置卡片只是不显示（客户端只在宿主提供 `browser` 命名空间时才挂载它）。

## 资产 RPC 通道（`/dsh-browser-assets`）

设置卡片的“提示词 / 策略 / 资产 / 运行状态”都走插件自己的 RPC 通道，Host 半边由 `src/automation-assets-rpc.ts` 通过宿主 `connection.rpc.handle` 挂载。

**根因在宿主**：`packages/client/connection/src/rpc-host.ts` 的 `register` 在 `owner.effect(() => owner.webServer.register(route))` 里读 `owner.webServer`，`owner` 是读取 `connection` 服务的 Context，
而它没有注入 `webServer`。cordis 4.0.x 上经 root 读取服务时不做这个检查，一直没出问题；cordis 4.1（DSH 0.2.2-rc.1）起按提供者 fiber 的定义位置检查，抛 `cannot get property "webServer" without inject`
（DSH master 在 2026-11-04 仍是这段代码）。宿主自己的包里没有人调用 `rpc.handle`，所以只有外部插件会踩到。这个异常出在 `ctx.inject` 回调里，宿主不报告：通道没挂上，
卡片仍能渲染，但每个 `/dsh-browser-assets/*` 请求都返回 HTTP 405。退化的样子（实测，截图在验证记录里）：状态摘要少了“浏览器：…”一项；提示词分组显示“暂时读不到插件状态（重启中？），稍后刷新。”和一个误导性的“已覆盖”徽章；
策略覆盖层显示“暂时读不到覆盖层状态”；资产列表与运行状态提示拿不到数据。没有任何一处说明是通道没挂上。

**做法**（不依赖宿主的私有方法）：经一个派生 Context 读 `connection` 服务，这个 Context 把已注入的 `webServer` 作为**自有属性**带上：
`connectionCtx.extend({ webServer: connectionCtx.get('webServer') }).connection.rpc.handle(channel, handler)`（`connectionWithWebServer`）。
`rpc` getter 捕获的 `owner` 就是这个派生 Context，`owner.webServer` 在它自己身上解析，不再走 Connection 插件的定义位置，所以不抛。`Context.extend` 是公开 API
（cordis 的 `Context.extend` 把 meta 属性直接定义在子 Context 上）；路由、信封解码、鉴权闸门、Peer 作用域都是宿主自己的那一套。**所有宿主走同一条路径**（0.2.0 / 0.2.1 / 0.2.2 线都实测），
没有“先试 handle、失败再回退”的分支。只把 root 换成普通的 `connectionCtx` 不够：宿主在那个 Context 上同样读不到 `webServer`。
这个做法由 [#49](https://github.com/anweat/dsh-browser/issues/49)（@shuaigekda）提出并在 0.2.2-rc.1 上验证；本仓库把它放到三个宿主上复验（见 [验证记录 2026-11-09](../validation/2026-11-09-dsh-0.2.2-public-api.md)）。
挂载仍可能失败（例如宿主改了 `rpc.handle` 的行为、通道前缀已被占用）：这时插件在控制台打一条
`dsh-browser: settings-card RPC channel /dsh-browser-assets was not mounted (<原因>); …`（用 `console.warn`：实测 `ctx.logger` 的默认级别会吞掉它），不再静默，effect 返回空的卸载函数。
单测固定了“`handle` 在带自有 `webServer` 的派生 Context 上被调用”与告警内容（含不带 ANSI），真实宿主验证每次都会查 `/dsh-browser-assets/*` 的状态码。
更好的修法仍在宿主一侧：让 `rpc.handle` 用调用方传入的 Context 读 `webServer`；宿主修好后派生 Context 这一步可以删掉（留着也无害）。
