# 宿主兼容与 peer 范围

> 适用版本：`@anweat/dsh-browser` 0.2.2 ｜ [返回 README](../../README.md)

面向维护者：为什么 peer 范围写成两段、上界为什么是 `<0.2.2-0`、设置读取与 `inject` 的取舍。每个版本的兼容声明见 [CHANGELOG](../../CHANGELOG.md)。

`0.2.2` 的范围是**两段**：`>=0.2.0-rc.2 <0.2.1-0 || >=0.2.1-rc.2 <0.2.2-0`，各对应一条实测过的线（0.2.0 线只有 `0.2.0-rc.2`，
0.2.1 线是 `rc.2` / `rc.3` / `rc.4`）。`0.2.0-rc.1`、`0.2.1-alpha.*`、`0.2.1-rc.1` 与 `0.2.2` 及以上（含它的预发布）一律拒绝。
Cordis peer 是 `~4.0.4`：0.2.0-rc.2 宿主声明 `~4.0.4`，0.2.1-rc.2 起声明 `~4.0.5`，两个小版本在本插件用到的契约上没有差别
（插件只把 Cordis 当类型用；在把 Cordis 固定成 4.0.4 的 0.2.0-rc.2 宿主上也验证了加载与工具注册）。schemastery 3.18.5 仍被 `>=3.18.2 <4` 覆盖。
把 `0.2.0` 线放回范围的依据：插件在 0.2.0-rc.2 上用到的宿主接口（`tools` 注册与 `tools/pre-execute` 钩子、`Config` 的 `.volatile()` 与
`settings/mutate` 原子保存、`connection.rpc.handle` + `webServer`、`skills.registerProvider`、客户端模块表里的 primitives / slots /
plugin-manager）与 0.2.1 线逐项一致，真实宿主上的差别只有 Cordis 小版本。`test:peers` 把四个基线并入受支持矩阵，并断言被拒绝的版本。

`0.1.17` 把 DSH 运行时依赖由精确锁定改为范围声明（`^0.1.7-rc.2 || >=0.2.0-rc.1 <0.2.1-0`），
使同一份包可装在 `0.1.7-rc.2` 与 `0.2.0-rc.2` 两代宿主上。`0.2.0-rc.1` 起的新功能（动作体系、skill、recipe v2、
资产版本、提示文本配置等）只在 `0.2.0-rc.2` 上验证过，没有在 `0.1.7-rc.2` 上跑过，所以 `0.2.0` 把范围收成**只覆盖
`0.2.0-rc.2` 这条线**：`>=0.2.0-rc.2 <0.2.1-0`，正式版 `0.2.0` 起即采用这个范围。`0.1.17` 的范围不变，旧宿主继续用它。

这个写法同时满足两种解析，缺一不可：

- 宿主的组装期校验用的是 `semver.satisfies(host, range, { includePrerelease: true })`，所以「单范围能不能过宿主」不是关键。
  真正决定装机成败的是 npm/pnpm 的**默认** semver：预发布版本只有在某个比较符自带同号（同 major.minor.patch）预发布时才被判为满足。
  于是一段式的 `>=0.2.0-rc.2 <0.2.2-0` 过得了宿主校验，却会让 `dsh plugin add` 报 ERESOLVE（下界 tuple 是 0.2.0，接不住 0.2.1-rc.2）；
  所以写成两段，每一段的下界（`>=0.2.0-rc.2`、`>=0.2.1-rc.2`）都自带该线的同号预发布，是**承重**的，必须保留。
- 上界是 `<0.2.2-0` 而不是 `<0.2.2`：后者放行 `0.2.2-alpha.1` 这类 0.2.2 的预发布。收口后，若 0.2.2 真出现破坏，
  会在**组装期**直接报 `is incompatible with dsh 0.2.2` 并点名，而不是拖到用户机器上变成运行期怪错
  （`0.1.5 → 0.1.7` 曾一次性打断所有按 `0.1.5-alpha.1` 构建的插件）。
- 范围只表示「测过哪些」，不等于承诺不破坏；真正的防线是每换一个 DSH 版本重跑一遍这套验证。
  `pnpm run test:peers`（已并入 `pnpm verify`）用两种解析模式逐个断言受管 peer：`0.2.0-rc.2`、`0.2.1-rc.2` / `rc.3` / `rc.4` 必须通过，
  `0.1.7-rc.2`、`0.2.0-rc.1`、`0.2.1-alpha.*`、`0.2.1-rc.1`、`0.2.2-alpha.1`、`0.2.2` 必须被拒绝；并自带 `--selftest` 已知行为自校验。

`0.1.15` 使用 DSH 新客户端分包：状态存储来自
`dsh-client-store`，设置契约来自 `dsh-client-ui-settings`，客户端 Context
来自 Cordis。npm 上 `0.1.15-alpha.2` 仍声明旧版 DSH peer，不能与本版混用。

设置的读取不再对宿主版本做适配：Host 半边直接使用 Loader 传给 `apply` 的条目配置（设置页由条目的 `Config` schema 派生，
条目 id 为 `browser`），浏览器设置卡片使用 `ConfigForm`/`ctx.configForms`，`devDependencies` 锁定 `0.2.1-rc.3`（类型与单测按这一版；0.2.0-rc.2 与 0.2.1-rc.4 靠真实宿主验证，不在 devDependencies 里）。
可编辑字段都是 `.volatile()`：保存后新值写入运行中的引用，但浏览器进程、工具暴露与审批规则在启动时一次读取，
所以保存后仍需重启 profile 才生效（只有提示文本覆盖里的目录、错误提示等按调用实时读取，见 [自定义提示文本](../guide/prompts.md)）。

插件只声明 `inject: ['tools']`，**不依赖宿主的 `settings` 服务**：Cordis 4.0.5 把声明了的 `inject` 一律当作必需，若声明 `settings`，
在没有该服务的组合（如 sdk-minimal，或关了 settings 行的 profile）里插件会一直挂起。插件的 Host 半边从不读取 `ctx.settings`，
配置来自 Loader 条目；没有 Settings 服务时按 `Config` 默认值运行，设置卡片只是不显示（客户端只在宿主提供 `browser` 命名空间时才挂载它）。
