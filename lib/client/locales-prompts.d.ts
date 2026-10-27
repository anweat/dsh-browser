/**
 * Words of the prompts group: the list of texts and entries, the editing dialogs, and the export dialog.
 * @module dsh-browser/client/locales-prompts
 */
export declare const zhPrompts: {
    readonly lang: "zh";
    readonly promptsStatusLine: "L0 常驻 ≈ {l0} / {l0Budget} tokens · 最大目录层 {layer} ≈ {tokens} / {layerBudget}";
    readonly promptsStatusOverrides: "{n} 项覆盖生效";
    readonly promptsStatusNone: "没有覆盖，全部使用默认文本";
    readonly promptsStatusDiagnostics: "{n} 条诊断";
    readonly promptsDiagnosticsFold: "诊断详情";
    readonly promptsStatusUnavailable2: "暂时读不到插件状态（重启中？），稍后刷新。";
    readonly promptsListTitle: "文本";
    readonly promptsListHint: "模型读到的工具描述、指南与 skill 文字。点“编辑”看默认文本并改写。";
    readonly promptsEntriesTitle: "分组 / 动作 / 错误提示条目";
    readonly promptsEntriesHint: "只列出你改过的条目；其余沿用默认。";
    readonly promptsEntriesEmpty: "没有改过的条目。";
    readonly promptsEntryAdd: "新增条目";
    readonly promptStateDefault: "默认";
    readonly promptStateOverridden: "已覆盖";
    readonly promptChars: "{n} 字符";
    readonly promptEditTitle: "编辑：{name}";
    readonly promptDefaultCol: "默认文本（只读）";
    readonly promptMineCol: "我的覆盖";
    readonly promptNoDefault: "（没有默认文本：留空表示不设置）";
    readonly promptDefaultMissing: "（默认文本读取中或暂不可用）";
    readonly promptEmptyIsDefault: "留空即使用默认文本。";
    readonly promptStart: "以默认为起点";
    readonly promptRestore: "恢复默认";
    readonly promptSave: "保存";
    readonly promptSameAsDefault: "与默认文本相同，等同于没有覆盖：不会保存，以后默认文本升级时会自动跟进。";
    readonly promptKindGroups: "分组";
    readonly promptKindActions: "动作";
    readonly promptKindErrorHints: "错误提示";
    readonly promptEntryNewTitle: "新增条目";
    readonly promptEntryEditTitle: "编辑条目：{key}";
    readonly promptEntryKind: "类型";
    readonly promptEntryKindHint: "分组=分组列表里的一行；动作=动作目录与详情；错误提示=失败后附在结果里的提示。";
    readonly promptEntryKey: "键";
    readonly promptEntryKeyHint: "分组名、group.action（子动作、主题含第三段）或错误码；可从建议里选。";
    readonly promptEntryKeyInvalid: "键只能含字母、数字、_、. 与 -。";
    readonly promptEntryUnknown: "默认文本里没有这个键：运行时会忽略它并在诊断里提示。";
    readonly promptEntrySummary: "摘要（summary）";
    readonly promptEntryNotes: "补充说明（notes）";
    readonly promptEntryText: "提示文字";
    readonly promptEntryRemove: "删除覆盖";
    readonly promptExportOpen: "导出默认文本";
    readonly promptExportTitle: "默认文本";
    readonly promptExportYaml: "带注释 YAML（推荐）";
    readonly promptExportJson: "JSON";
    readonly promptExportCopy: "复制";
    readonly promptExportCopied: "已复制";
    readonly promptExportHint: "YAML 在每段前注明模型何时读到、字数上限与生效方式；JSON 与上面的覆盖项结构完全一致。复制后删掉保持默认的部分，改写其余，粘贴到 profile 配置里本插件段的 prompts 下。";
    readonly promptExportFailed: "暂时读不到默认文本，请稍后重试。";
    readonly promptExportLoading: "读取中…";
};
export declare const enPrompts: Record<keyof typeof zhPrompts, string>;
