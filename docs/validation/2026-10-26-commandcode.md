# dsh-browser dev/0.2.2：真实 DSH 0.2.1-rc.3 宿主 + command-code 的 DeepSeek 模型验证

日期：2026-10-26 夜到 10-27 凌晨（Asia/Shanghai）。被测基线：分支 `dev/0.2.2` 的 `4d142fb`（rc.3 适配、设置界面重做、context 选项/下载/策略覆盖层；包版本字段 0.2.2）。方式沿用 [2026-10-12](2026-10-12.md)：真实 Host + 真实模型，证据取完整工具结果（`--json` 的 ndjson）、fixture 服务端日志、磁盘文件，不采信模型自述（本次就出现一次模型自述错误：见 A-ro）。全部是 **headless、cwd 为空目录（不绑定工作目录）**，没有 Web UI / 桌面端。

## 环境和费用

- Host：`desktop-020-rc1` 里的 CLI，`dsh --version` = **0.2.1-rc.3**。隔离 home：`environments/browser-cc-2026-10-26/home`（没有读写 `~/.dsh`，没有碰 19387 端口和桌面端）。
- 插件：`link:` 到本工作区（`dsh plugin --profile cc-auto add link:…/worktrees/dsh-browser-dev`），其余 profile 的 `node_modules` 软链到第一个。宿主闸门接受（无 incompatible）。
- 模型：用户 `cordis.patch.yml` 里的 `llm-pi-ai` provider `command-code`（`api: openai-completions`，`baseURL: https://api.commandcode.ai/provider/v1`，`apiKeyEnv: COMMAND_CODE_API_KEY`）原样抄进隔离 profile，只留 4 个 deepseek 模型条目；默认 `deepseek/deepseek-v4-flash`，对比用 `deepseek/deepseek-v4-pro`（`--patch` 覆盖 `agent-default-model`，`--dump-config` 里能看到 `model: deepseek/deepseek-v4-pro`）。key 只复制了 `COMMAND_CODE_API_KEY` 这一项进隔离 home 的 `.credentials.yaml`（0600），运行时作为子进程环境变量传入；已在证据目录、仓库、`/tmp` 临时输出和 20 个会话日志（zstd 解压后）里 grep 该值，**0 命中**。
- profile（headless，`toolSurface: indexed`，`opencliEnabled: false`，`executablePath` 指向 chromium-1243，`allowPrivateHosts: true`；基线 `viewport 800×600`、`userAgent DSH-Validation-UA/1.0`、`locale fr-FR`、`timezoneId Asia/Tokyo`、`downloadMaxBytes 1 MiB`、authProfile `fx`（`allowedDomains: [alt.localhost]`，状态文件含 localhost 与 alt.localhost 各一条 Cookie）、资产目录三者共用）：

| profile | 模式 | 用途 |
| --- | --- | --- |
| `cc-auto` | autonomous | 工具面、读取、表单、context、journal/回放、资产 |
| `cc-unr` | unrestricted | 代理、下载、策略覆盖层（headless 没有审批通道，询问类动作只能在这里放行） |
| `cc-ro` | read-only | 可见动作与拒绝 |
| `cc-set` | autonomous | 项目 8：把 context/下载默认值改成另一组（等价于设置面板写入的键）：`viewport 1280×720`、UA `DSH-Panel-UA/9.9`、`ja-JP`、`America/New_York`、`proxyServer http://127.0.0.1:47313`、`downloadDir …/dl-set`、`downloadMaxBytes 2048` |

  没有跑 standard（它在 headless 里等同于“凡是询问都因无审批通道被拒”，上次已在 Web UI 里验证过审批文字；本次范围是 headless）。
- fixture：`:47311`（仓库原 fixture）、`:47312` 内容服务 + `:47313` 转发代理（沿用 10-12 的 `server.mjs`，拷在 `work/`）。只访问本机，没有访问外部站点。
- 浏览器：Chrome for Testing（playwright 缓存 `chromium-1243`），经 `executablePath` 指定，没有下载任何东西。
- **20 个 DS 会话**（上限 25）：17 个 flash、3 个 pro；250 次工具调用（含 skill 加载与 browser_index）。

### token 与费用

| 项 | 数值 |
| --- | --- |
| 新输入 | 252,718 |
| 缓存读取 | 3,377,664 |
| 输出 | 71,403 |
| 合计 | 3,701,785 |

command-code 余额：`GET https://api.commandcode.ai/alpha/billing/credits`（用同一个 key；这是我试出来的接口，不是文档里写的，字段名以实际返回为准）每个会话前后各读一次。`credits.monthlyCredits` 从 **59.2571 降到 58.9319**，共 **0.3252**；逐会话差值相加 0.3159（差额是会话之间的时间，可能含账户的其他用量）。5 小时窗口 `used` 0.247 → 0.572（cap 14），周窗口 10.743 → 11.068（cap 35）。单位接口没说明，下面只写数值。flash 17 个会话共 0.1385（平均 0.0081/会话），pro 3 个会话共 0.1774（平均 0.059/会话，约 7 倍）。逐会话数据见下表与 `evidence/runs/<label>/meta.json`。

| 会话 | profile | 模型 | steps | 工具调用 | 新输入 | 缓存读 | 输出 | 合计 | 余额差 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S0-smoke | cc-auto | flash | 3 | 2 | 12,663 | 22,144 | 474 | 35,281 | 0.0025 |
| A-auto | cc-auto | flash | 4 | 6 | 9,718 | 40,704 | 3,031 | 53,453 | 0.0097 |
| A-ro | cc-ro | flash | 4 | 4 | 9,833 | 38,784 | 1,829 | 50,446 | 0.0060 |
| RO-deny | cc-ro | flash | 17 | 16 | 13,018 | 234,112 | 3,111 | 250,241 | 0.0112 |
| B-read | cc-auto | flash | 12 | 11 | 11,341 | 153,984 | 3,035 | 168,360 | 0.0122 |
| C-form | cc-auto | flash | 8 | 10 | 10,100 | 96,896 | 1,451 | 108,447 | 0.0050 |
| C-orders | cc-auto | flash | 12 | 11 | 11,552 | 154,752 | 3,196 | 169,500 | 0.0049 |
| F-policy | cc-unr | flash | 22 | 21 | 18,825 | 362,752 | 7,387 | 388,964 | 0.0099 |
| D-ctx | cc-auto | flash | 18 | 17 | 12,203 | 252,928 | 4,784 | 269,915 | 0.0048 |
| D-proxy | cc-unr | flash | 10 | 10 | 10,181 | 125,440 | 3,590 | 139,211 | 0.0097 |
| E-dl | cc-unr | flash | 22 | 22 | 14,931 | 324,480 | 4,854 | 344,265 | 0.0139 |
| G-journal | cc-auto | flash | 32 | 43 | 31,686 | 608,256 | 14,902 | 654,844 | 0.0282 |
| H-assets | cc-auto | flash | 7 | 8 | 11,617 | 82,176 | 2,214 | 96,007 | 0.0060 |
| I-defaults | cc-set | flash | 7 | 7 | 9,657 | 84,864 | 2,464 | 96,985 | 0.0039 |
| F-auto | cc-auto | flash | 10 | 10 | 10,098 | 122,240 | 2,253 | 134,591 | 0.0040 |
| F-widen | cc-unr | flash | 9 | 8 | 11,819 | 116,352 | 4,216 | 132,387 | 0.0041 |
| C-form-unr | cc-unr | flash | 9 | 11 | 6,116 | 114,688 | 1,411 | 122,215 | 0.0025 |
| C-form-pro | cc-auto | pro | 9 | 10 | 13,103 | 104,064 | 1,289 | 118,456 | 0.0496 |
| C-orders-pro | cc-auto | pro | 9 | 8 | 13,334 | 107,904 | 2,067 | 123,305 | 0.0552 |
| D-ctx-pro | cc-auto | pro | 16 | 15 | 10,923 | 230,144 | 3,845 | 244,912 | 0.0727 |

## 结果

| 项目 | 结果 | 原始证据要点 |
| --- | --- | --- |
| 1 工具面 | 通过 | autonomous：根目录 9 组，`runtime.status.exposedActions` **41**，`runtimeWarnings: []`，`prompts.budget`：`l0Tokens 325`（预算 1500），最大层 `automation.develop.save` 980（预算 1000），`overBudget: []`，`skill: {enabled: true, body: "packaged"}`；`exposedTools: [browser_index, browser_call]`。read-only：**25**，根目录写明 `Unavailable (disabled by automationMode=read-only): runtime.install, target.download, act.click …`，最大层 993 |
| 2 读取与控件 | 通过（一处 P3 已修） | 作者周晓岚/2026 年 8 月 17 日；`sections` 的 content/links/tables/controls 各自正确，`counts`、`truncation`（`maxItems=2` 时 `omittedBySection {controls: 2}`）、`includeValues` 都符合；`locator {role:"form"}` 在无名 `<form>` 上超时（P3-1） |
| 3 表单与点击 | 通过 | autonomous 与 unrestricted 都直接执行，服务端 `registrations=[{李雷, lilei@example.com, pm, QZ-1211}]`；歧义删除 `LOCATOR_AMBIGUOUS` 候选 3 个且无副作用，最终只删 `o-42`；unrestricted 下 `act.*` 结果**没有** `risk`（只出现在策略放宽，见 6）；read-only 下 `act.fill/click`、`target.download` 被拒 |
| 4 context 与代理 | 通过 | 按次覆盖触发 `contextRebuilt`，省略不重建，代理经 47313，非法值被拒 |
| 5 下载 | 通过 | sha256 与本机一致，点击触发的下载进入记录，0 字节/超限/恶意名行为正确；超限现在是 `ACTION_FAILED`（10-12 的 P3-5 已修） |
| 6 策略覆盖层 | 通过 | 加域名后才注入 Cookie，撤销后 `sessionsClosed: 1`，`risk` 只在 unrestricted 放宽时出现，autonomous 放宽被拒，P2-2 的修复在 rc.3 上仍有效 |
| 7 journal→草稿→回放→资产 | 通过 | 草稿 v2、`inputSets` 两组通过；激活后新会话 search→run 复用，空结果判定正确 |
| 8 设置默认值回显 | 通过 | `target.open` 的 `contextOptions/contextSources` 与 `runtime.status.contextDefaults`、`index` 的 “Current defaults” 一致 |
| UI：保存条 | 已修（`f55ca89`） | 见最后一节；未在真实面板里复看，只有 e2e |

### 1 工具面

- `A-auto`（autonomous）：`browser_index {}` 根目录 9 组（runtime 6、target 5、observe 2、act 11、inspect 4、script 5、automation 4、crawl 1、opencli 3），第二行 `mode autonomous: interactions and recipes run directly; scripts, uploads, installs ask`。`{group:"act"}` 列出 11 个动作；`target.download` 的 L2 带 `approval: asks`、`Defaults in force: downloadDir …/home/data/browser/downloads, downloadMaxBytes 1048576`；`act.click` 的 L2 带定位参数 selector / role+name / text / label / testId / framePath。
- `runtime.status` 原文要点：`directInteractionPolicy: allow`、`mutatingRecipePolicy: allow`、`externalUserscriptPolicy / pageEvaluatePolicy / fileUploadPolicy / downloadPolicy / opencliRunPolicy: ask`、`contextDefaults {viewport 800×600, UA, fr-FR, Asia/Tokyo}`、`chromiumInstalled: true`、`usagePolicy` 全是基线值。
- `A-ro`（read-only）：`exposedActions` 25 个，原样列在 ndjson 里（`runtime.status, target.open, … runtime.reset_policy`）。**模型最终回答说“24 项”**，实际返回 25：这是模型数错，插件无误。`browser_index {action:"target.download"}` 写 `UNAVAILABLE: disabled by automationMode=read-only`。
- 比 10-12 多出来的：`target.open` 的 L2 带 `Current defaults (...)` 一段（见 8）。

### 2 读取与控件观察

`B-read`（`/article.html`、`/form.html`）：

| 调用 | 结果 |
| --- | --- |
| 默认 `observe.read` | 只有 `url/title/targetId/generation/text`；文章作者 周晓岚，发布于 2026 年 8 月 17 日 |
| `sections:[content,links,tables]` | `counts {links:2, tables:0}`，links 为 首页 `/`、搜索 `/search.html`，无 `truncation` |
| `/form.html` `controls` | 4 个控件；姓名/邮箱 `constraints.required: true`、`validity.flags:["valueMissing"]`；下拉 `options am/pm`；默认只有 `hasValue`，没有 `value` |
| `includeValues: true` | 多出 `value`：姓名 `""`、邮箱 `""`、场次 `"am"` |
| `maxItems: 2` | 只返回前 2 个控件，`truncation {omittedBySection:{controls:2}, reason:"maxItems=2 reached for controls …"}`，`counts.controls` 仍为 4 |
| `locator {role:"form"}` | **`LOCATOR_NOT_FOUND`，等满 15000 ms**（带 `name:"活动报名"` 同样失败）。见 P3-1 |

`C-orders`（`/orders.html`）还额外验证了 `tables`：`headers [订单, 金额, 操作]`、`rows` 3 行、`coverage: "complete"`。

### 3 表单填写、点击、模式差异

- `C-form`（autonomous）与 `C-form-unr`（unrestricted）：`target.open → observe.read(controls) → act.fill ×2 → act.select → act.click`，页面回显 “报名成功，确认编号：QZ-1211”，服务端 `__state` 为 `registrations=[{name:"李雷",email:"lilei@example.com",slot:"pm",code:"QZ-1211"}]`。`act.select` 用 `value` 写法时返回 `INVALID_ARGS … value: unknown argument (allowed: …values); values: required`（`C-form-pro` 里出现，模型随后改用 `values` 成功）。
- `C-orders`（flash）：先点 `button "删除" exact` → `LOCATOR_AMBIGUOUS`（`Locator matched 3 elements, so nothing was done`，候选 3 个）；改用 `tbody tr:has-text("订单 B") button` 后只删订单 B。`C-orders-pro`：改用 `index: 1` + `indexReason`，同样只删 `o-42`。两次服务端 `deleted: ["o-42"]`。
- unrestricted 下 `act.*` 的结果里没有 `risk` 字段（`C-form-unr` 的全部 tool_result 里 `"risk"` 0 次；其余 8 个非策略会话同为 0 次，只有 `F-policy`、`F-widen` 的放宽结果带它）。`risk` 只属于策略放宽（见 6）。
- `RO-deny`（read-only）：`target.open`、`observe.read` 放行；`act.fill`、`act.click`、`target.download` 的原文均为纯文本：

```text
Error: Browser action act.fill is disabled by automationMode=read-only
Error: Browser action act.click is disabled by automationMode=read-only
Error: Browser action target.download is disabled by automationMode=read-only
Error: Loosening a restriction is disabled by automationMode=read-only: profile fx: allow localhost
```

  这几条**没有 JSON 信封和错误码**，与其他失败（`{ok:false, error:{code,message,hint}}`）形态不同，见 P3-2。`runtime.set_usage_policy minDelayMs=2500`（收紧）在 read-only 下放行（revision 1，`direction: tighten`），随后 `runtime.reset_policy scope=all`（回到更宽的基线）被拒：`Loosening a restriction is disabled by automationMode=read-only: usagePolicy.minDelayMs: 2500 -> 750 (looser)`，覆盖层因此遗留，后来由 `F-policy` 在 unrestricted 下清掉（其 `risk` 出现，`revision: 2`）。

### 4 context 选项与代理

`D-ctx`（autonomous，回显页 `/echo`，服务端日志逐条核对）：

| 调用 | 页面回显 | 结果字段 |
| --- | --- | --- |
| 无选项 | UA `DSH-Validation-UA/1.0`、`fr-FR`、`Asia/Tokyo`、800×600；服务端收到的 UA、Accept-Language 同 | `contextSources` 全是 `default`，无 `contextRebuilt` |
| `viewport 1024×768` | 1024×768 | `contextRebuilt.changed=["viewport"]`，`contextSources.viewport:"call"`；`targetId` 由 t1 变 t2 |
| 无选项 | 仍 1024×768 | 无 `contextRebuilt`，`contextSources.viewport:"session"` |
| `locale de-DE` + `timezoneId Europe/Berlin` | `de-DE`、`Europe/Berlin`、视口保持 1024×768；服务端 `Accept-Language: de-DE` | `changed=["locale","timezoneId"]` |
| `viewport 10×10` | 未执行 | `INVALID_ARGS: viewport width must be an integer from 200 to 7680` |
| `userAgent` / `proxyServer`（autonomous，headless） | 未执行 | `Error: tool "browser_call" requires approval, but no approval channel is available`（P3-3） |

`D-proxy`（unrestricted；`vproxy.test` 只有经代理才可达）：无代理 → `ACTION_FAILED … net::ERR_HTTP_RESPONSE_CODE_FAILURE`；`proxyServer=ftp://…` → `INVALID_ARGS: proxyServer scheme must be one of http, https, socks5, socks4 (got ftp)`；带 `user:pw@` → `INVALID_ARGS: … must not contain credentials; proxy accounts are not supported`；`proxyServer http://127.0.0.1:47313 + userAgent DSH-PerCall-UA/2.0` 成功，页面回显新 UA，`contextRebuilt.changed=["userAgent","proxyServer"]`；省略后再次打开不重建，`contextSources` 里两项为 `session`。转发代理日志有 `GET http://vproxy.test:47312/echo`，内容服务端日志里 Host 为 `vproxy.test:47312`、UA 为 `DSH-PerCall-UA/2.0`、Accept-Language `fr-FR`（`runs/D-proxy/fixture47312-log.json`）。

### 5 下载

`E-dl`（unrestricted，`downloadMaxBytes=1 MiB`），下载目录最终 6 个文件，与 `inspect.downloads` 的 10 条记录（`total: 10`）一致：

| 调用 | 结果 |
| --- | --- |
| `report.pdf` | `report.pdf`，1080 字节，sha256 `eeebbc4b…4ba6`，与 `curl … | shasum` 一致，`source: request` |
| 同一 URL 再次 | `report-1.pdf` |
| `/dl/empty` | `ACTION_FAILED … the download produced zero bytes; nothing was saved`，目录里没有该文件，记录 `status: failed` |
| `/dl/big`（2 MiB，带 Content-Length） | `ACTION_FAILED … larger than downloadMaxBytes (1048576 bytes) ; the transfer was stopped and nothing was saved`，hint `… this is not a cancellation`，无半成品 |
| `filename "../x.txt"` | `INVALID_ARGS: filename must be a plain file name, not a path (no / or \)` |
| `filename "CON"` | `INVALID_ARGS: filename "CON" is a reserved device name` |
| 服务端名 `../../escape.txt` | 保存为 `downloadDir/escape.txt`（11 字节），目录外没有 `escape*` |
| 服务端名 `CON.txt` | 保存为 `_CON.txt` |
| `filename "custom-name.pdf"` | 按指定名保存 |
| 点击页面链接触发 | 记录 `d10 saved source=browser`，`clicked.bin` 24 字节，sha256 `916b6202…bd9a` |

模型对 `/dl/empty`、`/dl/big`、两个非法 `filename` 各重试了一次（指示是“最多重试一次”）；重试产生了 `d4/d6` 记录，不影响结论。`downloadMaxBytes 2048` 在 `cc-set` 里没有真正触发：`I-defaults` 里 `target.download` 在 autonomous 下因无审批通道被拒，没走到大小检查（项目 8 只验证了回显）。

### 6 策略覆盖层

`F-policy`（unrestricted）：

1. `target.open http://localhost:47312/whoami authProfile=fx` → `POLICY_DENIED: auth profile fx is not allowed for localhost`。
2. `runtime.set_auth_profile id=fx allowedDomains=[alt.localhost, localhost]` → `direction: loosen`、`revision: 3`，**带 `risk`**：`{level: "elevated", loosened: ["profile fx: allow localhost"], approval: "none (automationMode=unrestricted does not ask)", note: …}`。
3. 重新打开 → 页面回显 `{"host":"localhost:47312","cookie":"sid=fx-localhost-cookie"}`（服务端日志同）。
4. 撤销 → `direction: tighten`、**`sessionsClosed: 1`**、note “Sessions whose login state this change took away were closed”；`observe.read` 得 `about:blank`（新 `targetId t2`）；再次打开 `POLICY_DENIED`。
5. 非法项均为 `INVALID_ARGS`：`*`（wildcard only as leading label）、`com`（bare top-level name）、`169.254.169.254`（link-local and cloud metadata … never allowed）、`localhost:47312`（host name only）；`maxConcurrency: 9`（`must be an integer from 1 to 8`）。
6. `set_usage_policy minDelayMs=3000`（收紧）→ `revision 5`、无 `risk`；`inspect.policy` 里 `minDelayMs {value:3000, baseline:750, overridden:true}`，audit 有最新一条；`minDelayMs=100`（放宽）→ 带 `risk`；`runtime.reset_policy scope=all` → `revision 7`，`overlayActive: false`。

`F-auto`（autonomous）：放宽 `set_auth_profile` → `Error: tool "browser_call" requires approval, but no approval channel is available`；收紧 `set_usage_policy burst=2` 执行（`revision 8`，`direction: tighten`）；会放宽的 `reset_policy` 同样被拒；`inspect.policy` 仍是 `overlayActive: true`。与 README 一致（autonomous 放宽仍询问）。

`F-widen`（P2-2 在 rc.3 上的回归，unrestricted）：同一 session 里先带 `fx` 打开 `alt.localhost`（页面 Cookie `sid=fx-alt-cookie`），放宽加 `localhost`，再带 `fx` 打开 `localhost:47312`：回显 `sid=fx-localhost-cookie`，结果带 `contextRebuilt.changed=["authProfileScope"]`；服务端日志核对两条请求的 Cookie 不同。结束时 `reset_policy` 回基线，最终 `overlayActive: false`，revision 10。

### 7 journal → 草稿 → 回放；资产检索与复用

`G-journal`（autonomous，flash）：

- `automation.search`（`domain 127.0.0.1`、`status all`）→ `items: []`；模型第一次误把 `url` 传给 `automation.search`，`INVALID_ARGS … url: unknown argument (allowed: query, domain, status, kind)`。
- 探索：`target.open` → `act.fill 关键词=alpha` → `act.click 搜索` → `observe.read`。页面没有 `#status` 元素，模型想找成功标记，`script.evaluate` 因无审批通道被拒，转而用 `observe.read selector:"*" / index:5…17` 逐个枚举 DOM（共 43 次调用、65 万 token，见 P3-5）。
- `draft_from_journal`：`assetId 97a53db1-9b7c-45ce-8d19-68a2931e7188`，revision 1，schemaVersion 2，3 步（`fill {{keyword}}` → `click` → `extract #results mode=links`），`complete: true`，`unmapped: []`，`inputSchema [keyword]`，7 条 `FAILED_STEP_EXCLUDED` 警告（探索时失败的 `observe.read`，已被排除），`postconditions [{output: items, allowEmpty: true}, {selector: "#results"}]`。
- `test` + `inputSets [alpha, beta]`：每组在新 context 运行，两组 `validationStatus: passed`；alpha 输出 3 个链接（Alpha 调度器概览/配置参考/迁移指南），beta 输出 2 个（Beta 存储引擎/快照与恢复）；`contentHash 1c39afdb…1084`，`evidenceLevel: verified`；无 `PARAMETERIZATION_SUSPECT`。
- 激活：prompt 里要求“不要激活”，模型确实没有。我用 `AutomationAssetStore.setStatus`（设置面板“状态”RPC 调的就是它）在会话外激活：不带 `expectedRevision` 被拒 `expected-revision-required`，带 `expectedRevision=1` 成功（`work/activate.mjs`，不是面板点击）。
- `H-assets`（新会话，autonomous）：`automation.search` 命中该资产 → `automation.run {id, url, inputs:{keyword:"beta"}}` **直接执行**（autonomous 的 `automation.run` 对 recipe 不询问）：`executionStatus: completed`、`validationStatus: passed`，输出 Beta 存储引擎、Beta 快照与恢复；关键词 `zzz` → 页面 “没有结果”，`executionStatus: completed`、`validationStatus: passed`、`outputs items: []`（因为草稿写了 `allowEmpty`），模型据此判为“无结果而非失败”；运行后 `successCount` 2、`failureCount` 0。

### 8 设置默认值回显

`I-defaults`（`cc-set`，`cordis.patch.yml` 里是另一组 context/下载默认值）：

- `runtime.status.contextDefaults = {"viewport":{"width":1280,"height":720},"userAgent":"DSH-Panel-UA/9.9","locale":"ja-JP","timezoneId":"America/New_York","proxyServer":"http://127.0.0.1:47313"}`，`downloadDir …/dl-set`，`downloadMaxBytes 2048`。
- `browser_index {action:"target.open"}` 的 “Current defaults (…)”：`viewport 1280x720, userAgent "DSH-Panel-UA/9.9", locale ja-JP, timezoneId America/New_York, proxyServer http://127.0.0.1:47313`。
- 不带选项的 `target.open`：`contextOptions` 同上，`contextSources` 全 `default`，页面回显 UA `DSH-Panel-UA/9.9`、`ja-JP`、`America/New_York`、1280×720，Host `vproxy.test:47312`；代理日志有 `GET http://vproxy.test:47312/echo`（默认代理确实生效）。
- 带 `locale="fr-FR"`：`contextRebuilt.changed=["locale"]`，`contextSources.locale: "call"`，其余仍为 default。

## 问题

没有 P1。没有需要立刻处理的 P2。

### P3-1 — `observe.read` 的文档示例 `locator {role:"form"}` 在无名表单上超时（已修，`1b0de3f`）

`action.examples` 与 `references/observe.md` 都用 `locator:{"role":"form"}`；`B-read` 里模型照用，在 `/form.html`（普通 `<form id="f">`，无可访问名称）上 `LOCATOR_NOT_FOUND`，每次等满 15 秒（带 `name` 也不行）。表单只有带名称才有 form 角色。示例改为 `{"selector":"form"}` 并加了说明；测试 `observe-action.test.ts` 新增用例，示例若用不带名字的 `role:"form"` 即失败（还原示例时该用例失败）。

### P3-2 — 模式级拒绝没有错误信封

read-only 下 `act.fill`、`target.download`、放宽 `set_auth_profile` 的拒绝是纯文本 `Error: Browser action … is disabled by automationMode=read-only`，没有 `{ok:false, error:{code,message,hint}}`，模型在回答里自己写“无错误码字段”。其他失败都带 `code`/`hint`。未修：需要看 host 对工具抛错的处理，改动面超过一个文件。

### P3-3 — headless 下“需要审批”的拒绝不说是哪个动作、为什么

`Error: tool "browser_call" requires approval, but no approval channel is available` 对 `target.open userAgent=…`、`target.download`、`runtime.set_auth_profile` 放宽、`reset_policy`、`script.evaluate` 一模一样，不含动作名和审批理由；flash 在每种情况都把同一调用原样重试一次（浪费，且 prompt 里没禁止）。这是 host 的审批层文案，不是插件能改的；建议插件在索引的 `mode` 行里说明 headless 下 `asks` 等于不可用。未修。

### P3-4 — read-only 的 `browser_index` 组摘要仍列全部动词

`act (1) click, fill, type, clear, press, select, check, hover, scroll, upload, wait` 在 read-only 下只剩 `act.wait` 可用，而摘要里仍列 11 个动词（`Unavailable` 行是对的）。未修。

### P3-5 — `draft_from_journal` 没有现成的“成功标记”时，模型会做 O(n) 的 DOM 枚举

`G-journal`：页面没有 `#status`，`script.evaluate` 需审批（headless 被拒），模型转而用 `observe.read` 的 `selector:"*"` + `index` 枚举了十多个元素（index 5–17），43 次调用/65 万 token，结果仍然正确。属模型/skill 引导问题，草稿本身没有问题。skill 的 `develop.md` 已建议 `{output, allowEmpty:true}` + 成功标记，可以再补一句“页面没有标记时用结果容器的 selector（如 `#results`）即可，不要枚举 DOM”。未改。

### P3-6 — 下载超限报错里有多余空格

`… larger than downloadMaxBytes (1048576 bytes) ; the transfer was stopped and nothing was saved`，括号和分号之间多一个空格。未改（纯文案）。

### P3-7（环境，非缺陷）— 用完整 Chrome 并配了代理时，浏览器自身的后台请求也走代理

`executablePath` 指向完整的 Chrome for Testing 时，代理日志里除了页面请求，还有 `CONNECT www.google.com:443`、`accounts.google.com:443`、`update.googleapis.com:443`、`GET http://clients2.google.com/time/…`（每次新建 context 都有）。用 Playwright 自带的 headless shell（默认 channel）、同一代理，日志里只有页面请求（`evidence/final-state/proxyprobe-result.txt`，`scripts-used/proxyprobe.mjs` 可复现）。所以“代理看见的只有页面流量”这句话对完整 Chrome 不成立；对默认的 headless shell 成立。本次所有代理会话（`D-proxy`、`I-defaults`）都是完整 Chrome，代理日志里的 google 条目属于这种情况，而不是插件在访问外部站点。README 可以在 `executablePath` 一项加一句。未改。

### P3 备注

- 覆盖层在同一 `DSH_HOME` 下被所有 profile 共用（文件在 `data/browser/`）：`cc-ro` 的收紧在 `cc-unr` 里可见，且 read-only 自己无法撤销（放宽被拒）。设计如此，与 10-12 一致，但清理需要换一个模式的 profile。
- 模型自述不可靠的例子：`A-ro` 的最终回答把 25 个动作数成 24 个；`F-policy` 的最终回答说 `contextRebuilt` “never present”，原因是第一次成功打开时 session 里还没有 context，不是缺陷。所有结论以 ndjson 为准。

## UI 小问题：保存条盖住分组标题（已修，`f55ca89`）

- 现象：卡片底部 sticky 保存条始终浮在窗口底部，滚动到某个分组标题落在保存条下面时，标题被遮住，点击落在保存条上（真实面板里“登录与权限”第一次点击没展开）。
- 复现：新增 e2e 先发现，现有 e2e 入口 `test/e2e/ui/settings-entry.tsx` 根本没有注入卡片的样式表，所以布局从没被测到；现在入口里调用 `ensureStyles()`，其余 8 个 UI 用例在有样式的页面上仍通过。
- 修法：`SaveBar` 只在“有可操作的内容”时浮动——有未保存修改、正在保存或保存失败时带 `data-dsb-floating`，样式为 `position: sticky`；其余时候保存条在页面流里，紧跟最后一个分组，不会盖住任何标题。我先试了给分组加 `scroll-margin-bottom`：写了断言发现它对 `focus()` 的滚动没有作用（Chrome 对看不见的元素聚焦时会居中），已去掉，没有留下无效的 CSS。
- 测试：`test/e2e/settings-ui.test.ts` “the save bar floats only while there are unsaved edits …”（窗口高 420）：干净时保存条 `position: static`；每个分组标题滚到窗口底边时 `elementFromPoint` 命中的是标题本身；在最后一个分组上第一次点击就展开；改一个数后 `position: sticky`，点“放弃”后回到 `static`。还原 CSS（让保存条始终 sticky）时该用例失败。
- 局限：有未保存修改时，保存条仍会浮在底部，仍可能盖住恰好在底边的标题；没有在真实 Host 面板里重看，只有 e2e（Host 的 Modal、Switch 等是 stub）。

## 提交

| 提交 | 内容 |
| --- | --- |
| `f55ca89` | fix(settings-ui): the save bar floats only while there are unsaved edits（含 e2e 入口注入样式、新 e2e 用例、重建 lib） |
| `1b0de3f` | docs(observe): do not point at a form by bare role（P3-1，含测试、重建 lib） |
| 本报告所在提交 | docs: validation report 2026-10-26 |

## 检查

- `pnpm run verify`（`typecheck`、`test:peers`、`build`、`test`、`test:client-bundle`）：UI 修复后 **444/444**，P3-1 修复后 **445/445**，client bundle 检查通过。需要 `PLAYWRIGHT_BROWSERS_PATH=…/browser-validation-2026-10-12/pw-browsers`（`chromium-1234 → chromium-1243` 软链）和 `environments/browser-cc-2026-10-26/bin/pnpm` 的 shim（`npx -y pnpm@11.7.0`，避免嵌套 pnpm 解析到 v12）。
- `pnpm run test:e2e`：**95/95**（UI 修复前后各跑过，P3-1 修复后又跑一次）。
- 日志：`evidence/verify.log`、`verify2.log`、`e2e.log`、`e2e-final.log`。

## 证据

根目录：`/Users/anweat/codeproject/dsh-dev/environments/browser-cc-2026-10-26/`

- `evidence/runs/<label>/`：`prompt.txt`、`run.ndjson`（`--json` 的完整事件流：tool_call、tool_result、usage）、`meta.json`（token、余额前后）、`final.txt`、`stderr.txt`、`fixture47311-state.json`、`fixture47312-log.json`（内容服务与代理的请求日志）。
- `evidence/scripts-used/`：runner（`run.mjs`）、profile 生成（`mkprofiles.mjs`）、激活脚本、全部 prompt、fixture 服务、`proxyprobe.mjs`、批处理脚本。
- `evidence/final-state/`：四个 profile 的 `cordis.patch.yml`（不含 key）、下载目录清单与 sha256、策略覆盖层文件、`assets.json`、代理探针结果。
- `evidence/show.mjs`：把 ndjson 按调用顺序展开的小工具（`node show.mjs <label> [序号|all] [字符数]`）。
- `home/`：隔离 home（含 `.credentials.yaml`，只有 `COMMAND_CODE_API_KEY` 一项，0600）；`home/sessions/` 是 20 个会话的持久化日志。

## 没覆盖的部分

- standard 模式与 Web UI / 桌面端：没有审批弹窗、没有真实设置面板（所以 UI 修复只在 e2e 里验证；也没有重看 P1-1 的非法值保存问题）。
- `target.download` 的 `downloadMaxBytes` 在 `cc-set` 的 2048 下没有实测（被审批拒绝挡在前面）；无 `Content-Length` 的流式超限未测。
- SOCKS 代理、Windows/Linux、外部真实站点（只访问本机 fixture）、`render/snapshot/crawl` 的临时 context 里的 UA/视口、并发稳定性。
- `G-journal` 只跑了 flash；pro 只对比了 C-form、C-orders、D-ctx（行为一致，pro 少走弯路但费用约 7 倍）。
- 资产激活不是在面板里点的，是用同一个 store 方法在会话外调用。
- 余额接口 `GET /alpha/billing/credits` 是试出来的，没有文档；差值里可能含账户的其他用量。
