# Playwright Recipe

> 适用版本：`@anweat/dsh-browser` 0.2.2 ｜ [返回 README](../../README.md)

Recipe 是声明式的多步操作，由 `automation.run_recipe`（内联）或 `automation.run`（已激活资产）执行。资产的积累、检索与激活见 [自动化资产](automation-assets.md)。

## 基本写法

Recipe 适合让模型生成可审计、可复现的多步操作，不必生成 JavaScript：

```json
{
  "url": "https://example.com/search",
  "steps": [
    { "type": "wait", "condition": "selector", "value": "#query" },
    { "type": "fill", "selector": "#query", "value": "DeepSeek Harness" },
    { "type": "press", "selector": "#query", "key": "Enter" },
    { "type": "wait", "condition": "load" },
    { "type": "extract", "selector": "main", "mode": "links", "limit": 30 },
    { "type": "screenshot" }
  ]
}
```

支持的步骤为：`wait`、`click`、`fill`、`type`、`press`、`select`、`check`、`hover`、
`scroll`、`extract`、`assert`、`screenshot`。纯读取步骤直接执行；出现点击、输入、键盘、选择、
勾选、悬停或滚动时，`standard` 下整个 Recipe 只询问一次审批，批准后顺序执行；
`autonomous` / `unrestricted` 下直接执行，`read-only` 下拒绝。

## Recipe schema v2

**Recipe schema v2**：资产和内联 recipe 用 `schemaVersion: 2` 启用，缺省为 1，v1 的语义（CSS `selector`、永远取第一个匹配、fill 不允许空串）一律不变。v2 的变化：

- 步骤用 `locator`（`{role,name?,exact?}` / `{label}` / `{text}` / `{testId}` / `{css}`，可加 `framePath`）；严格唯一，歧义时该步不执行且 `effects` 不变。
- 新增 `goto`（URL 必须落在资产的 `domains` 内，保存时和运行时各查一次，也检查重定向落点；内联 recipe 可停留在起始页同源，或落在显式的 `allowedDomains`）和 `clear`；`fill` 的空串必须写 `allowEmpty: true`，或改用 `clear`。
- `extract` 和 `assert` 默认最多等 5 秒（可用 `timeoutMs` 调整），选择器不存在时不再等约 30 秒；`extract` 可用 `as` 命名输出。
- 资产级字段：`inputSchema`（`string` / `number` / `enum`，可带 `required`、`example`、`enumValues`，运行前按 schema 校验并转换）、`outputSchema`（命名输出及类型 `string` / `number` / `json`）、`postconditions`（`{selector}` / `{text}` / `{urlIncludes}` / `{output, nonEmpty|allowEmpty}`）、`requiredCapabilities`（只记录，不门控）。
- `validationStatus` 为 `passed` 当且仅当所有 `assert` 和 postconditions 都成立。**没有任何 assert 或 postcondition 的 v2 资产可以保存为草稿，但测试不会记为 passed**，`testMessage` 会说明原因。
- `automation.develop` 的 `convert` 把 v1 recipe 资产转成**新的** v2 草稿：CSS selector 变成 `{css, explicitFirst: true}`（仍取第一个匹配），全部列入 `pendingDisambiguation`，草稿记录 `sourceAssetId` / `sourceRevision`，原资产（含 active）不会被修改；未知的 extract mode 或 wait condition 会拒绝转换并说明哪一步。

## Recipe 的执行结果

**recipe 的执行结果**：`automation.run_recipe`、`automation.run`、`automation.develop` 的 `test` 总是把完整的运行报告放在 `result` 里，失败时也一样（此时 `ok` 为 false，并附带 `error`）：`executionStatus`（`completed` / `failed` / `cancelled` / `outcome_unknown`）、`validationStatus`（`not_checked` / `passed` / `failed`）、`completedSteps`、`failedStep{index, action, errorCode, message, candidates?}`、`effects`（`none` / `observed` / `unknown`）、`outputs`。`ok` 只在“执行完成且没有断言失败”时为 true。extract 和 screenshot 的值只放在 `outputs`（v2 的 `extract` 带 `as` 时有 `name`），`completedSteps[].output` 是指向它的下标，不再重复一份。fill、clear、type、click、press、select、check 视为有副作用：如果超时发生在**已命中元素、动作已开始之后**，`executionStatus` 为 `outcome_unknown`、`effects` 为 `unknown`；如果 Playwright 的 call log 显示一直只在 “waiting for locator”（元素从未出现），该步没有动手，判为 `failed`、`LOCATOR_NOT_FOUND`，`effects` 不受影响；没有 call log 的超时无法证明元素从未命中，仍按 `outcome_unknown`。取消和整体 deadline 在每一步开始前以及最后一步之后检查；正在执行的 Playwright 步骤无法中断，调用会等它返回，已完成的步骤不回滚，session 页面保持打开。测试或运行只有在执行完成且没有断言失败时才算通过；没有 `assert` 步骤的旧式（v1）recipe 仍可通过测试，但资产记为 `evidenceLevel: 'legacy-unverified'`。
