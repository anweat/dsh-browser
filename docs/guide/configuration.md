# 配置参考

> 适用版本：`@anweat/dsh-browser` 0.2.2 ｜ [返回 README](../../README.md)

设置卡片的用法见 [设置卡片](settings-card.md)。改动后哪些要重启、哪些实时生效，见各键的注释与文末说明。

## cordis.yml / patch config

下面是一份**每个键都带注释**的完整示例：注释说明用途、可选值或范围、默认值与风险；去掉不需要的键即回到默认值。设置卡片的“高级：文本模式”打印的是同样带注释的文本（注释行以 `#` 开头，读取时忽略）。

```yaml
- insert:
    - id: browser
      name: '@anweat/dsh-browser'
      config:
        # ── 常用 ────────────────────────────────────────────────────────────
        enabled: true            # 是否启用浏览器服务；false 时 agent 没有浏览器工具。默认 true
        automationMode: standard # 自动化模式：read-only 只读 | standard 写操作逐次询问（默认）| autonomous 页面交互直接执行 | unrestricted 全部免审批（风险最高：agent 还能自行放宽登录域名与限流）
        toolSurface: indexed     # 工具面：indexed（默认）= 只常驻 browser_index + browser_call，约 325 token | flat = 每个动作一个工具，常驻上下文大得多。改后需重启
        opencliEnabled: true     # OpenCLI（站点 adapter 与 Chrome Browser Bridge）总开关。默认 true；OpenCLI 需要另外安装（npm i -g @jackwener/opencli），没装时只是 opencli.* 不可用

        # ── 浏览器 ──────────────────────────────────────────────────────────
        browserRuntime: playwright # 驱动：playwright（默认）| patchright（仅 Chromium，对反爬检测更友好）
        channel: chromium        # 浏览器：chromium（默认：Playwright 的 Chromium，没下载过时自动用本机 Chrome / Edge）| chrome | msedge（固定用本机已装的那个）；Patchright 推荐 chrome
        headless: true           # true 不显示窗口（默认）| false 显示；Patchright 通常关闭无头兼容性最好
        autoInstall: false       # 缺 Playwright Chromium 时是否自动下载（下载约 190 MB，开启后不再改用系统 Chrome）。默认 false：有 Chrome / Edge 就直接用，没有再用 runtime.install
        # executablePath: ''     # 自定义浏览器的绝对路径；留空：Playwright Chromium，缺失时用系统 Chrome / Edge
        # cdpPort: 9222          # 本机 CDP 调试端口 1–65535；留空关闭。风险：同机其它程序可借此控制浏览器
        maxSessions: 8           # 同时持有 context+page 的 session 上限 1–64，超出淘汰最久未使用者。默认 8
        # args: ['--disable-gpu'] # 追加的 Chromium 启动参数；只加你理解的。默认 []
        # snapshotDir: ''        # 截图目录（绝对路径）；默认 $DSH_HOME/data/browser/snapshots
        verbose: false           # 输出启动与诊断信息。默认 false

        # ── 页面环境（每个新 context 的起点；target.open 可按次覆盖，省略即沿用）──
        viewportMode: window     # 视口：window（浏览器默认）| 720p | 1080p | custom；custom 时必须再写 viewportWidth / viewportHeight
        # viewportWidth: 1280    # custom 的宽度 200–7680（像素）
        # viewportHeight: 720    # custom 的高度 200–4320（像素）
        # userAgent: ''          # User-Agent；留空 = 浏览器自带。风险：改变站点看到的指纹；agent 按次改它需要审批（unrestricted 除外）
        # locale: en-US          # 语言标签（BCP 47）；留空 = 浏览器自带
        # timezoneId: Asia/Shanghai # IANA 时区；留空 = 本机时区
        # proxyServer: http://127.0.0.1:7890   # 代理；不支持账号密码，勿写凭据；留空 = 直连。agent 按次指定代理需要审批
        # proxyBypass: example.com,.internal.test # 不走代理的主机，逗号分隔；需先设 proxyServer

        # ── 下载 ────────────────────────────────────────────────────────────
        # downloadDir: D:/dsh/downloads        # 下载目录（绝对路径）；默认 $DSH_HOME/data/browser/downloads
        downloadMaxBytes: 104857600            # 单个下载上限（字节），1 到 10 GiB；默认 100 MiB，超出会中止并删除

        # ── 登录与权限 ──────────────────────────────────────────────────────
        allowPrivateHosts: false # true 时 agent 才能把 localhost/.internal/内网 IP 写进 allowedDomains。风险：扩大 agent 可授权的范围。默认 false
        storageStatePath: ''     # 旧版全局登录态 JSON（对所有站点生效，无域名限制）；新配置请用 authProfiles
        defaultAuthProfile: forum # 未显式选择时使用的 profile 名（必须存在）；crawl 始终匿名
        authProfiles:            # 按域名限定的命名登录态；设置卡片里是“登录 profile”列表，可在弹窗里增删改
          forum:
            storageStatePath: 'D:/secrets/forum.json' # Playwright storageState JSON；含 cookie，不要提交到仓库
            allowedDomains: [example.com]             # 只有这些域名（含子域）能用它；至少一个
            persistState: false  # 默认只读（文件须已存在）；true 才会在 context 关闭时原子回写刷新后的状态，文件可先不存在
        rulePacks:               # 域名限定、哈希固定的页面增强包；结构复杂，只在配置文件里编辑
          forum-enhanced:
            matches: [example.com]
            initScriptPath: 'D:/dsh/rules/forum.js'
            initScriptSha256: '<64位sha256>'
            steps:
              - { type: waitFor, selector: '#results', timeoutMs: 10000 }
              - { type: scroll, deltaY: 1600, repeat: 2, waitMs: 300 }

        # ── 使用限流（所有模式都生效；无审批模式也不会绕过）──────────────────────
        usagePolicy:
          minDelayMs: 750        # 同一主机两次请求之间至少等待，0–60000 毫秒。默认 750
          maxConcurrency: 2      # 同时进行的请求数 1–8。默认 2
          burst: 3               # 短时间内允许连续发出的请求数 1–20。默认 3
          maxPagesPerRun: 20     # 一次 crawl 最多访问的页面数 1–100。默认 20
          maxDepth: 2            # crawl 最多跟进的链接层数 0–5。默认 2
          retryLimit: 2          # 可重试错误的最大重试数 0–5。默认 2
          backoffBaseMs: 1000    # 重试等待的起始时长（逐次加倍）1–60000 毫秒。默认 1000
          cooldownMs: 30000      # 收到 429/503 后暂停该主机的时长 100–300000 毫秒。默认 30000

        # ── 自动化资产（可复用的 recipe 与脚本，实验性）─────────────────────────
        automationAssets:
          enabled: true          # 关闭后不记录、不检索资产。默认 true
          # directory: ''        # 资产目录（绝对路径）；默认 $DSH_HOME/data/browser/automations
          persistenceMode: suggest # off 不记录 | manual 仅手动 | suggest 记录并建议总结（默认）| auto-draft 自动生成草稿
          activationMode: manual   # manual 必须手动激活（默认，推荐）| auto-tested 通过测试后自动激活；不会因静态校验自动激活
          minSuccessfulRuns: 3   # 同一操作成功多少次才建议总结 2–20。默认 3
          minDistinctSessions: 2 # 这些成功分布在至少几个会话 1–10。默认 2
          successWindowDays: 14  # 只统计最近多少天的成功 1–90。默认 14
          minSuccessRate: 0.8    # 最低成功率 0.5–1。默认 0.8
          maxCandidates: 20      # 同时保留的候选数 1–100。默认 20
          candidateTtlDays: 14   # 候选多久没再出现就丢弃 1–90 天。默认 14
          maxSuggestionsPerDay: 2 # 每天最多提示几次“是否总结”，0–20（0 = 不提示）。默认 2
          maxDrafts: 10          # 草稿上限 1–100。默认 10
          maxActiveAssets: 50    # 同时激活的资产上限 1–200。默认 50
          retrievalTopK: 5       # 每次向模型展示几条相关资产摘要 1–20。默认 5
          catalogTokenBudget: 800 # 资产摘要占用模型上下文的上限 100–4000 token。默认 800
          modelDevelopmentEnabled: true # false 时 agent 看不到 automation.develop（需重启）。默认 true
          maxModelDraftWritesPerSession: 3 # 一个会话里模型保存草稿的次数上限 1–20。默认 3
          maxTestCredentials: 5     # 每个资产保留最近 N 条测试凭据 1–20（激活只认绑定当前 revision 与内容哈希的 passed 凭据）。默认 5
          minInputSetsForActivation: 2  # 声明了输入的资产，激活要求当前版本的通过凭据至少覆盖 N 组输入（1–5）；无输入的资产不受影响。默认 2

        # ── 提示词（覆盖模型看到的文字；不写 = 全部用默认）──────────────────────
        # prompts: { ... }       # 结构见 prompts.md（自定义提示文本）；设置卡片“提示词”分区的“导出默认文本”给出带注释的 YAML
```

## RulePack 的步骤

`rulePacks.<名称>.steps` 只允许有界步骤：`waitFor`（`selector`，`timeoutMs` ≤ 30000，可 `optional`）、`click`（同上）、`scroll`（`deltaY`、`repeat`、`waitMs`）、`wait`（`waitMs` 0–10000）。`initScriptPath` 指向的脚本必须是本地文件、不超过 64KB，且 `initScriptSha256` 与内容一致。RulePack 结构复杂，只在配置文件里编辑，设置卡片只列名称。

## 保存后何时生效

所有可编辑字段都是 `.volatile()`：在设置卡片里保存后，新值会写入运行中的配置引用，但浏览器进程、工具暴露（`automationMode`、`toolSurface`、`modelDevelopmentEnabled`）与审批规则在启动时一次读取，所以**保存后仍需重启 profile 才生效**；`executablePath`、context 创建期选项（视口、`userAgent`、`locale`、`timezoneId`、代理）和下载目录同样在插件挂载时解析。仅刷新网页不会重新加载插件。

例外：提示文本覆盖里的目录、错误提示、skill 按调用实时读取，保存后下一次调用即生效（两个常驻工具的描述除外，见 [自定义提示文本](prompts.md)）；资产的增删改通过 loopback-only 的 Host RPC 即时落盘。

插件只声明 `inject: ['tools']`，**不依赖宿主的 `settings` 服务**：没有 Settings 服务的组合里按上面的默认值运行，设置卡片只是不显示。原因与宿主兼容细节见 [宿主兼容与 peer 范围](../dev/host-compat.md)。

配置错误不会让插件加载失败（否则设置卡片也会一起消失）：无效的值回退到默认，并出现在 `runtime.status` 的 `runtimeWarnings` 里。嵌套写法（`viewport: {...}`、`proxy: {...}`、`contextOptions`、`download(s)`）会被忽略，同样在 `runtimeWarnings` 里说明应该使用哪些扁平键。
