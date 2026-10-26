/**
 * Labels and one-line hints for every key of `usagePolicy` and `automationAssets`, plus the words of the limits group.
 * A key added to `../policy-keys.ts` needs its entries here: the render test asks for every one.
 * @module dsh-browser/client/locales-policy
 */
export const zhPolicy = {
    limitsUsageTitle: '调用缓冲', limitsUsageSub: '保护目标站点：限制并发、突发与爬取预算，遇到 429/503 自动退避。', limitsAssetsFold: '资产策略（高级）', limitsAssetsFoldHint: '何时建议总结、数量与上下文预算、激活条件',
    limitsRawFold: '高级：原始 JSON', limitsRawHint: '与上面的输入框是同一份数据；JSON 里只写与默认不同的键。', limitsRawUsage: '调用缓冲 JSON', limitsRawAssets: '资产策略 JSON', policyKeys: '可用键名：',
    limitsOverlayNote: '覆盖层生效：{value}（基线 {baseline}）',
    limitsUnitMs: '毫秒', limitsUnitDays: '天', limitsUnitTokens: 'token', limitsUnitCount: '', limitsUnitRatio: '比例',
    limitsSectionCandidates: '候选与建议', limitsSectionLibrary: '资产库与上下文', limitsSectionActivation: '激活与测试',
    invalidNumber: '请填数字（整数键不能带小数）。', invalidChoice: '不是可选的值。', invalidRange: '超出范围，插件会悄悄截断到边界，所以这里不让保存。',
    pk_minDelayMs: '最小间隔', pk_minDelayMsHint: '同一主机两次请求之间至少等待。', pk_maxConcurrency: '最大并发', pk_maxConcurrencyHint: '同时进行的请求数。', pk_burst: '突发额度', pk_burstHint: '短时间内允许连续发出的请求数。',
    pk_maxPagesPerRun: '单次爬取页数', pk_maxPagesPerRunHint: '一次 crawl 最多访问的页面数。', pk_maxDepth: '爬取深度', pk_maxDepthHint: '从起点出发最多跟进的链接层数。', pk_retryLimit: '重试次数', pk_retryLimitHint: '遇到可重试错误时的最大重试数。',
    pk_backoffBaseMs: '退避基数', pk_backoffBaseMsHint: '重试等待的起始时长，逐次加倍。', pk_cooldownMs: '冷却时长', pk_cooldownMsHint: '收到 429/503 后暂停该主机的时长。',
    pk_persistenceMode: '持久化模式', pk_persistenceModeHint: 'off 不记录；manual 仅手动；suggest 记录并建议（默认）；auto-draft 自动生成草稿。',
    pk_minSuccessfulRuns: '成功次数门槛', pk_minSuccessfulRunsHint: '同一操作成功多少次才建议总结。', pk_minDistinctSessions: '会话数门槛', pk_minDistinctSessionsHint: '成功分布在至少几个不同会话。',
    pk_successWindowDays: '统计窗口', pk_successWindowDaysHint: '只统计最近多少天内的成功。', pk_minSuccessRate: '最低成功率', pk_minSuccessRateHint: '0.5–1 的比例，如 0.8 即 80%。',
    pk_maxCandidates: '候选上限', pk_maxCandidatesHint: '同时保留的候选数量。', pk_candidateTtlDays: '候选保留天数', pk_candidateTtlDaysHint: '候选多久没再出现就丢弃。', pk_maxSuggestionsPerDay: '每日建议上限', pk_maxSuggestionsPerDayHint: '每天最多提示几次“是否总结”；0 为不提示。',
    pk_enabled: '启用资产库', pk_enabledHint: '关闭后不记录、不检索自动化资产。', pk_directory: '资产目录', pk_directoryHint: '绝对路径；留空用 $DSH_HOME/data/browser/automations。', pk_maxDrafts: '草稿上限', pk_maxDraftsHint: '同时保留的草稿数。',
    pk_maxActiveAssets: '激活资产上限', pk_maxActiveAssetsHint: '同时处于激活状态的资产数。', pk_retrievalTopK: '检索条数', pk_retrievalTopKHint: '每次最多向模型展示几条相关资产摘要。', pk_catalogTokenBudget: '目录 token 预算', pk_catalogTokenBudgetHint: '资产摘要占用模型上下文的上限。',
    pk_activationMode: '激活方式', pk_activationModeHint: 'manual 必须手动激活（默认）；auto-tested 通过测试后自动激活。', pk_modelDevelopmentEnabled: '允许模型开发资产', pk_modelDevelopmentEnabledHint: '关闭后 agent 看不到 automation.develop，需重启生效。',
    pk_maxModelDraftWritesPerSession: '模型每会话写草稿次数', pk_maxModelDraftWritesPerSessionHint: '限制一个会话里模型保存草稿的次数。', pk_maxTestCredentials: '保留的测试凭据数', pk_maxTestCredentialsHint: '每个资产保留最近几次测试结果。',
    pk_minInputSetsForActivation: '激活所需输入组数', pk_minInputSetsForActivationHint: '带输入的资产至少要用几组不同输入测试通过才能激活。',
};
export const enPolicy = {
    limitsUsageTitle: 'Call buffer', limitsUsageSub: 'Protects target sites: bounds concurrency, bursts and crawl budget, and backs off on 429/503.', limitsAssetsFold: 'Asset policy (advanced)', limitsAssetsFoldHint: 'when to suggest summarizing, counts and context budget, activation',
    limitsRawFold: 'Advanced: raw JSON', limitsRawHint: 'The same data as the inputs above; write only the keys that differ from the default.', limitsRawUsage: 'Call buffer JSON', limitsRawAssets: 'Asset policy JSON', policyKeys: 'Keys:',
    limitsOverlayNote: 'Overlay in force: {value} (baseline {baseline})',
    limitsUnitMs: 'ms', limitsUnitDays: 'days', limitsUnitTokens: 'tokens', limitsUnitCount: '', limitsUnitRatio: 'ratio',
    limitsSectionCandidates: 'Candidates and suggestions', limitsSectionLibrary: 'Library and context', limitsSectionActivation: 'Activation and tests',
    invalidNumber: 'Enter a number (whole-number keys take no decimals).', invalidChoice: 'Not an allowed value.', invalidRange: 'Out of range: the plugin would quietly clamp it, so saving is refused.',
    pk_minDelayMs: 'Minimum gap', pk_minDelayMsHint: 'Least wait between two requests to one host.', pk_maxConcurrency: 'Max concurrency', pk_maxConcurrencyHint: 'Requests in flight at once.', pk_burst: 'Burst allowance', pk_burstHint: 'Requests allowed back to back in a short window.',
    pk_maxPagesPerRun: 'Pages per crawl', pk_maxPagesPerRunHint: 'Most pages one crawl may visit.', pk_maxDepth: 'Crawl depth', pk_maxDepthHint: 'Most link levels followed from the start.', pk_retryLimit: 'Retries', pk_retryLimitHint: 'Most retries after a retryable error.',
    pk_backoffBaseMs: 'Backoff base', pk_backoffBaseMsHint: 'First retry wait; doubles each time.', pk_cooldownMs: 'Cooldown', pk_cooldownMsHint: 'How long a host pauses after a 429/503.',
    pk_persistenceMode: 'Persistence mode', pk_persistenceModeHint: 'off records nothing; manual by hand only; suggest records and suggests (default); auto-draft writes drafts itself.',
    pk_minSuccessfulRuns: 'Successes needed', pk_minSuccessfulRunsHint: 'Successful runs before summarizing is suggested.', pk_minDistinctSessions: 'Sessions needed', pk_minDistinctSessionsHint: 'The successes span at least this many sessions.',
    pk_successWindowDays: 'Counting window', pk_successWindowDaysHint: 'Only successes this recent count.', pk_minSuccessRate: 'Minimum success rate', pk_minSuccessRateHint: 'A ratio from 0.5 to 1; 0.8 is 80%.',
    pk_maxCandidates: 'Candidate limit', pk_maxCandidatesHint: 'Candidates kept at once.', pk_candidateTtlDays: 'Candidate lifetime', pk_candidateTtlDaysHint: 'Days without a repeat before a candidate is dropped.', pk_maxSuggestionsPerDay: 'Suggestions per day', pk_maxSuggestionsPerDayHint: 'At most this many "summarize?" prompts a day; 0 turns them off.',
    pk_enabled: 'Enable the asset library', pk_enabledHint: 'Off: nothing is recorded or retrieved.', pk_directory: 'Asset directory', pk_directoryHint: 'Absolute path; empty uses $DSH_HOME/data/browser/automations.', pk_maxDrafts: 'Draft limit', pk_maxDraftsHint: 'Drafts kept at once.',
    pk_maxActiveAssets: 'Active asset limit', pk_maxActiveAssetsHint: 'Assets active at once.', pk_retrievalTopK: 'Retrieved entries', pk_retrievalTopKHint: 'Related asset summaries shown to the model per lookup.', pk_catalogTokenBudget: 'Catalog token budget', pk_catalogTokenBudgetHint: 'Most model context the asset summaries may use.',
    pk_activationMode: 'Activation', pk_activationModeHint: 'manual needs a person to activate (default); auto-tested activates once tests pass.', pk_modelDevelopmentEnabled: 'Let the model develop assets', pk_modelDevelopmentEnabledHint: 'Off: the agent does not see automation.develop; restart to apply.',
    pk_maxModelDraftWritesPerSession: 'Model draft saves per session', pk_maxModelDraftWritesPerSessionHint: 'Limits how often the model saves a draft in one session.', pk_maxTestCredentials: 'Test results kept', pk_maxTestCredentialsHint: 'Recent test results kept per asset.',
    pk_minInputSetsForActivation: 'Input sets needed to activate', pk_minInputSetsForActivationHint: 'An asset with inputs must pass tests on at least this many different input sets.',
};
//# sourceMappingURL=locales-policy.js.map