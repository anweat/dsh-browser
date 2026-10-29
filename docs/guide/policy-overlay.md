# 策略覆盖层与风险

> 适用版本：`@anweat/dsh-browser` 0.2.2 ｜ [返回 README](../../README.md)

“限制类”设置（authProfile 的域名与登录态文件、`usagePolicy` 限流项）现在可以由 agent 经动作编辑，用户不必手填。机制是一层受管理的**覆盖文件** `$DSH_HOME/data/browser/policy-overlay.json`（原子写、`0600`，带 `revision`、`updatedAt` 和最近 50 条审计），合并在设置面板的配置（基线）之上，**覆盖层优先**。它只能保存两类字段：`authProfiles` 和 `usagePolicy`。

**动作与审批**——按方向判断，不按动作名：

| 变更 | `read-only` | `standard` / `autonomous` | `unrestricted` |
|---|---|---|---|
| 收紧：删域名、缩小范围、删 profile、`persistState` 关闭、限流更严 | 直接执行 | 直接执行 | 直接执行 |
| 放宽：加域名、新建 profile、`persistState` 开启（写磁盘）、换状态文件、限流更松、回滚到更宽的基线 | 拒绝 | 询问，理由里写出 diff | 直接执行，结果带 `risk` |

- 每次修改必须带 `reason`（3–300 字符），返回 `before` / `after` / `changes`，并写入审计（来源、session、时间、reason、方向、变更行）。可选 `expectedRevision` 作乐观锁，过期则报错且什么都不改。
- 变更立即生效：用到被收回登录态的 session 会被关闭（`sessionsClosed`），下一次 `target.open` 重新开始；撤销的域名在下一次调用就被拒绝，不是等到下次启动。放宽后，已经持有该登录态 context 的 session 在下一次 `target.open` 会重建 context（`contextRebuilt.changed` 含 `authProfileScope`），新域名的 Cookie 才会注入；不重建的话旧 context 里没有那个域名的 Cookie。
- **风险与 unrestricted 行为**：`unrestricted` 不会询问，所以 agent 可以自行加域名、新建 profile、把限流放宽到配置允许的上限。放宽的结果里总带 `risk: {level: "elevated", loosened, approval, note}`，设置卡片的“策略覆盖层”分区列出生效值、每项的来源（基线 / 来自覆盖层 / 覆盖层新建）和审计。要避免 agent 自行放宽，请不要对该 profile 使用 `unrestricted`（`autonomous` 下放宽仍然询问）。
- 面板里“清除覆盖 / 回滚到基线”按钮与每个 profile 的“回滚此项”只动覆盖层，不改基线配置，同样写审计。

**校验**（agent 写入时和每次加载覆盖文件时各做一遍，任何一项不过，写入被拒；已有文件则整体被忽略）：

- **域名**：规范化为小写 punycode；拒绝 `*`、裸 TLD、公共后缀（内置的小列表：`co.uk`、`com.cn`、`github.io`、`vercel.app`、`pages.dev` 等加 ccTLD 二级的结构规则，不是完整的 PSL）、IP 字面量（含 `127.1`、`2130706433` 这类写法和通配 IP）、含端口/路径/协议/凭据/空白/控制字符的输入、重复项（`*.a.com` 与 `a.com` 视为同一范围）；通配只允许 `*.example.com` 且根必须可注册；每个 profile 最多 50 个。localhost、`.local`/`.internal` 等内网名和回环/RFC1918 IPv4 只有在配置 `allowPrivateHosts: true` 时才接受；云元数据和链路本地地址（`169.254.0.0/16`）始终拒绝。
- **profile id**：字母数字开头，只含字母数字、`_`、`-`，≤40；禁止 `__proto__`、`constructor`、`prototype` 等对象原型键。
- **storageStatePath**：必须是绝对路径、`.json`，位于 `$DSH_HOME/data/browser/auth/` 内（拒绝 `..`、符号链接逃逸、已存在的非普通文件、`snapshotDir` / `downloadDir` 内的路径、别的 profile 正在用的文件）；auth 目录与这两个目录重叠时 agent 设置的路径一律拒绝。`persistState: false` 的新 profile 要求状态文件已存在（agent 无法创建它，需要用户放置，或开启 `persistState` 让它在登录后生成）。基线里配置的路径不受 auth 目录限制，agent 不改它就保持原样。
- **usagePolicy**：与配置相同的整数范围（如 `maxConcurrency` 1–8、`minDelayMs` 0–60000），且不能超出；未知键拒绝。
- **覆盖文件本身**：解析失败、校验和不符（被手工编辑过）、含被校验拒绝的值或被拒绝的未知键时，整个文件被忽略，**回退到基线**，并在 `runtime.status` 的 `runtimeWarnings` 和设置卡片里给出警告，不会半应用；此时写动作被拒绝，直到用 `runtime.reset_policy` 或面板按钮清除（坏文件改名为 `policy-overlay.json.corrupt-<时间>` 保留）。覆盖文件由插件管理，不要手工编辑。

校验和只能发现意外修改，不是防止有本机文件写权限的攻击者的措施：这类攻击者能同时改文件和校验和，但仍过不了加载时对域名、路径和数值的重新校验。
