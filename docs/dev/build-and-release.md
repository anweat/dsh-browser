# 发布与构建

> 适用版本：`@anweat/dsh-browser` 0.2.2 ｜ [返回 README](../../README.md)

需要 Node `^22.19 || >=24` 和 pnpm 11（`packageManager` 字段锁定 `pnpm@11.7.0`）。

```bash
pnpm install                  # 装依赖（playwright / patchright / @deepseek-ai/*；opencli 只是 devDependency，供测试使用）
pnpm run typecheck            # tsc --noEmit
pnpm run build                # 清理 lib/、tsc → lib/、tsdown 打 client bundle；改了 src/ 要重建 lib/ 并一起提交
pnpm test                     # 单元测试（test/*.test.ts），会用到 Playwright 的浏览器
pnpm run test:e2e             # 真实浏览器 e2e（test/e2e/*.test.ts），较慢，改动只涉及文档时可以不跑
pnpm run test:peers           # 受管 peer 范围的双解析模式检查，见 host-compat.md
pnpm run test:client-bundle   # 检查 client bundle 只引用宿主模块表里有的模块，且不带源码内容
pnpm run docs:check           # 检查 Markdown 相对链接 / 锚点，以及 README.md 与 README.en.md 的二级标题数量
pnpm run verify               # typecheck → test:peers → build → test → test:client-bundle → docs:check（不含 e2e）
pnpm run measure:tools        # 工具面的常驻 token 估算（indexed 约 325，flat 约 17.4k）
pnpm run prompts:dump         # 打印全部可覆盖的提示文本（与设置卡片的“导出默认文本”相同）
node scripts/install-browser.mjs   # 安装 chromium 内核（发布前验证，可选）
```

测试在隔离的 `DSH_HOME` 里运行（`test/isolate-home.mjs`），不会读写真实的 `~/.dsh`。已经有 Playwright 浏览器缓存的机器上，用 `PLAYWRIGHT_BROWSERS_PATH` 指向它即可，不必重新下载。

`prepublishOnly` 会跑 `pnpm run verify`。发布到 npm 的包只含 `package.json` 的 `files` 里列出的内容（`lib`、`assets`、`cordis.patch.yml`、`README.md`、`README.en.md`、`CHANGELOG.md`、`AUDIT.md`、`scripts`、`LICENSE`）；`docs/` 不进包，所以 README 里指向 `docs/` 的链接都用 GitHub 绝对地址。用 `pnpm pack --dry-run` 确认包内容。

## 文档约定

- 面向用户的主题文档放 `docs/guide/`（中文），面向维护者的放 `docs/dev/`，验证记录放 `docs/validation/`；`docs/README.md` 是索引。
- 每篇 guide 顶部一行写适用版本和返回 README 的链接。
- 版本相关的变化写进 `CHANGELOG.md`，不要再写进 README。
- `README.md` 与 `README.en.md` 保持同样的结构（二级标题数量一致，`pnpm run docs:check` 会检查）。
