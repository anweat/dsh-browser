/**
 * The comments printed in front of every key of the default-parameters text (the "Advanced: text mode" view), in the
 * language of the card: what the setting is for, its allowed values or range, its default, and the risk when there is
 * one. Comment lines start with `#`, which the parser ignores, so they are never data and a round trip keeps every key.
 * Pure, with no DOM: `properties-form.ts` prints with these, the tests read them.
 * @module dsh-browser/client/property-docs
 */

export type DocLang = 'en' | 'zh'

export interface PropertyDocs {
  /** Lines at the top of the text (each is printed after `# `). */
  header: readonly string[]
  /** The title of each group of keys. */
  group: Readonly<Record<string, string>>
  /** One line per key: use, values or range, default, risk. */
  key: Readonly<Record<string, string>>
}

const EN: PropertyDocs = {
  header: [
    'Default parameters: what every new browser context starts from. An agent copies these for a task and changes only what the task needs.',
    '`key = value` overrides the default. A line starting with # is a comment and is ignored when you save; the comment above each key explains it.',
    'A commented `# key = value` line shows the value in force now. Delete or comment a line to go back to the default.',
  ],
  group: { runtime: 'Browser runtime', context: 'Page environment (window, language, egress)', files: 'Login state, files and limits' },
  key: {
    browserRuntime: 'Driver: playwright | patchright (Chromium only, better against bot checks). Default: playwright',
    channel: 'Browser: chromium (Playwright Chromium; the installed Chrome / Edge is used when it is missing) | chrome | msedge (always that installed browser). Patchright works best with chrome. Default: chromium',
    headless: 'true = no browser window | false = show it. Default: true',
    autoInstall: 'true = download Playwright Chromium when it is missing (about 150 MB; the system Chrome is then not used instead) | false. Keep false: an installed Chrome / Edge is used directly, else use the runtime.install action. Default: false',
    executablePath: 'Absolute path of a custom browser; empty = Playwright Chromium, or the system Chrome / Edge when it is missing. Default: empty',
    cdpPort: 'Local remote-debugging (CDP) port, 1-65535; empty = off. Risk: other programs on this machine can then control the browser. Default: empty',
    maxSessions: 'Sessions that may hold a page at once, 1-64; past it the least recently used one is closed. Default: 8',
    args: 'Extra Chromium launch arguments as one JSON array line, e.g. ["--disable-gpu"]. Add only arguments you understand. Default: [] (none)',
    viewportMode: 'Viewport: window = browser default | 720p (1280x720) | 1080p (1920x1080) | custom (needs width and height). Default: window',
    viewportWidth: 'Custom viewport width in pixels, 200-7680; used only with viewportMode = custom. Default: empty',
    viewportHeight: 'Custom viewport height in pixels, 200-4320; used only with viewportMode = custom. Default: empty',
    userAgent: 'User-Agent header, up to 512 characters. Risk: changes the browser fingerprint sites see. Empty = the browser\'s own. Default: empty',
    locale: 'Language tag (BCP 47) such as en-US or zh-CN; empty = the browser\'s own. Default: empty',
    timezoneId: 'IANA time zone such as Asia/Shanghai; empty = this machine\'s. Default: empty',
    proxyServer: 'Proxy such as http://127.0.0.1:7890 or socks5://127.0.0.1:1080. No accounts or passwords: never put credentials here. Empty = direct. Default: empty',
    proxyBypass: 'Hosts that skip the proxy, comma-separated, e.g. example.com,.internal.test; needs proxyServer. Default: empty',
    storageStatePath: 'Global login-state file (legacy: applies to every site, no domain limit). Use login profiles instead. Default: empty',
    defaultAuthProfile: 'Name of the login profile used when none is named; it must exist. crawl is always anonymous. Default: empty',
    allowPrivateHosts: 'true = an agent policy action may allow localhost and LAN addresses in a login profile | false. Risk: widens what an agent can authorize. Default: false',
    snapshotDir: 'Absolute directory for screenshots; empty = $DSH_HOME/data/browser/snapshots. Default: empty',
    downloadDir: 'Absolute directory downloads are saved to; empty = $DSH_HOME/data/browser/downloads. Default: empty',
    downloadMaxBytes: 'Largest single download in bytes, 1 to 10737418240 (10 GiB); a bigger one is stopped and removed. Default: 104857600 (100 MiB)',
    verbose: 'true = print startup and diagnostic details | false. Default: false',
  },
}

const ZH: PropertyDocs = {
  header: [
    '默认参数：每个新 browser context 的起点；agent 按任务复制它们，只改任务需要改的部分。',
    '`key = value` 表示覆盖默认值；以 # 开头的行是注释，保存时忽略；每个键上面的注释说明它的用途。',
    '被注释的 `# key = 值` 行显示当前生效的值；删掉或注释一行即恢复默认。',
  ],
  group: { runtime: '浏览器运行时', context: '页面环境（窗口、语言、出口）', files: '登录态、文件与限额' },
  key: {
    browserRuntime: '驱动：playwright | patchright（仅 Chromium，对反爬检测更友好）。默认 playwright',
    channel: '浏览器：chromium（Playwright 的 Chromium，缺失时自动改用本机 Chrome / Edge）| chrome | msedge（固定用本机已装的那个）。Patchright 推荐 chrome。默认 chromium',
    headless: 'true = 不显示浏览器窗口 | false = 显示。默认 true',
    autoInstall: 'true = 缺失时自动下载 Playwright Chromium（约 150 MB，且不再改用系统 Chrome）| false。建议保持 false：装了 Chrome / Edge 就直接用，没有再用 runtime.install 动作。默认 false',
    executablePath: '自定义浏览器的绝对路径；留空 = Playwright Chromium，缺失时用系统 Chrome / Edge。默认 空',
    cdpPort: '本机远程调试（CDP）端口，1–65535；留空 = 关闭。风险：同机其它程序可借此控制浏览器。默认 空',
    maxSessions: '同时持有页面的会话数，1–64；超出时关闭最久未使用的。默认 8',
    args: '追加的 Chromium 启动参数，写成一行 JSON 数组，如 ["--disable-gpu"]；只加你理解的参数。默认 []（无）',
    viewportMode: '视口：window = 浏览器默认 | 720p（1280x720）| 1080p（1920x1080）| custom（需同时填宽高）。默认 window',
    viewportWidth: '自定义视口宽度（像素），200–7680；仅 viewportMode = custom 时生效。默认 空',
    viewportHeight: '自定义视口高度（像素），200–4320；仅 viewportMode = custom 时生效。默认 空',
    userAgent: 'User-Agent 头，至多 512 字符。风险：会改变站点看到的浏览器指纹；留空 = 浏览器自带。默认 空',
    locale: '语言标签（BCP 47），如 en-US、zh-CN；留空 = 浏览器自带。默认 空',
    timezoneId: 'IANA 时区，如 Asia/Shanghai；留空 = 本机时区。默认 空',
    proxyServer: '代理，如 http://127.0.0.1:7890 或 socks5://127.0.0.1:1080。不支持账号密码，切勿把凭据写在这里；留空 = 直连。默认 空',
    proxyBypass: '不走代理的主机，逗号分隔，如 example.com,.internal.test；需先设 proxyServer。默认 空',
    storageStatePath: '全局登录态文件（旧版入口：对所有站点生效，没有域名限制）；请改用登录 profile。默认 空',
    defaultAuthProfile: '未指定时使用的登录 profile 名，必须已存在；crawl 始终匿名。默认 空',
    allowPrivateHosts: 'true = agent 的策略动作可把 localhost 与内网地址加入登录 profile | false。风险：扩大 agent 可授权的范围。默认 false',
    snapshotDir: '截图目录的绝对路径；留空 = $DSH_HOME/data/browser/snapshots。默认 空',
    downloadDir: '下载目录的绝对路径；留空 = $DSH_HOME/data/browser/downloads。默认 空',
    downloadMaxBytes: '单个下载的字节上限，1 到 10737418240（10 GiB）；超出会中止并删除。默认 104857600（100 MiB）',
    verbose: 'true = 输出启动与诊断信息 | false。默认 false',
  },
}

/** The docs of a language; anything but `zh` is English. */
export function propertyDocs(lang: DocLang | string = 'en'): PropertyDocs {
  return lang === 'zh' ? ZH : EN
}
