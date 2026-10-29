# 更新记录

[返回 README](README.md)

`@anweat/dsh-browser` 的版本记录，最新的在最前。每个版本写三件事：**兼容的 DSH 版本**、**改了什么**、**怎么升级**。日期是 git tag 的日期；没有 tag 的预发布版本不写日期。

当前版本的兼容性一览在 [README](README.md#兼容性)；peer 范围的写法与取舍见 [docs/dev/host-compat.md](docs/dev/host-compat.md)。

升级的通用步骤：

```bash
dsh plugin --profile <name> add @anweat/dsh-browser@<版本>
# 然后完整重启 profile（Web profile 关闭了 HMR；只刷新网页不会重新加载插件服务）
```

DSH Desktop 上的升级方式见 [README 的 Desktop 安装](README.md#安装)。

## 0.2.2（2026-10-28）

**兼容**：`dsh-v0.2.0-rc.2`，`dsh-v0.2.1-rc.2` / `rc.3` / `rc.4`。同时支持两条线：受管 peer `>=0.2.0-rc.2 <0.2.1-0 || >=0.2.1-rc.2 <0.2.2-0`，Cordis peer `~4.0.4`，`devDependencies` 锁在 `0.2.1-rc.3`，schemastery 3.18.5。**源码不为任何一个宿主版本改动**：在真实安装的 0.2.0-rc.2、0.2.1-rc.3、0.2.1-rc.4 宿主上都完成了干净安装、Web 设置卡片渲染与保存、skill 注册、资产 RPC、`tools/pre-execute` 审批钩子的验证（见 [docs/validation/2026-10-28-compat-dist.md](docs/validation/2026-10-28-compat-dist.md)）。0.2.0 线宿主此前只能用 `0.2.1`，现在也可以装 `0.2.2`。验证：typecheck、构建、peer 双解析模式检查、单测、真实 Chromium e2e 与 client bundle 检查全绿，三个宿主版本上分别做了干净安装与设置卡片保存。

**升级**：行为、配置键与审批规则与 `0.2.1` 相同；从 `0.2.1` 直接升级即可，不配置新键时行为不变（除下面的安装行为变化）。

- **设置界面重做**（用户反馈“文字和框体太多，不知道怎么配，没有注释”）：状态摘要 + 九个可折叠分组（默认只展开“常用”）+ 一直在视野里的保存条（“N 项未保存 / 放弃 / 保存”）；下拉、开关、数字加单位、chips、列表和弹窗取代了整页文本框。登录 profile、提示词、自动化资产都是“列表 + 编辑弹窗”，提示词弹窗左右对照“默认文本｜我的覆盖”。每个键都有注释：字段旁一句话 + `?` 里的长说明，properties 文本模式每个键前一行注释，示例配置与导出的提示词默认文本（新的带注释 YAML）同样如此。保存结构、`Config` schema 与运行时行为不变（`authProfiles` 现在也能在卡片里改，它在 schema 里本来就可写）。详见 [设置卡片](docs/guide/settings-card.md) 与 [配置参考](docs/guide/configuration.md)。
- **干净安装不再失败：OpenCLI 不再是依赖，改为可选并单独安装。** 旧版本把 `@jackwener/opencli` 列为 `dependencies`，它的 install 脚本（只做 shell 补全和清理测试文件）在新用户的 profile 里被 pnpm 11 拦下，`dsh plugin add` 以 `ERR_PNPM_IGNORED_BUILDS` 失败；更糟的是宿主只在“新增的依赖”上把插件加入 bundles，那次失败之后再 `add` 也不会补上，插件从来没有被启用。改成 `optionalDependencies` 没用（pnpm 11 仍然拦）。现在：包里没有 OpenCLI；`opencli.*` 动作在找到 OpenCLI 时照常工作（`PATH`、全局 npm 目录、nvm / fnm / Volta、profile 里自己装的、`DSH_BROWSER_OPENCLI`），找不到时返回带 `npm i -g @jackwener/opencli` 的说明；`runtime.status` 多了 `opencliSource` 与 `opencliInstallHint`，未安装不再是 `runtimeWarnings`。**已经在用内置 OpenCLI 的人**：升级后它会从 profile 里消失，如果你需要它，`npm i -g @jackwener/opencli` 并重启即可（已经全局装过的不用做任何事）。Web Search Pro 优先使用独立的 `opencli`，它的 `browser-opencli` 后备后端同样依赖这份安装。详见 [登录态复用与 OpenCLI](docs/guide/login-and-opencli.md)。
- **新用户第一次使用不再卡在“没有 Chromium”：** 默认 `channel: chromium` 在 Playwright 的 Chromium 没有下载过时，自动改用本机的 Google Chrome 或 Microsoft Edge（macOS、Windows、Linux 的常见安装位置；不下载、不联网）；都没有时，`runtime.status` 的 `browser.ready` 为 `false`，`browser.installAdvice`、启动失败的错误信息、`browser_index` 根视图、设置卡片的状态摘要都给出同一组可照做的选项（装 Chrome / Edge、`runtime.install`、终端命令、`executablePath`）。`runtime.status` 新增 `browser`（`ready`、`source`、`path`、`note`、`installAdvice`）与 `systemBrowsers`；`chromiumInstalled` 与 `chromiumExecutablePath` 照旧。显式配置的 `executablePath` / `channel` 永远照你写的用，不会被悄悄替换，写错了会点名是哪个设置错了。详见 [内核与依赖](docs/guide/runtime-and-dependencies.md)。
- 新增 context 创建期选项：配置键 `viewportMode` / `viewportWidth` / `viewportHeight` / `userAgent` / `locale` / `timezoneId` / `proxyServer` / `proxyBypass`，以及 `target.open` 的按次参数 `viewport` / `userAgent` / `locale` / `timezoneId` / `proxyServer`（见 [下载与上下文选项](docs/guide/downloads-and-context.md)）。
- 新增 `target.download` 与 `inspect.downloads`，以及配置 `downloadDir`、`downloadMaxBytes`（见同一篇）。新增 `target.download` / `inspect.downloads` 使动作总数从 34 变为 36。
- **嵌套写法不再被静默忽略**：配置里写 `viewport: {width, height}`、`proxy: {...}`、`contextOptions`、`download(s)` 会被忽略，并在 `runtime.status` 的 `runtimeWarnings` 里说明应使用哪些扁平键。**配置错误不会让插件加载失败**（否则设置卡片也会一起消失）：无效的值回退到默认并同样出现在 `runtimeWarnings`。
- 带 `proxyServer` 或 `userAgent` 的 `target.open` 在 `standard` / `autonomous` 下需要审批，`read-only` 拒绝，`unrestricted` 放行；`target.download` 与 `act.upload` 同档。
- 新增“策略覆盖层”：agent 可经 `inspect.policy` 与 `runtime.set_auth_profile` / `remove_auth_profile` / `set_usage_policy` / `reset_policy` 编辑限制类设置（authProfile 的域名、新建/删除，usagePolicy 限流项），不必用户手填。**`unrestricted` 下 agent 可自行放宽限制**，见 [策略覆盖层与风险](docs/guide/policy-overlay.md)。动作总数 36 变 41；新增配置 `allowPrivateHosts`（默认关）。

## 0.2.1（2026-10-05）

**兼容**：`dsh-v0.2.0-rc.2`（不变）。相对 `0.2.0` 的补丁版，DSH 基线与 peer 范围（`>=0.2.0-rc.2 <0.2.1-0`）不变，只含两项：

1. 参数无效的调用不再先弹审批：审批钩子先判断动作是否被当前 `automationMode` 禁用（禁用仍直接拒绝），再用与 `runAction` 相同的校验检查参数，无效则不询问，执行层再校验一次并返回带精简 schema 的 `INVALID_ARGS`，不执行任何页面动作；参数有效时的审批规则与理由不变。
2. “探索转草稿”（`draft_from_journal`）的指导文本补充。

不改动作、参数 schema 与审批规则。在 `0.2.0-rc.2` 上完成 337 项测试与 66 项真实浏览器 e2e。

**升级**：

- 从 `0.2.0` 直接升级即可，DSH 基线、peer 范围、动作、参数 schema、面向模型的文本与审批规则都没有变化，已保存的资产、配置与提示文本覆盖照常使用。
- 唯一的行为变化：参数无效的调用（例如 `act.select` 把 `values` 写成 `value`）不再先弹审批、等用户点“允许”之后才返回 `INVALID_ARGS`；现在直接返回 `INVALID_ARGS`（带精简 schema），页面没有任何改动，模型改对后只会询问一次。被当前 `automationMode` 禁用的动作仍直接拒绝。

## 0.2.0（2026-10-04）

**兼容**：`dsh-v0.2.0-rc.2`。第一个面向 DSH 桌面版 0.2.0 线的正式版，也是后续开发的基底。**只支持 `dsh-v0.2.0-rc.2` 这一条线**（peer `>=0.2.0-rc.2 <0.2.1-0`）：去掉为更旧宿主保留的兼容分支（`settings.register` 的 live scope 回退等），并去掉对 `settings` 服务的必需依赖（只声明 `inject: ['tools']`，没有 Settings 服务的组合里也能启动）；不改工具、动作、schema、文本与审批规则。在 `0.2.0-rc.2` 上完成 327 项测试、64 项真实浏览器 e2e 与 peer 双解析模式检查。旧宿主（0.1.7 线，`dsh-v0.1.7-rc.2`）继续使用 `0.1.17`。

**升级**（承接 `0.2.0-rc.1` 的体系变更，从 `0.1.x` 升上来的人一并阅读）：

- 旧的 `browser_open`、`browser_click` 等工具名不再注册。模型通过 `browser_index` 查看动作目录，再用 `browser_call` 执行，例如 `{"action":"act.click","args":{...}}`。需要一次性看到全部动作时，把 `toolSurface` 设为 `flat`。
- 其他插件或自定义提示词里如果写了旧工具名，需要同步修改。Web Search Pro 请使用提示词已更新的版本。
- 已保存的 recipe 和 userscript 资产照常可读、可运行；升级到 v2 用 `automation.develop` 的 `convert`，它只生成新草稿，不改原资产。
- 激活资产现在要求当前版本有通过的测试记录。旧资产加载时会自动补一条“旧版”记录。
- **声明了输入的资产，激活门槛提高了。** 新增策略项 `automationAssets.minInputSetsForActivation`（默认 2，范围 1–5）：带 `inputSchema` 或 `inputNames` 的资产，当前版本的通过凭据必须覆盖至少这么多组不同输入（`automation.develop` 的 `test` 传 `inputSets`；设置面板的“测试输入 JSON”填 2 到 5 个对象的数组），否则激活被拒绝，错误里写明原因。只用一组输入测试通过的 recipe 可能把那组输入写死，换一组就失败。没有输入的资产不受影响；升级前已通过测试的旧资产带“旧版”凭据，视为满足，不会因升级而无法激活。要恢复旧行为，把它设为 `1`。
- `BrowserService` 上供其他插件调用的方法（`render`、`snapshot`、`searchResults`、`opencli`、`close`）签名不变。
- **依赖范围收窄到 DSH 0.2.0 线。** peer 范围为 `>=0.2.0-rc.2 <0.2.1-0`（插件自身不再覆盖 `0.1.7-rc.2` 与 `0.2.0-rc.1`）。
- 先确认宿主是 `dsh-v0.2.0-rc.2`。宿主更旧时，`dsh plugin add` 会因 peer 不满足而拒绝，或在组装期点名报 `incompatible`；这类宿主继续使用 `0.1.17`。
- 工具、动作、参数 schema、文本与审批规则相对 `0.2.0-rc.1` 都没有变化，已保存的资产、配置与提示文本覆盖照常使用。
- 设置的保存与重启生效路径不变：在设置卡片保存后重启 profile 生效。
- 不再要求宿主提供 `settings` 服务：插件只声明 `inject: ['tools']`；有 Settings 服务时设置卡片照常显示，没有时按配置默认值运行。

## 0.2.0-rc.1（2026-10-04，预发布，仅作历史记录）

**兼容**：`dsh-v0.1.7-rc.2` ~ `dsh-v0.2.0-rc.2`。预发布通道 `@next` 不再用于安装。

**破坏性变更**：30 个 `browser_*` 工具改为 `browser_index` / `browser_call` 两个入口加动作目录（常驻约 325 token，原约 8.8k）；随包提供 `dsh-browser` skill；recipe v2、资产版本与激活保护、结构化观察、探索记录生成草稿、提示文本可配置。并入按 session 隔离浏览器状态（#36）与 dialog 竞态修复（#30）。在 `0.2.0-rc.2` 上完成 325 项测试、64 项真实浏览器 e2e 与真实 Web profile 验证。迁移说明见上面的 0.2.0。

## 0.1.17（2026-10-03）

**兼容**：`dsh-v0.1.7-rc.2` ~ `dsh-v0.2.0-rc.2`。peer 收口为“实测过的两条线”（上界 `<0.2.1-0`），DSH 运行时依赖由精确锁定改为范围声明（`^0.1.7-rc.2 || >=0.2.0-rc.1 <0.2.1-0`），使同一份包可装在 `0.1.7-rc.2` 与 `0.2.0-rc.2` 两代宿主上。在 `0.2.0-rc.2` 上完成 typecheck、构建、52 项测试与真实挂载验证；补充浏览器缓存路径配置说明，并新增 peer 双解析模式检查。旧的 `browser_*` 工具体系，**0.1.7 线宿主（`dsh-v0.1.7-rc.2`）请固定使用这一版**。

**升级**：Web Search Pro 与浏览器插件应同步升级；面向 `dsh-v0.1.7-rc.2` 不要混用仍声明旧 peer 的 Browser `0.1.15-alpha.2`；两者都升到 `0.1.17` 即可。

```bash
dsh plugin --profile web add @anweat/dsh-browser@0.1.17 dsh-web-search-pro@0.1.17
```

升级后完整停止并重启 Web profile，再调用 `runtime.status`、`opencli.status` 和 `web_backend_status`；仅刷新网页不会重新加载插件服务或 Web Search Pro 配置面板。尤其不要只升级 Web Search Pro：新的工具目录、Patchright 运行时和调用缓冲都来自浏览器插件。

## 0.1.15（2026-09-27）

**兼容**：`dsh-v0.1.7-rc.2`，精确锁定该宿主版本；组合安装、真实 Web profile 与设置持久化已验证。使用 DSH 新客户端分包：状态存储来自 `dsh-client-store`，设置契约来自 `dsh-client-ui-settings`，客户端 Context 来自 Cordis。npm 上 `0.1.15-alpha.2` 仍声明旧版 DSH peer，不能与本版混用。

## 0.1.12 及更早（2026-08-29 ~ 2026-09-09）

**兼容**：`dsh-v0.1.1-rc.2` 至 `dsh-v0.1.2-rc.1`。旧基线的维护版本；不与新插件混装。
