# 内核与依赖

> 适用版本：`@anweat/dsh-browser` 0.2.2 ｜ [返回 README](../../README.md)

## 浏览器怎么选

让模型调用 `browser_call({action:"runtime.status"})`（或看设置卡片的状态摘要）确认 `browser.ready` 为 `true`：

- 有 Google Chrome / Microsoft Edge：自动使用，不下载任何东西（`channel` 保持默认 `chromium` 即可）。Playwright 的 Chromium 一旦下载过，就改用它；填了 `executablePath`，或把 `channel` 设为 `chrome` / `msedge`，则固定用你指定的那个，找不到就报错、不会悄悄换别的。
- 都没有：选一条——① 装 Chrome 或 Edge；② 让模型调用 `runtime.install` 动作（下载 Playwright Chromium，约 190 MB，磁盘占用约 600 MB，会询问审批）；③ 终端里 `node "<profile>/node_modules/playwright/cli.js" install chromium`（准确路径写在错误信息和 `runtime.status.browser.installAdvice` 里；如果设置了 `PLAYWRIGHT_BROWSERS_PATH`，命令里会带上它）；④ 在设置里填 `executablePath`。
- 开了 `autoInstall: true` 的人：缺 Chromium 时仍然自动下载（不会改用系统 Chrome），行为同以前。

设置卡片顶部的状态摘要会直接说明运行环境：

- 没有任何可启动的浏览器：红色徽章“没有可用浏览器”，点“查看详情”有可照做的步骤；
- 用的是系统 Chrome / Edge（Playwright 的 Chromium 没下载过）：徽章“浏览器：系统 Chrome / Edge”，这是正常状态，什么都不用做；
- 开着 OpenCLI 但没装：徽章“OpenCLI 未安装”，不是警告。

## 打包 vs 复用

| 层 | 实际是什么 | 打包还是复用 |
|---|---|---|
| **浏览器** | 系统 Google Chrome / Edge，或共享缓存（Windows `%LOCALAPPDATA%\ms-playwright`，其他系统见下）里的 Playwright Chromium（约 400MB） | **安装插件时不下载任何浏览器**。优先 Playwright Chromium，没有就用系统 Chrome / Edge；都没有时 `runtime.install` 一键补 |
| **playwright 驱动**（JS 包） | `playwright` npm 依赖 | 插件本地 node_modules 优先，缺省回退全局 npm |
| **patchright 驱动**（可选） | 与 Playwright 同版本的 Chromium 兼容驱动 | 插件内置；配置 `browserRuntime: patchright` 才启用 |
| **opencli**（纯 Node CLI，可选） | `@jackwener/opencli`，**不是**本包依赖 | 不打包：它的安装脚本会让 pnpm 11 的 `dsh plugin add` 报失败。要用就 `npm i -g @jackwener/opencli`，插件在 `PATH`、全局 npm 目录和 profile 里找它 |

## 把共享浏览器缓存放到别的盘（可选）

Playwright 的共享缓存默认位置：Windows `%LOCALAPPDATA%\ms-playwright`（即系统盘，约 400MB），macOS `~/Library/Caches/ms-playwright`，Linux `~/.cache/ms-playwright`；设置了 `PLAYWRIGHT_BROWSERS_PATH` 时以它为准。
若要把内核放在别的盘、或直接复用一份已有的内核，在 loader 条目上显式给出可执行文件路径：

```yaml
- id: browser
  config:
    executablePath: 'E:/caches/ms-playwright/chromium-1234/chrome-win64/chrome.exe'
```

`executablePath` 必须指向真实的内核可执行文件（不是目录）；设置后 `runtime.status` 会显示该路径，
`runtime.install` 不再需要执行。`browserRuntime: patchright` 时同样适用。
注意该字段在插件挂载时解析：改完需要重新加载 profile（重启 Web profile），仅刷新网页不生效。

## Patchright 可选内核

Patchright 是 Playwright-compatible 的 Chromium 驱动，适合普通 Playwright 在搜索页遇到自动化检测时显式启用：

```yaml
browserRuntime: patchright
channel: chrome
headless: false
```

`channel: chrome + headless: false` 是更贴近其推荐的兼容配置；CI/无人值守也可使用 headless，但 `runtime.status.runtimeWarnings` 会如实提示差异。Patchright 会禁用 Playwright console API，因此依赖控制台监听的 Recipe/脚本不应切换到它。不要再叠加自定义 User-Agent、额外请求头或指纹注入器；这类组合更容易形成自相矛盾的指纹。

Camoufox 当前没有硬集成：截至本版，其 JS 包要求 Node 22 且 peer 约束为 `playwright-core <1.61`，与本插件验证的 Playwright/Patchright 1.62.1 不兼容，并需要独立下载 Firefox 内核。后续等版本边界对齐后再作为第三 provider 接入，避免安装后才发生依赖漂移。
