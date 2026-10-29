# 发布与构建

> 适用版本：`@anweat/dsh-browser` 0.2.2 ｜ [返回 README](../../README.md)

```bash
pnpm install          # 装依赖（playwright / patchright / opencli / @deepseek-ai/*）
pnpm test
pnpm run build        # tsc → lib/
pnpm run verify       # typecheck → build → real-browser tests → client bundle check
node scripts/install-browser.mjs   # 安装 chromium 内核（发布前验证，可选）
```
