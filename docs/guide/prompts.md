# 自定义提示文本

> 适用版本：`@anweat/dsh-browser` 0.2.2 ｜ [返回 README](../../README.md)

模型读到的提示和建议文本都可以由部署方覆盖：两个常驻工具的描述、`browser_index` 根目录的指南和附言、分组与动作的摘要和说明、错误提示、以及 `dsh-browser` skill。不配置 `prompts` 时所有输出与内置默认逐字节一致。

**键结构**（全部可选；写在 `config.prompts` 下）：

```yaml
- insert:
    - id: browser
      name: '@anweat/dsh-browser'
      config:
        prompts:
          tools:
            browser_index: { description: '浏览器能力目录。无参数：分组与环境状态。' }
            browser_call:  { description: '执行一个浏览器动作；动作名见 browser_index。' }   # 合规声明始终自动追加在末尾
          rootGuide: '先 automation.search；没有合适资产再 target.open -> observe.read -> act.*。'  # 无 skill 时替换精简指南
          rootNote: '内网站点优先用 opencli.run；不要访问生产后台。'                              # 追加在根目录末尾，有 skill 时也显示
          groups:
            act: { summary: '点击、填写、输入（会改变页面）' }
          actions:
            act.click: { summary: '点击元素', notes: '提交类按钮点击后先 observe.read 确认结果。' }
            automation.develop.save: { notes: '保存前先 validate。' }   # 子动作
            observe.read.controls: { notes: '……' }                       # 详情页（notes 替换整页正文）
          errorHints:
            LOCATOR_NOT_FOUND: '没找到元素：先 observe.read 看页面，再换定位方式。'
          skill:
            enabled: true                       # false：不注册 skill，根目录改用精简指南
            description: '浏览器工具使用指南'
            bodyFile: 'D:/dsh/prompts/skill.md' # 绝对路径，替换 SKILL.md 正文（文件缺失/不可读时回退到内置正文）
            append: '## 本部署的约定\n……'      # 追加到正文末尾
```

动作键可以是 `group.action`、子动作（`automation.develop.save`）或详情页（`observe.read.controls`，其 `notes` 即该页正文）。空字符串等于不覆盖。

**导出全部默认文本**：设置面板“提示词”分区的“导出默认文本”按钮会打开弹窗，给出带注释的 YAML 与一份 JSON，结构与 `prompts` 完全一致，包含每个可覆盖项的内置文本，安装包用户不需要任何脚本环境。在仓库检出里也可以运行 `pnpm prompts:dump`（`node scripts/dump-prompts.mjs`），输出与按钮完全相同。复制它，删掉保持默认的部分，改写其余部分，放进配置即可；原样放回不改变任何输出（有测试保证）。

**长度上限**（超限的值整条忽略，不会被截断，并写入诊断）：

| 项 | 上限（字符） |
|---|---|
| 分组/动作/子动作/详情页 `summary` | 300 |
| 动作/子动作 `notes` | 1000（详情页 `notes` 为 3500） |
| `tools.*.description` | 1500 |
| `rootGuide` | 1500 |
| `rootNote` | 800 |
| `errorHints.<CODE>` | 600 |
| `skill.description` | 1000 |
| `skill.append` | 4000 |
| `skill.bodyFile` 文件内容 | 20000 |

**未知或无效的键**（不存在的分组、动作、错误码，类型不对，`bodyFile` 不是绝对路径等）不会报错，只是被忽略。`errorHints` 只覆盖有固定文案的错误码；`INVALID_ARGS`、`ACTION_FAILED`、`UNKNOWN_ACTION` 的提示依上下文生成，不可覆盖，`DEADLINE` 对会改变状态的动作仍使用“结果未知，先核对再重试”的固定提示。

**诊断**：`browser_call({action:"runtime.status"})` 的结果有 `prompts` 段，列出生效的覆盖项（只有键名和长度，不回显全文）、被忽略的条目及原因、`bodyFile` 回退、L0 与各目录层的估算 token。设置卡片的“提示文本”分区显示同样的信息。

**热更新范围**：
- 目录（根目录、分组、动作、子动作、详情页、搜索）、错误提示：下一次调用即生效，无需重启。
- skill：开关、描述、正文文件和追加文本在下一次 `browser_index` / `browser_call` 时检测变化，注册或撤销 provider，或通过 provider 的 `invalidate()` 通知 Host；正文文件内容变化同样会被发现。
- 两个常驻工具的 `description`，以及 `flat` 表面的各动作工具描述：Host 在注册时固定，**保存后需重启 profile 才生效**。

**预算提醒**：默认 L0（两个常驻工具）约 325 token，预算 1500；`browser_index` 每一层（根、分组、动作、子动作、详情页）预算 1000 token。覆盖后超出预算不会被拒绝，但 `runtime.status` 与设置卡片会给出警告和实际数值。写得越长，每次对话常驻的上下文越多，建议先 `pnpm measure:tools` 看一眼。

**不可配置的内容**：动作名、参数 schema、错误码、审批理由（审批弹窗里的措辞与权限模式挂钩，改写可能误导审批人）、`browser_call` 描述末尾的合规声明、结果里带参数的运行时警告文案（`warnings` 以 `code` 为稳定标识）、参数描述和示例（示例是被测试校验过的可执行调用）。
