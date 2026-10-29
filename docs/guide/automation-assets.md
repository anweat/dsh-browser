# 自动化资产（实验性）

> 适用版本：`@anweat/dsh-browser` 0.2.2 ｜ [返回 README](../../README.md)

可复用的 recipe / UserScript 的积累、检索、模型显式开发与激活。Recipe 本身的写法见 [Playwright Recipe](recipes.md)。

> **Experimental:** Recipe/UserScript 的积累、模型开发、检索和复用接口仍可能调整。建议先在隔离 profile 中启用，审阅草稿并完成真实浏览器回放后再手动激活；不要把它作为无人监管的生产写操作入口。

自动化执行自由度与资产持久化是两套独立开关。`automationMode: unrestricted` 只影响执行审批，不会让 Agent 自动保存脚本；默认 `automationAssets.persistenceMode: suggest` 仅对成功的 `automation.run_recipe` 记录脱敏语义步骤。具体输入会替换为 `{{input}}` / `{{secret}}`，会话 ID 只保存短哈希，不保存页面正文、cookie、token、密码或聊天记录。

默认在 14 天窗口内，同一域名和步骤指纹至少成功 3 次、来自至少 2 个会话且成功率达到 80%，面板才出现“是否总结”候选。每天最多提示 2 次；候选、草稿和已激活资产均有数量上限。推荐流程是：

1. 候选达到阈值后，在“浏览器自动化 → 可复用自动化资产”选择“总结为草稿”或“暂不总结”。
2. 在脚本列表点选草稿；只有此时前端才按 ID 读取完整 recipe / UserScript。编辑器支持 recipe 和带 `@match`、`@grant none` 的 UserScript。UserScript 可从只读对象 `__DSH_INPUTS__` 读取 `inputNames` 声明的运行时输入，输入不会写入资产文件。
3. 保存后先做静态校验，再填写测试 URL/输入执行真实浏览器回放。只有真实回放成功才可手动激活；已激活版本不可原地编辑，避免后台行为静默漂移。
4. Agent 用 `automation.search` 获取有界摘要，再用 `automation.run` 按 ID 调用。检索默认 top 5、目录预算约 800 tokens，源码不会进入模型上下文。

`persistenceMode` 可选 `off | manual | suggest | auto-draft`。日常使用建议 `suggest`；`auto-draft` 只适合隔离测试 profile，并且仍不会自动激活。`activationMode` 当前默认并推荐 `manual`；`auto-tested` 作为后续真实沙箱回放策略的保留配置，不会把一次静态校验当成生产激活依据。

## 模型显式开发 recipe / UserScript

模型目录不会预载任何 recipe 或源码。需要批量索引等强指向自动化时，模型按以下顺序显式访问：

1. 调用 `automation.search(query="batch-index issues", status="draft|active", kind="recipe")`，仅得到 ID、名称、标签、域名、输入名和运行统计。
2. 确认要修改某项后，调用 `automation.develop(action="get", id="...")`；只有这一步会把单个资产的完整 recipe/源码带入当前上下文。
3. `action="save"` 可直接声明新的 recipe（建议 `schemaVersion: 2`，见 [Playwright Recipe](recipes.md#recipe-schema-v2)），或保存带 `@match` / `@grant none` 的 UserScript；只能生成/更新 draft，且整体替换。`action="convert"` 把 v1 资产复制成新的 v2 草稿。默认每个模型会话最多写 3 次（save 与 convert 合计），仍受全局 `maxDrafts` 限制。
4. `action="validate"` 只做结构与 UserScript 元数据校验，不提供激活资格；`action="test"` 必须给 URL 和声明输入，执行真实 Playwright 回放，成功后才标记 `passed`。
5. 激活、归档和回滚只在可视化面板完成，模型开发工具没有对应动作。

recipe 建议把检索意图固化在 `name`、`description` 和 `tags`，例如 `batch-index`、`issues`、`community-search`。检索采用小规模确定性关键词评分和 token 预算，不自动把整个资产库升级成模型工具，也不使用隐藏的全量 prompt 注入。

`modelDevelopmentEnabled: false` 会在重启后直接从模型工具目录移除开发入口；`standard` 保存草稿和真实回放均需审批，`autonomous` 可直接保存草稿但真实回放仍需审批，只有 `unrestricted` 才会跳过回放审批。所有模式仍执行域名、UserScript 元数据、输入、源码大小和使用频率限制。
