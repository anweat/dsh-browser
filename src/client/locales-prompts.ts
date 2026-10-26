/**
 * Words of the prompts group: the list of texts and entries, the editing dialogs, and the export dialog.
 * @module dsh-browser/client/locales-prompts
 */

export const zhPrompts = {
  lang: 'zh',
  promptsStatusLine: 'L0 常驻 ≈ {l0} / {l0Budget} tokens · 最大目录层 {layer} ≈ {tokens} / {layerBudget}', promptsStatusOverrides: '{n} 项覆盖生效', promptsStatusNone: '没有覆盖，全部使用默认文本', promptsStatusDiagnostics: '{n} 条诊断',
  promptsDiagnosticsFold: '诊断详情', promptsStatusUnavailable2: '暂时读不到插件状态（重启中？），稍后刷新。',
  promptsListTitle: '文本', promptsListHint: '模型读到的工具描述、指南与 skill 文字。点“编辑”看默认文本并改写。',
  promptsEntriesTitle: '分组 / 动作 / 错误提示条目', promptsEntriesHint: '只列出你改过的条目；其余沿用默认。',
  promptsEntriesEmpty: '没有改过的条目。', promptsEntryAdd: '新增条目',
  promptStateDefault: '默认', promptStateOverridden: '已覆盖', promptChars: '{n} 字符',
  promptEditTitle: '编辑：{name}', promptDefaultCol: '默认文本（只读）', promptMineCol: '我的覆盖', promptNoDefault: '（没有默认文本：留空表示不设置）', promptDefaultMissing: '（默认文本读取中或暂不可用）',
  promptEmptyIsDefault: '留空即使用默认文本。', promptStart: '以默认为起点', promptRestore: '恢复默认', promptSave: '保存', promptSameAsDefault: '与默认文本相同，等同于没有覆盖：不会保存，以后默认文本升级时会自动跟进。',
  promptKindGroups: '分组', promptKindActions: '动作', promptKindErrorHints: '错误提示',
  promptEntryNewTitle: '新增条目', promptEntryEditTitle: '编辑条目：{key}', promptEntryKind: '类型', promptEntryKindHint: '分组=分组列表里的一行；动作=动作目录与详情；错误提示=失败后附在结果里的提示。',
  promptEntryKey: '键', promptEntryKeyHint: '分组名、group.action（子动作、主题含第三段）或错误码；可从建议里选。', promptEntryKeyInvalid: '键只能含字母、数字、_、. 与 -。', promptEntryUnknown: '默认文本里没有这个键：运行时会忽略它并在诊断里提示。',
  promptEntrySummary: '摘要（summary）', promptEntryNotes: '补充说明（notes）', promptEntryText: '提示文字', promptEntryRemove: '删除覆盖',
  promptExportOpen: '导出默认文本', promptExportTitle: '默认文本', promptExportYaml: '带注释 YAML（推荐）', promptExportJson: 'JSON', promptExportCopy: '复制', promptExportCopied: '已复制',
  promptExportHint: 'YAML 在每段前注明模型何时读到、字数上限与生效方式；JSON 与上面的覆盖项结构完全一致。复制后删掉保持默认的部分，改写其余，粘贴到 profile 配置里本插件段的 prompts 下。',
  promptExportFailed: '暂时读不到默认文本，请稍后重试。', promptExportLoading: '读取中…',
} as const

export const enPrompts: Record<keyof typeof zhPrompts, string> = {
  lang: 'en',
  promptsStatusLine: 'L0 always-on ≈ {l0} / {l0Budget} tokens · largest catalog layer {layer} ≈ {tokens} / {layerBudget}', promptsStatusOverrides: '{n} override(s) in force', promptsStatusNone: 'No overrides: every text is the default', promptsStatusDiagnostics: '{n} diagnostic(s)',
  promptsDiagnosticsFold: 'Diagnostic details', promptsStatusUnavailable2: 'The plugin status cannot be read right now (restarting?); refresh in a moment.',
  promptsListTitle: 'Texts', promptsListHint: 'Tool descriptions, guides and skill text the model reads. Edit shows the default beside your override.',
  promptsEntriesTitle: 'Group / action / error-hint entries', promptsEntriesHint: 'Only entries you changed are listed; the rest keep the default.',
  promptsEntriesEmpty: 'No entries changed.', promptsEntryAdd: 'Add entry',
  promptStateDefault: 'default', promptStateOverridden: 'overridden', promptChars: '{n} chars',
  promptEditTitle: 'Edit: {name}', promptDefaultCol: 'Default text (read-only)', promptMineCol: 'Your override', promptNoDefault: '(No default text: empty means not set)', promptDefaultMissing: '(The default text is loading or unavailable)',
  promptEmptyIsDefault: 'Empty uses the default text.', promptStart: 'Start from default', promptRestore: 'Restore default', promptSave: 'Save', promptSameAsDefault: 'Same as the default text, so it is no override: it is not saved and follows the default when that is improved.',
  promptKindGroups: 'group', promptKindActions: 'action', promptKindErrorHints: 'error hint',
  promptEntryNewTitle: 'Add an entry', promptEntryEditTitle: 'Edit entry: {key}', promptEntryKind: 'Kind', promptEntryKindHint: 'group = one line of the group list; action = the catalog and detail of an action; error hint = text attached to a failed result.',
  promptEntryKey: 'Key', promptEntryKeyHint: 'A group name, group.action (a sub-action or topic adds a third part) or an error code; pick from the suggestions.', promptEntryKeyInvalid: 'A key holds only letters, digits, _, . and -.', promptEntryUnknown: 'The defaults have no such key: the plugin ignores it and says so in the diagnostics.',
  promptEntrySummary: 'Summary', promptEntryNotes: 'Notes', promptEntryText: 'Hint text', promptEntryRemove: 'Remove override',
  promptExportOpen: 'Export default text', promptExportTitle: 'Default text', promptExportYaml: 'Commented YAML (recommended)', promptExportJson: 'JSON', promptExportCopy: 'Copy', promptExportCopied: 'Copied',
  promptExportHint: 'The YAML says before each section when the model reads it, its length cap and when a change applies; the JSON has exactly the structure of the overrides. Copy it, delete what stays default, reword the rest, and paste it under prompts in the plugin\'s section of the profile config.',
  promptExportFailed: 'The default text cannot be read right now; try again shortly.', promptExportLoading: 'Loading…',
}
