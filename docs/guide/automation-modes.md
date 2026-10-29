# 自动化自由度与审批

> 适用版本：`@anweat/dsh-browser` 0.2.2 ｜ [返回 README](../../README.md)

`automationMode` 决定模型能看到哪些动作、哪些动作要审批。

`automationMode` 控制模型可见的工具集合和执行审批。建议从 `standard` 开始，仅在完全只读任务或受控自动化环境中切换：

| 模式 | 浏览器与 Web Search Pro 写操作 | 仍需审批或拒绝 | 不可取消的安全底线 |
|---|---|---|---|
| `read-only` | 只读工具与只读 Recipe；缓存清理、规则写入和安装拒绝 | 页面交互、写 Recipe、UserScript、OpenCLI run 均隐藏或拒绝 | 只能读取、校验、截图及运行只读脚本/Recipe |
| `standard`（默认） | 页面交互、写 Recipe、缓存清理和规则写入均需一次性审批 | UserScript、通用 OpenCLI、浏览器/后端安装也需审批 | 所有安全校验持续启用 |
| `autonomous` | 页面交互、写 Recipe、缓存清理和规则写入可直接执行 | 外部 UserScript、通用 OpenCLI、浏览器/后端安装仍强制审批 | 所有安全校验持续启用 |
| `unrestricted` | 所有上述工具均不触发审批，适合隔离环境中的无人值守测试 | 无审批提示 | 仍执行域名、元数据、参数、大小和步骤数校验 |

**策略动作**（`runtime.set_auth_profile` 等）：收紧在所有模式下直接执行，放宽在 `read-only` 拒绝、`standard` / `autonomous` 询问、`unrestricted` 直接执行（见 [策略覆盖层与风险](policy-overlay.md)）。

`unrestricted` 会允许模型直接运行外部脚本、通用 CLI 和安装命令，只应在隔离的测试 profile 或明确授权的自动化环境中使用；日常 profile 保持 `standard`。它只取消人工确认，**不会取消 `usagePolicy` 的并发、突发、页数、深度、重试与冷却保护**。模式改变后需要重启 DSH profile，工具目录才会按新配置重新注册。

## 审批按动作判断

**审批按动作判断**：Host 的审批理由写明动作和关键参数（例如 `act.click role="button" name="Submit"`），`browser_index` 直接放行，`browser_call` 解析出动作后适用与下表相同的规则，不可用的动作在 `browser_call` 中再拒绝一次。判断顺序：先看动作是否被当前模式禁用（禁用则拒绝），再按动作的参数 schema 校验参数（与执行层是同一个校验；无效则不询问，直接交给执行层返回 `INVALID_ARGS`，不会执行任何页面动作），最后才是审批规则。Host 里按工具名设置的“总是允许”不会跳过插件策略。运行或回放资产（`automation.run`、`automation.develop` 的 `test`）时，审批理由写资产名称、版本和短 id，例如 `automation.run "Host check: docs search" r1 (5fdc912d)`；名称去掉换行并截断到 60 个字符。
