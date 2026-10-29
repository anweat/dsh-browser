# 文档索引

[返回 README](../README.md) ｜ [English README](../README.en.md) ｜ [CHANGELOG](../CHANGELOG.md)

`@anweat/dsh-browser` 0.2.2 的文档。README 是入口（安装、第一次使用、快速示例）；这里按主题列出其余文档。`docs/` 不随 npm 包发布。

## 用户指南（docs/guide/，中文）

| 文件 | 内容 |
|---|---|
| [configuration.md](guide/configuration.md) | 配置参考：带注释的完整示例、RulePack 步骤、保存后何时生效 |
| [settings-card.md](guide/settings-card.md) | 设置卡片：状态摘要、九个分组、保存条、文本模式、测试输入、提示词分区 |
| [tools-and-actions.md](guide/tools-and-actions.md) | 按任务选动作、`indexed` / `flat` 工具面、统一信封与错误码、严格定位、41 个动作的目录、skill |
| [recipes.md](guide/recipes.md) | Playwright Recipe：基本写法、schema v2、执行结果的含义 |
| [automation-assets.md](guide/automation-assets.md) | 可复用自动化资产（实验性）：积累、总结、模型显式开发、激活 |
| [automation-modes.md](guide/automation-modes.md) | 四档 `automationMode` 与按动作的审批规则 |
| [service-and-sessions.md](guide/service-and-sessions.md) | `browser` 服务（给其他插件用）、跨 session 隔离、与 dsh-web-search-pro 的关系 |
| [policy-overlay.md](guide/policy-overlay.md) | 策略覆盖层：agent 可编辑的限制类设置、审批方向、校验与风险 |
| [usage-policy.md](guide/usage-policy.md) | `usagePolicy`：并发、突发、退避、爬取预算 |
| [downloads-and-context.md](guide/downloads-and-context.md) | Cookie 与文件落盘、`target.download`、视口 / UA / 语言 / 时区 / 代理等 context 选项 |
| [login-and-opencli.md](guide/login-and-opencli.md) | 登录态复用（`authProfile`、RulePack）、OpenCLI 的安装 / 查找 / 连接检查 |
| [runtime-and-dependencies.md](guide/runtime-and-dependencies.md) | 浏览器怎么选、打包 vs 复用、缓存目录、Patchright 内核 |
| [prompts.md](guide/prompts.md) | 自定义模型看到的提示文本、长度上限、热更新范围 |
| [userscripts.md](guide/userscripts.md) | 外部模型生成 UserScript 的推荐流程与兼容范围 |

## 开发者文档（docs/dev/）

| 文件 | 内容 |
|---|---|
| [dev/build-and-release.md](dev/build-and-release.md) | 构建、测试与发布命令，文档约定 |
| [dev/host-compat.md](dev/host-compat.md) | 宿主兼容：peer 范围为什么写成两段、上界的取舍、设置读取与 `inject` |

## 验证记录（docs/validation/）

| 文件 | 内容 |
|---|---|
| [2026-10-04.md](validation/2026-10-04.md)、[.json](validation/2026-10-04.json) | 0.2.0：真实浏览器及 DeepSeek 验证（9 条夹具用例） |
| [2026-10-12.md](validation/2026-10-12.md) | dev/0.2.2：真实 DSH Host 验证（context 选项、下载等） |
| [2026-10-26-commandcode.md](validation/2026-10-26-commandcode.md) | dev/0.2.2：真实 DSH 0.2.1-rc.3 宿主 + command-code 的 DeepSeek 模型验证 |
| [2026-10-28-compat-dist.md](validation/2026-10-28-compat-dist.md) | 0.2.2 发布前：DSH 0.2.0-rc.2 / 0.2.1-rc.x 兼容与 npm 分发 |

## 其他

- [AUDIT.md](../AUDIT.md)：2026-09 的代码、issue 与构建审查，以及安全边界（随包发布；基于 0.1.12，部分内容已过时）。

## 旧 README 章节 → 新位置

2026-10-29 之前，README 有 818 行，下表列出每一节现在在哪里。

| 旧章节（README.md 2026-10-28 版） | 新位置 |
|---|---|
| 开头：AUDIT 提示、简介、OpenCLI 可选说明 | [README](../README.md) 的开头与“亮点”；AUDIT 链接也在上面的“其他” |
| 兼容与发布通道：版本表 | [CHANGELOG](../CHANGELOG.md)（每个版本一节）；当前版本一张小表在 README 的“兼容性” |
| 兼容与发布通道：`0.2.2` 范围、Cordis peer、两种 semver 解析、`test:peers` | [dev/host-compat.md](dev/host-compat.md) |
| 兼容与发布通道：设置读取不再适配宿主、保存后需重启 | [guide/configuration.md#保存后何时生效](guide/configuration.md#保存后何时生效)；技术取舍在 [dev/host-compat.md](dev/host-compat.md) |
| 兼容与发布通道：不依赖 `settings` 服务 | [guide/configuration.md#保存后何时生效](guide/configuration.md#保存后何时生效) 与 [dev/host-compat.md](dev/host-compat.md) |
| 安装 | README 的“安装”（CLI、DSH Desktop、本地目录）；Desktop 为新增 |
| 第一次使用：重启与设置卡片 | README 的“第一次使用” |
| 第一次使用：浏览器 | README 的“第一次使用”（摘要）；全文在 [guide/runtime-and-dependencies.md](guide/runtime-and-dependencies.md#浏览器怎么选) |
| 第一次使用：OpenCLI（可选） | README 的“第一次使用”（摘要）；全文在 [guide/login-and-opencli.md](guide/login-and-opencli.md#opencli-的安装与查找) |
| 从旧版本升级：0.2.2 / 0.2.1 / 0.2.0 / 0.1.17 | [CHANGELOG](../CHANGELOG.md) 对应版本 |
| 快速使用与适用情形（表格、合规声明、会话示例） | [guide/tools-and-actions.md#按任务选动作](guide/tools-and-actions.md#按任务选动作)；合规声明也在 README |
| 内核与依赖的“打包 vs 复用” | [guide/runtime-and-dependencies.md](guide/runtime-and-dependencies.md#打包-vs-复用) |
| 把共享浏览器缓存放到别的盘 | [guide/runtime-and-dependencies.md](guide/runtime-and-dependencies.md#把共享浏览器缓存放到别的盘可选) |
| 服务：`browser` | [guide/service-and-sessions.md](guide/service-and-sessions.md#服务browser) |
| 跨 session 隔离 | [guide/service-and-sessions.md](guide/service-and-sessions.md#跨-session-隔离) |
| 自动化自由度 | [guide/automation-modes.md](guide/automation-modes.md) |
| 工具与动作：工具面、信封、错误码、严格定位 | [guide/tools-and-actions.md](guide/tools-and-actions.md#工具面与统一信封) |
| 工具与动作：recipe 的执行结果、Recipe schema v2 | [guide/recipes.md](guide/recipes.md) |
| 工具与动作：审批按动作判断 | [guide/automation-modes.md#审批按动作判断](guide/automation-modes.md#审批按动作判断) |
| 动作目录 | [guide/tools-and-actions.md#动作目录](guide/tools-and-actions.md#动作目录)；分组概览也在 README |
| dsh-browser skill | [guide/tools-and-actions.md#dsh-browser-skill](guide/tools-and-actions.md#dsh-browser-skill) |
| 可复用自动化资产（实验性）、模型显式开发 | [guide/automation-assets.md](guide/automation-assets.md) |
| 使用策略：防止过度调用的缓冲 | [guide/usage-policy.md](guide/usage-policy.md) |
| 外部模型脚本：推荐流程 | [guide/userscripts.md](guide/userscripts.md) |
| Cookie 与文件落盘 | [guide/downloads-and-context.md#cookie-与文件落盘](guide/downloads-and-context.md#cookie-与文件落盘) |
| 策略覆盖层与风险 | [guide/policy-overlay.md](guide/policy-overlay.md) |
| 下载落盘 | [guide/downloads-and-context.md#下载落盘](guide/downloads-and-context.md#下载落盘) |
| 浏览器上下文选项 | [guide/downloads-and-context.md#浏览器上下文选项](guide/downloads-and-context.md#浏览器上下文选项) |
| Playwright Recipe | [guide/recipes.md#基本写法](guide/recipes.md#基本写法) |
| 配置（cordis.yml / patch config）：带注释的示例 | [guide/configuration.md](guide/configuration.md) |
| 配置：设置卡片、文本模式、测试输入、提示词分区 | [guide/settings-card.md](guide/settings-card.md) |
| Patchright 可选内核（含 Camoufox 说明） | [guide/runtime-and-dependencies.md#patchright-可选内核](guide/runtime-and-dependencies.md#patchright-可选内核) |
| 自定义提示文本 | [guide/prompts.md](guide/prompts.md) |
| 登录态复用 | [guide/login-and-opencli.md#登录态复用](guide/login-and-opencli.md#登录态复用) |
| OpenCLI 连接检查 | [guide/login-and-opencli.md#opencli-连接检查](guide/login-and-opencli.md#opencli-连接检查) |
| 发布 / 构建 | [dev/build-and-release.md](dev/build-and-release.md) |
| 与 dsh-web-search-pro 的关系 | [guide/service-and-sessions.md#与-dsh-web-search-pro-的关系](guide/service-and-sessions.md#与-dsh-web-search-pro-的关系)；README 的“第一次使用”也有一句 |
