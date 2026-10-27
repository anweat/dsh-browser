window.__ModuleLoader__.load({
	id: "@anweat/dsh-browser",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/policy-keys.ts
		/**
		* The keys of the two JSON policy objects, in one place.
		*
		* The settings card validates what a person types into the "automation asset policy" and "usage buffer" boxes against
		* these lists and prints them under the boxes, so a key added to a policy is added here once. This module has no
		* imports on purpose: the card bundles it for the browser. test/policy-keys.test.ts holds the lists equal to what the
		* resolvers return and to the Host Config schema.
		* @module dsh-browser/policy-keys
		*/
		/** Every key of `automationAssets`, in documentation order. */
		const ASSET_POLICY_KEYS = [
			"enabled",
			"directory",
			"persistenceMode",
			"activationMode",
			"minSuccessfulRuns",
			"minDistinctSessions",
			"successWindowDays",
			"minSuccessRate",
			"maxCandidates",
			"candidateTtlDays",
			"maxSuggestionsPerDay",
			"maxDrafts",
			"maxActiveAssets",
			"retrievalTopK",
			"catalogTokenBudget",
			"modelDevelopmentEnabled",
			"maxModelDraftWritesPerSession",
			"maxTestCredentials",
			"minInputSetsForActivation"
		];
		/** The keys of `automationAssets` that are not plain non-negative numbers. */
		const ASSET_POLICY_BOOLEAN_KEYS = ["enabled", "modelDevelopmentEnabled"];
		const ASSET_POLICY_STRING_KEYS = ["directory"];
		const ASSET_POLICY_ENUMS = {
			persistenceMode: [
				"off",
				"manual",
				"suggest",
				"auto-draft"
			],
			activationMode: ["manual", "auto-tested"]
		};
		/** Numeric keys with a range the card enforces itself; the resolver would otherwise clamp silently. */
		const ASSET_POLICY_INTEGER_RANGES = { minInputSetsForActivation: [1, 5] };
		/** `usagePolicy`: every key with the inclusive integer range the resolver enforces. */
		const USAGE_POLICY_BOUNDS = {
			minDelayMs: [0, 6e4],
			maxConcurrency: [1, 8],
			burst: [1, 20],
			maxPagesPerRun: [1, 100],
			maxDepth: [0, 5],
			retryLimit: [0, 5],
			backoffBaseMs: [1, 6e4],
			cooldownMs: [100, 3e5]
		};
		const USAGE_POLICY_KEYS = Object.keys(USAGE_POLICY_BOUNDS);
		/** The name of a login profile: starts with a letter or digit, then letters, digits, `_` and `-`, at most 40 characters. The policy overlay and the settings card use this one rule. */
		const AUTH_PROFILE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;
		/** `usagePolicy` defaults (what a missing key means). test/policy-keys.test.ts holds them equal to the resolver's. */
		const USAGE_POLICY_DEFAULTS = {
			minDelayMs: 750,
			maxConcurrency: 2,
			burst: 3,
			maxPagesPerRun: 20,
			maxDepth: 2,
			retryLimit: 2,
			backoffBaseMs: 1e3,
			cooldownMs: 3e4
		};
		/**
		* `automationAssets` defaults and the inclusive range of each number. The resolver CLAMPS a value outside its range
		* without a word; the card shows the range and refuses such a value instead. `directory` has no default (the plugin
		* picks one under $DSH_HOME).
		*/
		const ASSET_POLICY_DEFAULTS = {
			enabled: true,
			persistenceMode: "suggest",
			activationMode: "manual",
			minSuccessfulRuns: 3,
			minDistinctSessions: 2,
			successWindowDays: 14,
			minSuccessRate: .8,
			maxCandidates: 20,
			candidateTtlDays: 14,
			maxSuggestionsPerDay: 2,
			maxDrafts: 10,
			maxActiveAssets: 50,
			retrievalTopK: 5,
			catalogTokenBudget: 800,
			modelDevelopmentEnabled: true,
			maxModelDraftWritesPerSession: 3,
			maxTestCredentials: 5,
			minInputSetsForActivation: 2
		};
		const ASSET_POLICY_BOUNDS = {
			minSuccessfulRuns: [2, 20],
			minDistinctSessions: [1, 10],
			successWindowDays: [1, 90],
			minSuccessRate: [.5, 1],
			maxCandidates: [1, 100],
			candidateTtlDays: [1, 90],
			maxSuggestionsPerDay: [0, 20],
			maxDrafts: [1, 100],
			maxActiveAssets: [1, 200],
			retrievalTopK: [1, 20],
			catalogTokenBudget: [100, 4e3],
			maxModelDraftWritesPerSession: [1, 20],
			maxTestCredentials: [1, 20],
			minInputSetsForActivation: [1, 5]
		};
		//#endregion
		//#region src/config-rules.ts
		/** Bounds of a custom viewport, in CSS pixels. */
		const VIEWPORT_LIMITS = {
			minWidth: 200,
			maxWidth: 7680,
			minHeight: 200,
			maxHeight: 4320
		};
		/** Upper bound of downloadMaxBytes: 10 GiB. */
		const MAX_DOWNLOAD_BYTES_LIMIT = 10737418240;
		const CONTROL = /[\u0000-\u001f\u007f]/;
		const PROXY_SCHEMES = [
			"http:",
			"https:",
			"socks5:",
			"socks4:"
		];
		function checkUserAgent(value, label, fail) {
			if (typeof value !== "string" || !value.trim() || value.length > 512 || CONTROL.test(value)) fail(`${label} must be 1 to 512 characters without control characters`);
			return value.trim();
		}
		function checkLocale(value, label, fail) {
			if (typeof value !== "string" || !value.trim()) fail(`${label} must be a BCP 47 language tag such as en-US or zh-CN`);
			try {
				const [canonical] = Intl.getCanonicalLocales(value.trim());
				if (canonical) return canonical;
			} catch {}
			return fail(`${label} "${String(value)}" is not a valid BCP 47 language tag (examples: en-US, zh-CN, de-DE)`);
		}
		function checkTimezone(value, label, fail) {
			if (typeof value !== "string" || !value.trim()) fail(`${label} must be an IANA time zone such as Asia/Shanghai or America/New_York`);
			const zone = value.trim();
			try {
				new Intl.DateTimeFormat("en-US", { timeZone: zone });
				return zone;
			} catch {
				return fail(`${label} "${zone}" is not a known IANA time zone (examples: Asia/Shanghai, America/New_York, UTC)`);
			}
		}
		/**
		* A proxy server address: `http://host:port`, `https://...`, `socks5://...` or `socks4://...`; a bare
		* `host:port` means http. Anything carrying credentials is refused.
		*/
		function checkProxyServer(value, label, fail) {
			if (typeof value !== "string" || !value.trim() || value.length > 512 || CONTROL.test(value)) fail(`${label} must be a proxy address such as http://127.0.0.1:7890 or socks5://127.0.0.1:1080`);
			const raw = value.trim();
			const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : "http://" + raw;
			let parsed;
			try {
				parsed = new URL(withScheme);
			} catch {
				return fail(`${label} "${raw}" is not a valid proxy address (expected scheme://host:port)`);
			}
			if (!PROXY_SCHEMES.includes(parsed.protocol)) fail(`${label} scheme must be one of http, https, socks5, socks4 (got ${parsed.protocol.replace(":", "")})`);
			if (parsed.username || parsed.password) fail(`${label} must not contain credentials; proxy accounts are not supported`);
			if (!parsed.hostname) fail(`${label} "${raw}" has no host`);
			if (parsed.pathname !== "/" && parsed.pathname !== "" || parsed.search || parsed.hash) fail(`${label} must be only scheme://host:port, without a path or query`);
			return `${parsed.protocol}//${parsed.host}`;
		}
		function checkProxyBypass(value, label, fail) {
			if (typeof value !== "string" || !value.trim() || value.length > 1e3 || CONTROL.test(value)) fail(`${label} must be a comma-separated host list of up to 1000 characters, such as example.com,.internal.test`);
			return value.split(",").map((part) => part.trim()).filter(Boolean).join(",");
		}
		const ABSOLUTE_PATH = /^(\/|[A-Za-z]:[\\/]|\\\\)/;
		/** A directory setting must be an absolute path (POSIX, drive letter, or UNC); a relative one would depend on the host's working directory. */
		function checkAbsoluteDirectory(value, label, fail) {
			if (typeof value !== "string" || !value.trim() || value.length > 1e3 || CONTROL.test(value)) fail(`${label} must be an absolute directory path of up to 1000 characters`);
			const text = value.trim();
			if (!ABSOLUTE_PATH.test(text)) fail(`${label} must be an absolute directory path (got a relative one: ${text.slice(0, 60)})`);
			return text;
		}
		//#endregion
		//#region src/client/field-rules.ts
		/**
		* Inline validation of the settings card's context and download fields.
		*
		* These are the SAME rule functions the server runs when it reads the configuration (`../config-rules.ts` has no
		* imports, so the card bundle carries it unchanged): a value the card accepts is a value the plugin will use, and a
		* value it refuses is one the plugin would have dropped with a runtimeWarning. Blank always means "use the default".
		* @module dsh-browser/client/field-rules
		*/
		var Refused = class extends Error {};
		const fail = (message) => {
			throw new Refused(message);
		};
		const RULES = {
			userAgent: (text) => checkUserAgent(text, "userAgent", fail),
			locale: (text) => checkLocale(text, "locale", fail),
			timezoneId: (text) => checkTimezone(text, "timezoneId", fail),
			proxyServer: (text) => checkProxyServer(text, "proxyServer", fail),
			proxyBypass: (text) => checkProxyBypass(text, "proxyBypass", fail),
			downloadDir: (text) => checkAbsoluteDirectory(text, "downloadDir", fail)
		};
		/** Whole-number fields and their inclusive ranges (the server enforces the same ones). */
		const NUMBER_RANGES = {
			viewportWidth: [VIEWPORT_LIMITS.minWidth, VIEWPORT_LIMITS.maxWidth],
			viewportHeight: [VIEWPORT_LIMITS.minHeight, VIEWPORT_LIMITS.maxHeight],
			downloadMaxBytes: [1, MAX_DOWNLOAD_BYTES_LIMIT]
		};
		[...Object.keys(RULES), ...Object.keys(NUMBER_RANGES)];
		/** Why one field's text is refused, or undefined when it is fine (or blank). */
		function fieldProblem(field, text) {
			if (text.trim() === "") return void 0;
			const range = NUMBER_RANGES[field];
			if (range) {
				const value = Number(text);
				return Number.isInteger(value) && value >= range[0] && value <= range[1] ? void 0 : `${field} must be a whole number from ${range[0]} to ${range[1]}`;
			}
			const rule = RULES[field];
			if (!rule) return void 0;
			try {
				rule(text);
			} catch (error) {
				if (error instanceof Refused) return error.message;
				throw error;
			}
		}
		/**
		* Problems that involve more than one field. `custom` needs both sizes; the sizes themselves are checked by the
		* numeric field's own range.
		*/
		function crossFieldProblems(texts) {
			const problems = {};
			if ((texts.viewportMode ?? "").trim() === "custom") {
				const need = (field, range) => {
					if ((texts[field] ?? "").trim() === "") problems[field] = `viewportMode=custom needs ${field} (${range}); without it the browser's default window is used`;
				};
				need("viewportWidth", `${VIEWPORT_LIMITS.minWidth}-${VIEWPORT_LIMITS.maxWidth}`);
				need("viewportHeight", `${VIEWPORT_LIMITS.minHeight}-${VIEWPORT_LIMITS.maxHeight}`);
			}
			return problems;
		}
		//#endregion
		//#region src/client/property-docs.ts
		const EN = {
			header: [
				"Default parameters: what every new browser context starts from. An agent copies these for a task and changes only what the task needs.",
				"`key = value` overrides the default. A line starting with # is a comment and is ignored when you save; the comment above each key explains it.",
				"A commented `# key = value` line shows the value in force now. Delete or comment a line to go back to the default."
			],
			group: {
				runtime: "Browser runtime",
				context: "Page environment (window, language, egress)",
				files: "Login state, files and limits"
			},
			key: {
				browserRuntime: "Driver: playwright | patchright (Chromium only, better against bot checks). Default: playwright",
				channel: "Browser: chromium (Playwright Chromium; the installed Chrome / Edge is used when it is missing) | chrome | msedge (always that installed browser). Patchright works best with chrome. Default: chromium",
				headless: "true = no browser window | false = show it. Default: true",
				autoInstall: "true = download Playwright Chromium when it is missing (about 150 MB; the system Chrome is then not used instead) | false. Keep false: an installed Chrome / Edge is used directly, else use the runtime.install action. Default: false",
				executablePath: "Absolute path of a custom browser; empty = Playwright Chromium, or the system Chrome / Edge when it is missing. Default: empty",
				cdpPort: "Local remote-debugging (CDP) port, 1-65535; empty = off. Risk: other programs on this machine can then control the browser. Default: empty",
				maxSessions: "Sessions that may hold a page at once, 1-64; past it the least recently used one is closed. Default: 8",
				args: "Extra Chromium launch arguments as one JSON array line, e.g. [\"--disable-gpu\"]. Add only arguments you understand. Default: [] (none)",
				viewportMode: "Viewport: window = browser default | 720p (1280x720) | 1080p (1920x1080) | custom (needs width and height). Default: window",
				viewportWidth: "Custom viewport width in pixels, 200-7680; used only with viewportMode = custom. Default: empty",
				viewportHeight: "Custom viewport height in pixels, 200-4320; used only with viewportMode = custom. Default: empty",
				userAgent: "User-Agent header, up to 512 characters. Risk: changes the browser fingerprint sites see. Empty = the browser's own. Default: empty",
				locale: "Language tag (BCP 47) such as en-US or zh-CN; empty = the browser's own. Default: empty",
				timezoneId: "IANA time zone such as Asia/Shanghai; empty = this machine's. Default: empty",
				proxyServer: "Proxy such as http://127.0.0.1:7890 or socks5://127.0.0.1:1080. No accounts or passwords: never put credentials here. Empty = direct. Default: empty",
				proxyBypass: "Hosts that skip the proxy, comma-separated, e.g. example.com,.internal.test; needs proxyServer. Default: empty",
				storageStatePath: "Global login-state file (legacy: applies to every site, no domain limit). Use login profiles instead. Default: empty",
				defaultAuthProfile: "Name of the login profile used when none is named; it must exist. crawl is always anonymous. Default: empty",
				allowPrivateHosts: "true = an agent policy action may allow localhost and LAN addresses in a login profile | false. Risk: widens what an agent can authorize. Default: false",
				snapshotDir: "Absolute directory for screenshots; empty = $DSH_HOME/data/browser/snapshots. Default: empty",
				downloadDir: "Absolute directory downloads are saved to; empty = $DSH_HOME/data/browser/downloads. Default: empty",
				downloadMaxBytes: "Largest single download in bytes, 1 to 10737418240 (10 GiB); a bigger one is stopped and removed. Default: 104857600 (100 MiB)",
				verbose: "true = print startup and diagnostic details | false. Default: false"
			}
		};
		const ZH = {
			header: [
				"默认参数：每个新 browser context 的起点；agent 按任务复制它们，只改任务需要改的部分。",
				"`key = value` 表示覆盖默认值；以 # 开头的行是注释，保存时忽略；每个键上面的注释说明它的用途。",
				"被注释的 `# key = 值` 行显示当前生效的值；删掉或注释一行即恢复默认。"
			],
			group: {
				runtime: "浏览器运行时",
				context: "页面环境（窗口、语言、出口）",
				files: "登录态、文件与限额"
			},
			key: {
				browserRuntime: "驱动：playwright | patchright（仅 Chromium，对反爬检测更友好）。默认 playwright",
				channel: "浏览器：chromium（Playwright 的 Chromium，缺失时自动改用本机 Chrome / Edge）| chrome | msedge（固定用本机已装的那个）。Patchright 推荐 chrome。默认 chromium",
				headless: "true = 不显示浏览器窗口 | false = 显示。默认 true",
				autoInstall: "true = 缺失时自动下载 Playwright Chromium（约 150 MB，且不再改用系统 Chrome）| false。建议保持 false：装了 Chrome / Edge 就直接用，没有再用 runtime.install 动作。默认 false",
				executablePath: "自定义浏览器的绝对路径；留空 = Playwright Chromium，缺失时用系统 Chrome / Edge。默认 空",
				cdpPort: "本机远程调试（CDP）端口，1–65535；留空 = 关闭。风险：同机其它程序可借此控制浏览器。默认 空",
				maxSessions: "同时持有页面的会话数，1–64；超出时关闭最久未使用的。默认 8",
				args: "追加的 Chromium 启动参数，写成一行 JSON 数组，如 [\"--disable-gpu\"]；只加你理解的参数。默认 []（无）",
				viewportMode: "视口：window = 浏览器默认 | 720p（1280x720）| 1080p（1920x1080）| custom（需同时填宽高）。默认 window",
				viewportWidth: "自定义视口宽度（像素），200–7680；仅 viewportMode = custom 时生效。默认 空",
				viewportHeight: "自定义视口高度（像素），200–4320；仅 viewportMode = custom 时生效。默认 空",
				userAgent: "User-Agent 头，至多 512 字符。风险：会改变站点看到的浏览器指纹；留空 = 浏览器自带。默认 空",
				locale: "语言标签（BCP 47），如 en-US、zh-CN；留空 = 浏览器自带。默认 空",
				timezoneId: "IANA 时区，如 Asia/Shanghai；留空 = 本机时区。默认 空",
				proxyServer: "代理，如 http://127.0.0.1:7890 或 socks5://127.0.0.1:1080。不支持账号密码，切勿把凭据写在这里；留空 = 直连。默认 空",
				proxyBypass: "不走代理的主机，逗号分隔，如 example.com,.internal.test；需先设 proxyServer。默认 空",
				storageStatePath: "全局登录态文件（旧版入口：对所有站点生效，没有域名限制）；请改用登录 profile。默认 空",
				defaultAuthProfile: "未指定时使用的登录 profile 名，必须已存在；crawl 始终匿名。默认 空",
				allowPrivateHosts: "true = agent 的策略动作可把 localhost 与内网地址加入登录 profile | false。风险：扩大 agent 可授权的范围。默认 false",
				snapshotDir: "截图目录的绝对路径；留空 = $DSH_HOME/data/browser/snapshots。默认 空",
				downloadDir: "下载目录的绝对路径；留空 = $DSH_HOME/data/browser/downloads。默认 空",
				downloadMaxBytes: "单个下载的字节上限，1 到 10737418240（10 GiB）；超出会中止并删除。默认 104857600（100 MiB）",
				verbose: "true = 输出启动与诊断信息 | false。默认 false"
			}
		};
		/** The docs of a language; anything but `zh` is English. */
		function propertyDocs(lang = "en") {
			return lang === "zh" ? ZH : EN;
		}
		//#endregion
		//#region src/client/properties-form.ts
		/**
		* The "default parameters" editor of the settings card: every plugin-wide default as one `key = value` text.
		*
		* Process-wide and per-context defaults (browser runtime, window size, user agent, locale, proxy, directories, limits)
		* are one thing, "what each new context starts from"; an agent copies them for a task and changes only what that task
		* needs. So they are edited as one properties text instead of a field-by-field form:
		*
		*     # -- Browser context --
		*     viewportMode = custom
		*     viewportWidth = 1280
		*     # userAgent =
		*
		* A line `key = value` overrides the default; a `#` line is a comment and shows the value in force (the deployed
		* value, or the plugin's default); a key that is commented out or has no value is not overridden. The value is
		* everything after the FIRST `=`, trimmed, with one pair of surrounding double quotes removed; there are no inline
		* comments, so `#` inside a value is literal. Arrays are one JSON line. The saved configuration keeps the same flat
		* keys the old form wrote: this module only parses and prints text, nothing here writes settings.
		*
		* Pure (no DOM, no host); validation is the server's own rule set (`../config-rules.ts` through `field-rules.ts`).
		* @module dsh-browser/client/properties-form
		*/
		const PROPERTY_GROUPS = [
			{
				id: "runtime",
				title: "Browser runtime"
			},
			{
				id: "context",
				title: "Browser context (window, language, egress)"
			},
			{
				id: "files",
				title: "Login state, files and limits"
			}
		];
		/** The default-value fields, in display order. Switches and policies (enabled, automationMode, ...) stay controls. */
		const PROPERTY_FIELDS = [
			{
				key: "browserRuntime",
				kind: "enum",
				options: ["playwright", "patchright"],
				defaultText: "playwright",
				group: "runtime"
			},
			{
				key: "channel",
				kind: "string",
				defaultText: "chromium",
				group: "runtime"
			},
			{
				key: "headless",
				kind: "boolean",
				defaultText: "true",
				group: "runtime"
			},
			{
				key: "autoInstall",
				kind: "boolean",
				defaultText: "false",
				group: "runtime"
			},
			{
				key: "executablePath",
				kind: "string",
				group: "runtime"
			},
			{
				key: "cdpPort",
				kind: "integer",
				range: [1, 65535],
				group: "runtime"
			},
			{
				key: "maxSessions",
				kind: "integer",
				range: [1, 64],
				defaultText: "8",
				group: "runtime"
			},
			{
				key: "args",
				kind: "strings",
				defaultText: "[]",
				group: "runtime"
			},
			{
				key: "viewportMode",
				kind: "enum",
				options: [
					"window",
					"720p",
					"1080p",
					"custom"
				],
				defaultText: "window",
				group: "context"
			},
			{
				key: "viewportWidth",
				kind: "integer",
				range: [200, 7680],
				group: "context"
			},
			{
				key: "viewportHeight",
				kind: "integer",
				range: [200, 4320],
				group: "context"
			},
			{
				key: "userAgent",
				kind: "string",
				group: "context"
			},
			{
				key: "locale",
				kind: "string",
				group: "context"
			},
			{
				key: "timezoneId",
				kind: "string",
				group: "context"
			},
			{
				key: "proxyServer",
				kind: "string",
				group: "context"
			},
			{
				key: "proxyBypass",
				kind: "string",
				group: "context"
			},
			{
				key: "storageStatePath",
				kind: "string",
				group: "files"
			},
			{
				key: "defaultAuthProfile",
				kind: "string",
				group: "files"
			},
			{
				key: "allowPrivateHosts",
				kind: "boolean",
				defaultText: "false",
				group: "files"
			},
			{
				key: "snapshotDir",
				kind: "string",
				group: "files"
			},
			{
				key: "downloadDir",
				kind: "string",
				group: "files"
			},
			{
				key: "downloadMaxBytes",
				kind: "integer",
				range: [1, MAX_DOWNLOAD_BYTES_LIMIT],
				defaultText: "104857600",
				group: "files"
			},
			{
				key: "verbose",
				kind: "boolean",
				defaultText: "false",
				group: "files"
			}
		];
		const PROPERTY_KEYS = new Set(PROPERTY_FIELDS.map((field) => field.key));
		/** Settings that exist but are edited elsewhere in the card; a line naming one is warned about, not applied. */
		const ELSEWHERE_KEYS = {
			enabled: "the \"automation freedom\" controls",
			automationMode: "the \"automation freedom\" controls",
			toolSurface: "the \"automation freedom\" controls",
			opencliEnabled: "the \"automation freedom\" controls",
			usagePolicy: "the usage buffer JSON box",
			automationAssets: "the automation asset policy JSON box",
			prompts: "the prompt text section",
			authProfiles: "the login profiles list",
			rulePacks: "the configuration file (hash-pinned rule packs)"
		};
		/** The value text of a line's right-hand side: trimmed, one pair of surrounding double quotes removed. */
		function unquote(raw) {
			const trimmed = raw.trim();
			return trimmed.length >= 2 && trimmed.startsWith("\"") && trimmed.endsWith("\"") ? trimmed.slice(1, -1) : trimmed;
		}
		/** A value as it is written after `=`: quoted only when it would not survive a round trip bare. */
		function quoteValue(value) {
			return value !== value.trim() || value.length >= 2 && value.startsWith("\"") && value.endsWith("\"") ? `"${value}"` : value;
		}
		/** Split the text into key/value lines. Syntax problems and unknown keys become issues; values are not judged here. */
		function parseProperties(text) {
			const values = /* @__PURE__ */ new Map();
			const issues = [];
			text.split(/\r?\n/).forEach((raw, index) => {
				const line = index + 1;
				const trimmed = raw.trim();
				if (trimmed === "" || trimmed.startsWith("#")) return;
				const eq = trimmed.indexOf("=");
				if (eq <= 0) {
					issues.push({
						line,
						level: "error",
						message: `line ${line}: expected "key = value" (a line that starts with # is a comment)`
					});
					return;
				}
				const key = trimmed.slice(0, eq).trim();
				const value = unquote(trimmed.slice(eq + 1));
				if (!/^[A-Za-z][A-Za-z0-9]*$/.test(key)) {
					issues.push({
						line,
						key,
						level: "error",
						message: `line ${line}: "${key.slice(0, 40)}" is not a setting name`
					});
					return;
				}
				if (!PROPERTY_KEYS.has(key)) {
					const where = ELSEWHERE_KEYS[key];
					issues.push({
						line,
						key,
						level: "warning",
						message: where ? `line ${line}: ${key} is not a default parameter; it is edited in ${where}, so this line is ignored` : `line ${line}: unknown setting "${key}" is ignored`
					});
					return;
				}
				const previous = values.get(key);
				if (previous) issues.push({
					line,
					key,
					level: "warning",
					message: `line ${line}: ${key} is already set on line ${previous.line}; this later line is the one used`
				});
				if (value === "") {
					values.delete(key);
					return;
				}
				values.set(key, {
					value,
					line
				});
			});
			return {
				values,
				issues
			};
		}
		/** Why one property value is refused (the same rules the server and the old form applied), or undefined. */
		function validateProperty(field, value) {
			switch (field.kind) {
				case "boolean": return value === "true" || value === "false" ? void 0 : `${field.key} must be true or false`;
				case "enum": return field.options.includes(value) ? void 0 : `${field.key} must be one of: ${field.options.join(", ")}`;
				case "integer": {
					const number = Number(value);
					return Number.isInteger(number) && number >= field.range[0] && number <= field.range[1] ? void 0 : `${field.key} must be a whole number from ${field.range[0]} to ${field.range[1]}`;
				}
				case "strings":
					try {
						const parsed = JSON.parse(value);
						if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((entry) => typeof entry === "string" && entry.length > 0)) return void 0;
					} catch {}
					return `${field.key} must be a JSON array of non-empty strings, for example ["--disable-gpu"]`;
				case "string": return fieldProblem(field.key, value);
			}
		}
		/**
		* Check a parsed text: each value against its rule, then the rules that involve several keys (a custom viewport needs
		* both sizes). `effective` supplies the text in force for a key the text does not set, so a size that comes from the
		* deployed configuration still counts.
		*/
		function checkProperties(parsed, effective) {
			const issues = [...parsed.issues];
			for (const field of PROPERTY_FIELDS) {
				const entry = parsed.values.get(field.key);
				if (!entry) continue;
				const problem = validateProperty(field, entry.value);
				if (problem) issues.push({
					line: entry.line,
					key: field.key,
					level: "error",
					message: `line ${entry.line}: ${problem}`
				});
			}
			const texts = {};
			for (const key of [
				"viewportMode",
				"viewportWidth",
				"viewportHeight"
			]) texts[key] = parsed.values.get(key)?.value ?? effective(key);
			const cross = crossFieldProblems(texts);
			for (const [key, message] of Object.entries(cross)) {
				const line = parsed.values.get(key)?.line ?? parsed.values.get("viewportMode")?.line;
				issues.push({
					line: line ?? 0,
					key,
					level: "error",
					message: `${line ? `line ${line}: ` : ""}${message}`
				});
			}
			return issues.sort((a, b) => a.line - b.line);
		}
		/**
		* Print the editor text. Every key has a comment line in front of it (what it is for, its values, its default, the
		* risk), then either `key = value` (overridden) or `# key = value-in-force`; groups are under a comment header. Comments
		* are lines starting with `#`, which {@link parseProperties} ignores, so printing and parsing again keeps every key.
		*/
		function serializeProperties(views, docs = propertyDocs("en")) {
			const byKey = new Map(views.map((view) => [view.key, view]));
			const out = [...docs.header.map((line) => `# ${line}`), ""];
			for (const group of PROPERTY_GROUPS) {
				out.push(`# -- ${docs.group[group.id] ?? group.title} --`);
				for (const field of PROPERTY_FIELDS.filter((entry) => entry.group === group.id)) {
					const view = byKey.get(field.key);
					const text = view?.text ?? field.defaultText ?? "";
					const doc = docs.key[field.key];
					if (doc) out.push(`# ${doc}`);
					out.push(view?.overridden ? `${field.key} = ${quoteValue(text)}` : `# ${field.key} =${text === "" ? "" : " " + text}`);
				}
				out.push("");
			}
			return out.join("\n").replace(/\n+$/, "\n");
		}
		/** `text` with the lines that set `key` turned into a comment showing `shown` (the deployed value or default). */
		function commentOutProperty(text, key, shown) {
			return text.split("\n").map((raw) => {
				const trimmed = raw.trim();
				if (trimmed === "" || trimmed.startsWith("#")) return raw;
				const eq = trimmed.indexOf("=");
				return eq > 0 && trimmed.slice(0, eq).trim() === key ? `# ${key} =${shown === "" ? "" : " " + shown}` : raw;
			}).join("\n");
		}
		//#endregion
		//#region src/client/policy-fields.ts
		/**
		* The keys of the two policy objects as controls: which kind each is, its unit, its range and its default, and how a
		* typed text becomes a value. Pure, and built on `../policy-keys.ts` (the one place the ranges and defaults live).
		* @module dsh-browser/client/policy-fields
		*/
		const usage = (key, unit) => ({
			key,
			kind: "int",
			unit
		});
		const POLICY_SPECS = {
			usagePolicy: [
				usage("minDelayMs", "ms"),
				usage("maxConcurrency", "count"),
				usage("burst", "count"),
				usage("maxPagesPerRun", "count"),
				usage("maxDepth", "count"),
				usage("retryLimit", "count"),
				usage("backoffBaseMs", "ms"),
				usage("cooldownMs", "ms")
			],
			automationAssets: [
				{
					key: "persistenceMode",
					kind: "enum",
					options: ASSET_POLICY_ENUMS.persistenceMode,
					section: "candidates"
				},
				{
					key: "minSuccessfulRuns",
					kind: "int",
					unit: "count",
					section: "candidates"
				},
				{
					key: "minDistinctSessions",
					kind: "int",
					unit: "count",
					section: "candidates"
				},
				{
					key: "successWindowDays",
					kind: "int",
					unit: "days",
					section: "candidates"
				},
				{
					key: "minSuccessRate",
					kind: "float",
					unit: "ratio",
					section: "candidates"
				},
				{
					key: "maxCandidates",
					kind: "int",
					unit: "count",
					section: "candidates"
				},
				{
					key: "candidateTtlDays",
					kind: "int",
					unit: "days",
					section: "candidates"
				},
				{
					key: "maxSuggestionsPerDay",
					kind: "int",
					unit: "count",
					section: "candidates"
				},
				{
					key: "enabled",
					kind: "bool",
					section: "library"
				},
				{
					key: "directory",
					kind: "text",
					section: "library"
				},
				{
					key: "maxDrafts",
					kind: "int",
					unit: "count",
					section: "library"
				},
				{
					key: "maxActiveAssets",
					kind: "int",
					unit: "count",
					section: "library"
				},
				{
					key: "retrievalTopK",
					kind: "int",
					unit: "count",
					section: "library"
				},
				{
					key: "catalogTokenBudget",
					kind: "int",
					unit: "tokens",
					section: "library"
				},
				{
					key: "activationMode",
					kind: "enum",
					options: ASSET_POLICY_ENUMS.activationMode,
					section: "activation"
				},
				{
					key: "modelDevelopmentEnabled",
					kind: "bool",
					section: "activation"
				},
				{
					key: "maxModelDraftWritesPerSession",
					kind: "int",
					unit: "count",
					section: "activation"
				},
				{
					key: "maxTestCredentials",
					kind: "int",
					unit: "count",
					section: "activation"
				},
				{
					key: "minInputSetsForActivation",
					kind: "int",
					unit: "count",
					section: "activation"
				}
			]
		};
		/** The default of a key; undefined when it has none (the assets directory). */
		function defaultOf(field, key) {
			return (field === "usagePolicy" ? USAGE_POLICY_DEFAULTS : ASSET_POLICY_DEFAULTS)[key];
		}
		/** The inclusive range of a numeric key. */
		function boundsOf(field, key) {
			return field === "usagePolicy" ? USAGE_POLICY_BOUNDS[key] : ASSET_POLICY_BOUNDS[key];
		}
		/** A value as the text a control shows. */
		function valueText(value) {
			return value === void 0 || value === null ? "" : String(value);
		}
		/** What a typed text means for one key; an empty text means "the default" (no value). */
		function parsePolicyText(field, spec, text) {
			const trimmed = text.trim();
			if (trimmed === "") return {
				ok: true,
				value: void 0
			};
			switch (spec.kind) {
				case "bool": return trimmed === "true" || trimmed === "false" ? {
					ok: true,
					value: trimmed === "true"
				} : {
					ok: false,
					problem: "invalidChoice"
				};
				case "enum": return spec.options?.includes(trimmed) ? {
					ok: true,
					value: trimmed
				} : {
					ok: false,
					problem: "invalidChoice"
				};
				case "text": return {
					ok: true,
					value: trimmed
				};
				case "int":
				case "float": {
					const value = Number(trimmed);
					if (!Number.isFinite(value) || spec.kind === "int" && !Number.isInteger(value)) return {
						ok: false,
						problem: "invalidNumber"
					};
					const range = boundsOf(field, spec.key);
					return !range || value >= range[0] && value <= range[1] ? {
						ok: true,
						value
					} : {
						ok: false,
						problem: "invalidRange"
					};
				}
			}
		}
		//#endregion
		//#region src/client/auth-profiles-form.ts
		/**
		* Pure helpers of the login-profile list and its dialog: reading the staged `authProfiles` JSON, the rules for a new
		* profile's name and for a domain, and the path a new profile gets. Nothing here touches the Host or the DOM.
		* @module dsh-browser/client/auth-profiles-form
		*/
		const isRecord$1 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
		/** The profiles in a staged `authProfiles` text; entries that are not profiles are left out, and unparsable text is no profiles. */
		function parseProfiles(text) {
			if (text.trim() === "") return {};
			let root;
			try {
				root = JSON.parse(text);
			} catch {
				return {};
			}
			if (!isRecord$1(root)) return {};
			const out = {};
			for (const [id, entry] of Object.entries(root)) {
				if (!isRecord$1(entry)) continue;
				out[id] = {
					storageStatePath: typeof entry.storageStatePath === "string" ? entry.storageStatePath : "",
					allowedDomains: Array.isArray(entry.allowedDomains) ? entry.allowedDomains.filter((domain) => typeof domain === "string") : [],
					persistState: entry.persistState === true
				};
			}
			return out;
		}
		/** Whether a value is a map of well-formed profiles: what a save may write for `authProfiles`. */
		function validAuthProfiles(value) {
			return Object.entries(value).every(([id, entry]) => id !== "" && isRecord$1(entry) && typeof entry.storageStatePath === "string" && entry.storageStatePath.trim() !== "" && (entry.allowedDomains === void 0 || Array.isArray(entry.allowedDomains) && entry.allowedDomains.every((domain) => typeof domain === "string" && domain.trim() !== "")) && (entry.persistState === void 0 || typeof entry.persistState === "boolean"));
		}
		/** Why a name is refused for a NEW profile: not a usable name, or taken. */
		function idProblem(id, existing) {
			if (!AUTH_PROFILE_ID.test(id) || id in Object.prototype) return "authIdInvalid";
			return existing.includes(id) ? "authIdExists" : void 0;
		}
		/** Why a domain entry is refused: a host name only, optionally with a leading `*.`; no scheme, path, port or whitespace. */
		function domainProblem(domain) {
			const text = domain.trim();
			if (text === "" || text.length > 253 || /[\s/\\:@?#]/.test(text)) return "authDomainInvalid";
			const host = text.replace(/^\*\./, "");
			return /^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)*$/.test(host) ? void 0 : "authDomainInvalid";
		}
		/** Whether a name is one the policy overlay refuses for agents unless private hosts are allowed (a note for the person; their own config may list it). */
		function isPrivateName(domain) {
			const host = domain.trim().toLowerCase().replace(/^\*\./, "");
			return host === "localhost" || /(^|\.)(local|internal|lan|home\.arpa|intranet|corp|localdomain|private|home|localhost)$/.test(host) || /^(\d{1,3}\.){3}\d{1,3}$/.test(host);
		}
		/** The state-file path a new profile gets: `<login-state directory>/<name>.json`, with the directory's own separator. */
		function profilePathFor(authDir, id) {
			const separator = authDir.includes("\\") && !authDir.includes("/") ? "\\" : "/";
			return `${authDir.replace(/[\\/]+$/, "")}${separator}${id}.json`;
		}
		/** Length caps (in characters) of each kind of override. A longer value is ignored, not truncated. */
		const PROMPT_LIMITS = {
			/** A group or action summary: one line of the catalog. */
			summary: 300,
			/** The extra guidance of an action or sub-action. */
			notes: 1e3,
			/** The text of a detail topic (`observe.read.controls`), which is a page of its own. */
			topicText: 3500,
			/** A tool description (`prompts.tools.<tool>.description`). */
			description: 1500,
			/** The compact guide that replaces the skill pointer at the root. */
			rootGuide: 1500,
			/** The deployer's note at the end of the root. */
			rootNote: 800,
			/** The hint of one error code. */
			errorHint: 600,
			/** The skill's description in the skill list. */
			skillDescription: 1e3,
			/** Text appended to the skill body. */
			skillAppend: 4e3,
			/** A `skill.bodyFile` larger than this falls back to the packaged body. */
			skillBodyFile: 2e4
		};
		//#endregion
		//#region src/client/prompts-form.ts
		/**
		* Pure helpers for the "prompt text" section of the settings card.
		*
		* The whole `prompts` configuration is one staged JSON field (the host writes top-level fields); the card's separate
		* controls (tool descriptions, root guide and note, the skill) and the JSON box for groups, actions and error hints
		* are two views of that one draft. Nothing here touches the host or the DOM.
		* @module dsh-browser/client/prompts-form
		*/
		/** The single-line and multi-line text controls of the section, by id, with the path each edits and its length cap. */
		const PROMPT_TEXT_FIELDS = [
			{
				id: "indexDescription",
				path: [
					"tools",
					"browser_index",
					"description"
				],
				limit: PROMPT_LIMITS.description,
				multiline: true
			},
			{
				id: "callDescription",
				path: [
					"tools",
					"browser_call",
					"description"
				],
				limit: PROMPT_LIMITS.description,
				multiline: true
			},
			{
				id: "rootGuide",
				path: ["rootGuide"],
				limit: PROMPT_LIMITS.rootGuide,
				multiline: true
			},
			{
				id: "rootNote",
				path: ["rootNote"],
				limit: PROMPT_LIMITS.rootNote,
				multiline: true
			},
			{
				id: "skillDescription",
				path: ["skill", "description"],
				limit: PROMPT_LIMITS.skillDescription,
				multiline: false
			},
			{
				id: "skillBodyFile",
				path: ["skill", "bodyFile"],
				limit: 1024,
				multiline: false
			},
			{
				id: "skillAppend",
				path: ["skill", "append"],
				limit: PROMPT_LIMITS.skillAppend,
				multiline: true
			}
		];
		/** Read the default export's JSON into {@link PromptDefaults}; undefined when it is not the expected shape. */
		function defaultsFromJson(json) {
			let root;
			try {
				root = JSON.parse(json);
			} catch {
				return;
			}
			if (!isRecord(root)) return void 0;
			const texts = {};
			for (const field of PROMPT_TEXT_FIELDS) {
				const value = getAt(root, field.path);
				if (typeof value === "string" && value !== "") texts[field.id] = value;
			}
			const extras = {};
			for (const key of PROMPT_EXTRA_KEYS) if (isRecord(root[key])) extras[key] = root[key];
			return {
				texts,
				extras
			};
		}
		/**
		* `extras` without the entries that equal the plugin's default: copying the whole default into the box and changing
		* one line must save one override, not freeze every other text at today's wording.
		*/
		function pruneDefaultExtras(extras, defaults) {
			const out = {};
			for (const key of PROMPT_EXTRA_KEYS) {
				const given = extras[key];
				if (!isRecord(given)) continue;
				const base = isRecord(defaults[key]) ? defaults[key] : {};
				const kept = {};
				for (const [name, entry] of Object.entries(given)) {
					const baseEntry = base[name];
					if (typeof entry === "string") {
						if (entry !== baseEntry) kept[name] = entry;
						continue;
					}
					if (!isRecord(entry)) {
						kept[name] = entry;
						continue;
					}
					const baseFields = isRecord(baseEntry) ? baseEntry : {};
					const changed = Object.fromEntries(Object.entries(entry).filter(([field, text]) => text !== (baseFields[field] ?? "")));
					if (Object.keys(changed).length) kept[name] = changed;
				}
				if (Object.keys(kept).length) out[key] = kept;
			}
			return out;
		}
		/** The overridden entries of a `prompts` draft, in the order groups, actions, errorHints. */
		function extraEntries(draft) {
			const out = [];
			for (const kind of PROMPT_EXTRA_KEYS) {
				const group = draft[kind];
				if (!isRecord(group)) continue;
				for (const [key, value] of Object.entries(group)) if (typeof value === "string") out.push({
					kind,
					key,
					text: value
				});
				else if (isRecord(value)) out.push({
					kind,
					key,
					...typeof value.summary === "string" ? { summary: value.summary } : {},
					...typeof value.notes === "string" ? { notes: value.notes } : {}
				});
			}
			return out;
		}
		/** `draft` with one entry set (or removed when `value` is undefined or empty); parents left empty go with it. */
		function withExtraEntry(draft, kind, key, value) {
			const copy = structuredClone(draft);
			const group = isRecord(copy[kind]) ? copy[kind] : {};
			if (value === void 0 || (typeof value === "string" ? value === "" : !value.summary && !value.notes)) delete group[key];
			else group[key] = typeof value === "string" ? value : Object.fromEntries(Object.entries(value).filter(([, text]) => typeof text === "string" && text !== ""));
			if (Object.keys(group).length) copy[kind] = group;
			else delete copy[kind];
			return copy;
		}
		/** The members the JSON box edits; the other controls own the rest. */
		const PROMPT_EXTRA_KEYS = [
			"groups",
			"actions",
			"errorHints"
		];
		const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
		function getAt(root, path) {
			let node = root;
			for (const key of path) {
				if (!isRecord(node)) return void 0;
				node = node[key];
			}
			return node;
		}
		/** A copy of `root` with `path` set to `value`; an empty or absent value removes it, and parents left empty go with it. */
		function setAt(root, path, value) {
			const copy = structuredClone(root);
			const trail = [copy];
			let node = copy;
			for (const key of path.slice(0, -1)) {
				const next = node[key];
				node = isRecord(next) ? next : node[key] = {};
				trail.push(node);
			}
			const last = path[path.length - 1];
			if (value === void 0 || value === "") delete node[last];
			else node[last] = value;
			for (let depth = path.length - 1; depth > 0; depth--) {
				const parent = trail[depth - 1];
				if (Object.keys(trail[depth]).length === 0) delete parent[path[depth - 1]];
			}
			return copy;
		}
		const stringMap = (value, limit, inner) => isRecord(value) && Object.values(value).every((entry) => {
			if (inner) return isRecord(entry) && Object.entries(entry).every(([key, text]) => inner.includes(key) && typeof text === "string" && text.length <= limit);
			return typeof entry === "string" && entry.length <= limit;
		});
		/** The groups/actions/errorHints box: groups and actions are objects of `{summary, notes}`, errorHints a code-to-text map. */
		function validExtras(value) {
			if (Object.keys(value).some((key) => !PROMPT_EXTRA_KEYS.includes(key))) return false;
			const { groups, actions, errorHints } = value;
			if (groups !== void 0 && !stringMap(groups, PROMPT_LIMITS.summary, ["summary"])) return false;
			if (actions !== void 0 && !(isRecord(actions) && Object.values(actions).every((entry) => isRecord(entry) && Object.entries(entry).every(([key, text]) => (key === "summary" || key === "notes") && typeof text === "string" && text.length <= (key === "summary" ? PROMPT_LIMITS.summary : PROMPT_LIMITS.topicText))))) return false;
			if (errorHints !== void 0 && !stringMap(errorHints, PROMPT_LIMITS.errorHint)) return false;
			return true;
		}
		/**
		* Whether a whole `prompts` value is acceptable to save: known top-level keys, strings within their caps, a boolean
		* `skill.enabled`. Group names, action names and error codes are the plugin's to judge (it reports unknown ones as
		* diagnostics), so they are not checked here.
		*/
		function validPrompts(value) {
			const known = [
				"tools",
				"rootGuide",
				"rootNote",
				"groups",
				"actions",
				"errorHints",
				"skill"
			];
			if (Object.keys(value).some((key) => !known.includes(key))) return false;
			for (const field of PROMPT_TEXT_FIELDS) {
				const entry = getAt(value, field.path);
				if (entry !== void 0 && (typeof entry !== "string" || entry.length > field.limit)) return false;
			}
			const tools = value.tools;
			if (tools !== void 0 && !(isRecord(tools) && Object.keys(tools).every((key) => key === "browser_index" || key === "browser_call"))) return false;
			const skill = value.skill;
			if (skill !== void 0) {
				if (!isRecord(skill) || Object.keys(skill).some((key) => ![
					"enabled",
					"description",
					"bodyFile",
					"append"
				].includes(key))) return false;
				if (skill.enabled !== void 0 && typeof skill.enabled !== "boolean") return false;
			}
			return validExtras(Object.fromEntries(PROMPT_EXTRA_KEYS.filter((key) => value[key] !== void 0).map((key) => [key, value[key]])));
		}
		/** The JSON box's content for a `prompts` value: its groups, actions and errorHints, or empty when it has none. */
		function extrasText(value) {
			value = canonicalPrompts(value);
			const extras = Object.fromEntries(PROMPT_EXTRA_KEYS.filter((key) => value[key] !== void 0).map((key) => [key, value[key]]));
			return Object.keys(extras).length ? JSON.stringify(extras, null, 2) : "";
		}
		/** A copy of a `prompts` value with groups, actions and errorHints replaced by `extras` (absent members removed). */
		function withExtras(value, extras) {
			const copy = Object.fromEntries(Object.entries(value).filter(([key]) => !PROMPT_EXTRA_KEYS.includes(key)));
			for (const key of PROMPT_EXTRA_KEYS) if (extras[key] !== void 0 && isRecord(extras[key]) && Object.keys(extras[key]).length) copy[key] = extras[key];
			return copy;
		}
		/** Drop empty containers and the `skill.enabled=true` default, so equal settings compare equal whatever defaults the host filled in. */
		function canonicalPrompts(value) {
			const clean = (node) => {
				if (!isRecord(node)) return node;
				const out = {};
				for (const [key, entry] of Object.entries(node)) {
					const next = clean(entry);
					if (isRecord(next) && Object.keys(next).length === 0) continue;
					if (next === void 0 || next === "") continue;
					out[key] = next;
				}
				return out;
			};
			const out = clean(value);
			const skill = out.skill;
			if (isRecord(skill) && skill.enabled === true) {
				const { enabled: _enabled, ...rest } = skill;
				if (Object.keys(rest).length) out.skill = rest;
				else delete out.skill;
			}
			return out;
		}
		//#endregion
		//#region src/client/form.ts
		/** A free-text field that clears when emptied, so blanking the control resets it. */
		const textField = (field) => (0, _deepseek_ai_dsh_client_ui_primitives.settingsTextField)(field);
		/**
		* A free-text field with a value rule (`field-rules.ts`, the rules the server applies): text the rule refuses is
		* invalid, which blocks the save, instead of being written and dropped at the next start.
		*/
		const checkedTextField = (field) => {
			const base = (0, _deepseek_ai_dsh_client_ui_primitives.settingsTextField)(field);
			return {
				field,
				format: base.format,
				parse: (text) => text.trim() !== "" && fieldProblem(field, text) !== void 0 ? void 0 : base.parse(text)
			};
		};
		/**
		* A boolean field. The card renders a checkbox, so the conversion is explicit
		* rather than relying on the shared model's text round-trip.
		*/
		const booleanField = (field) => ({
			field,
			format: (value) => value === true ? "true" : "false",
			parse: (text) => text === "true" || text === "false" ? {
				kind: "set",
				value: text === "true"
			} : void 0
		});
		/**
		* An enumerated field. Accepts only a value on the list, so an unknown string
		* blocks the save instead of writing something the Host would reject.
		*/
		const enumField = (field, values) => ({
			field,
			format: (value) => typeof value === "string" ? value : values[0] ?? "",
			parse: (text) => values.includes(text) ? {
				kind: "set",
				value: text
			} : void 0
		});
		/** A whole-number field bounded to a range; an empty draft clears it. */
		const rangedNumberField = (field, min, max) => {
			return {
				field,
				format: (0, _deepseek_ai_dsh_client_ui_primitives.settingsNumberField)(field).format,
				parse(text) {
					if (text.trim() === "") return { kind: "clear" };
					const value = Number(text);
					return Number.isInteger(value) && value >= min && value <= max ? {
						kind: "set",
						value
					} : void 0;
				}
			};
		};
		/** JSON object field: parses to a record, and an empty draft clears the field. */
		const jsonField = (field, validate) => ({
			field,
			format: (value) => value && typeof value === "object" && !Array.isArray(value) ? JSON.stringify(value, null, 2) : "",
			parse(text) {
				if (text.trim() === "") return { kind: "clear" };
				try {
					const value = JSON.parse(text);
					if (!value || typeof value !== "object" || Array.isArray(value)) return void 0;
					const record = value;
					return validate && !validate(record) ? void 0 : {
						kind: "set",
						value: record
					};
				} catch {
					return;
				}
			}
		});
		/** A JSON array of strings (Chromium launch arguments): written compactly on one line, an empty draft clears it. */
		const stringArrayField = (field) => ({
			field,
			format: (value) => Array.isArray(value) && value.length ? JSON.stringify(value) : "",
			parse(text) {
				if (text.trim() === "") return { kind: "clear" };
				try {
					const value = JSON.parse(text);
					return Array.isArray(value) && value.every((entry) => typeof entry === "string" && entry.length > 0) ? {
						kind: "set",
						value
					} : void 0;
				} catch {
					return;
				}
			}
		});
		const ASSET_KEYS = new Set(ASSET_POLICY_KEYS);
		const NON_NUMERIC_ASSET_KEYS = /* @__PURE__ */ new Set([
			...ASSET_POLICY_BOOLEAN_KEYS,
			...ASSET_POLICY_STRING_KEYS,
			...Object.keys(ASSET_POLICY_ENUMS)
		]);
		function validAssetPolicy(value) {
			if (Object.keys(value).some((key) => !ASSET_KEYS.has(key))) return false;
			return Object.entries(value).every(([key, entry]) => {
				if (ASSET_POLICY_BOOLEAN_KEYS.includes(key)) return entry === void 0 || typeof entry === "boolean";
				if (ASSET_POLICY_STRING_KEYS.includes(key)) return entry === void 0 || typeof entry === "string";
				const choices = ASSET_POLICY_ENUMS[key];
				if (choices) return entry === void 0 || choices.includes(String(entry));
				if (NON_NUMERIC_ASSET_KEYS.has(key)) return true;
				if (typeof entry !== "number" || !Number.isFinite(entry) || entry < 0) return false;
				const range = ASSET_POLICY_INTEGER_RANGES[key];
				return !range || Number.isInteger(entry) && entry >= range[0] && entry <= range[1];
			});
		}
		function validUsagePolicy(value) {
			if (Object.keys(value).some((key) => !(key in USAGE_POLICY_BOUNDS))) return false;
			return Object.entries(USAGE_POLICY_BOUNDS).every(([key, [min, max]]) => {
				const entry = value[key];
				return entry === void 0 || typeof entry === "number" && Number.isInteger(entry) && entry >= min && entry <= max;
			});
		}
		/**
		* The single-input section fields the card edits, in display order. Every entry
		* must also be `.volatile()` in the Host Config schema: `volatileForm` drops
		* unmarked fields, and the Host would refuse a write to one.
		*/
		const FIELD_SPECS = [
			booleanField("enabled"),
			enumField("automationMode", [
				"read-only",
				"standard",
				"autonomous",
				"unrestricted"
			]),
			enumField("toolSurface", ["indexed", "flat"]),
			enumField("browserRuntime", ["playwright", "patchright"]),
			textField("channel"),
			rangedNumberField("cdpPort", 1, 65535),
			rangedNumberField("maxSessions", 1, 64),
			booleanField("headless"),
			booleanField("opencliEnabled"),
			booleanField("autoInstall"),
			textField("storageStatePath"),
			textField("defaultAuthProfile"),
			textField("executablePath"),
			textField("snapshotDir"),
			checkedTextField("downloadDir"),
			booleanField("allowPrivateHosts"),
			rangedNumberField("downloadMaxBytes", 1, 10737418240),
			enumField("viewportMode", [
				"window",
				"720p",
				"1080p",
				"custom"
			]),
			rangedNumberField("viewportWidth", 200, 7680),
			rangedNumberField("viewportHeight", 200, 4320),
			checkedTextField("userAgent"),
			checkedTextField("locale"),
			checkedTextField("timezoneId"),
			checkedTextField("proxyServer"),
			checkedTextField("proxyBypass"),
			booleanField("verbose")
		];
		/** The JSON-shaped section fields: objects (policies, prompts) and the launch-argument array. */
		const JSON_FIELD_SPECS = [
			jsonField("usagePolicy", validUsagePolicy),
			jsonField("automationAssets", validAssetPolicy),
			jsonField("prompts", validPrompts),
			jsonField("authProfiles", validAuthProfiles),
			stringArrayField("args")
		];
		/**
		* Public config fields the card has no form for, on purpose: nested records (named login states, rule packs with
		* hash-pinned scripts) that are safer to edit in the profile config file. The card names each one and says so, instead
		* of leaving it out without a word. `rulePacks` is not `.volatile()` in the Host schema, so no form could write it.
		*/
		const CONFIG_FILE_ONLY_FIELDS = ["rulePacks"];
		new Set(JSON_FIELD_SPECS.map((spec) => spec.field));
		/** Every field the card renders, in display order. */
		const ALL_FIELD_SPECS = [...FIELD_SPECS, ...JSON_FIELD_SPECS];
		var BrowserSettingsController = class {
			scope;
			promptDefaults;
			form;
			store;
			/** What the person typed in the groups/actions/errorHints box, kept verbatim while it is not valid JSON yet. */
			extrasRaw;
			extrasInvalid = false;
			/** The properties text as typed; undefined shows the text printed from the staged fields. */
			propsRaw;
			propsIssues = [];
			/** The language of the comments printed in the advanced text; the card sets it from its own language. */
			docsLang = "en";
			/** What was typed in each prompt control while it differs from what is staged (a text equal to the default stages nothing). */
			promptRaw = {};
			/** What was typed in a policy key's control while it is not a value the key accepts. */
			policyRaw = {
				usagePolicy: {},
				automationAssets: {}
			};
			/** `promptDefaults` reads the plugin's own prompt texts once they are loaded; until then nothing is "equal to default". */
			constructor(scope, promptDefaults = () => void 0) {
				this.scope = scope;
				this.promptDefaults = promptDefaults;
				this.form = new _deepseek_ai_dsh_client_ui_primitives.SettingsFormModel(scope, [...ALL_FIELD_SPECS]);
				this.store = this.form.bind(() => this.project());
			}
			inject() {
				const actions = this.form.actions();
				return {
					hooks: { browserSettings: this.store },
					...actions,
					edit: (field, text) => {
						this.dropTypedProperties();
						if (field in this.policyRaw) this.policyRaw[field] = {};
						actions.edit(field, text);
					},
					resetField: (field) => {
						this.dropTypedProperties();
						actions.resetField(field);
					},
					save: () => this.save(),
					discard: () => {
						this.clearPolicyRaw();
						this.extrasRaw = void 0;
						this.extrasInvalid = false;
						this.propsRaw = void 0;
						this.propsIssues = [];
						this.clearPromptRaw();
						actions.discard();
					},
					editProperties: (text) => this.editProperties(text),
					setPropertyLanguage: (lang) => this.setPropertyLanguage(lang),
					resetProperty: (key) => this.resetProperty(key),
					editPromptText: (id, text) => this.editPromptText(id, text),
					setPromptSkillEnabled: (enabled) => this.setPromptSkillEnabled(enabled),
					editPromptExtras: (text) => this.editPromptExtras(text),
					editPolicyKey: (field, key, text) => this.editPolicyKey(field, key, text),
					saveAuthProfile: (id, entry) => this.saveAuthProfile(id, entry),
					removeAuthProfile: (id) => this.removeAuthProfile(id),
					resetPromptExtras: () => this.resetPromptExtras(),
					setPromptExtra: (kind, key, value) => this.setPromptExtra(kind, key, value)
				};
			}
			/** Forget the advanced text as typed, so it is printed again from the fields (their edits are already staged). */
			dropTypedProperties() {
				this.propsRaw = void 0;
				this.propsIssues = [];
			}
			/** Rules that span fields, read from the texts the fields hold now (the deployed sizes count when a control does not set them). */
			crossProblems() {
				const text = (key) => this.form.field(key).text;
				return crossFieldProblems({
					viewportMode: text("viewportMode"),
					viewportWidth: text("viewportWidth"),
					viewportHeight: text("viewportHeight")
				});
			}
			/** The fields a save would write: the text differs from the stored one, or a reset leaves the stored override. */
			changedFields() {
				const value = this.scope.getSnapshot().value;
				return ALL_FIELD_SPECS.filter((spec) => {
					const state = this.form.field(spec.field);
					return state.text !== spec.format(value?.[spec.field]) || !state.overridden && this.isStored(spec.field);
				}).map((spec) => spec.field);
			}
			async save() {
				if (this.extrasInvalid || this.policyHasRaw() || this.propsIssues.some((issue) => issue.level === "error") || Object.keys(this.crossProblems()).length) return;
				await this.form.save();
				if (!this.form.shell().failed && (this.extrasRaw !== void 0 || this.propsRaw !== void 0 || Object.keys(this.promptRaw).length)) {
					this.extrasRaw = void 0;
					this.propsRaw = void 0;
					this.propsIssues = [];
					this.clearPromptRaw();
					this.refresh();
				}
			}
			spec(key) {
				return ALL_FIELD_SPECS.find((spec) => spec.field === key);
			}
			/** The text of a field as the plugin has it now (stored, deployed, or default), ignoring anything staged. */
			storedText(key) {
				return this.spec(key).format(this.scope.getSnapshot().value?.[key]);
			}
			isStored(key) {
				const user = this.scope.getSnapshot().user;
				return user !== void 0 && user !== null && Object.hasOwn(user, key);
			}
			/** Print the text from the fields as they are (staged edits included). */
			printProperties() {
				return serializeProperties(PROPERTY_FIELDS.map((field) => {
					const state = this.form.field(field.key);
					return {
						key: field.key,
						text: state.text,
						overridden: state.overridden
					};
				}), propertyDocs(this.docsLang));
			}
			/**
			* Stage the fields to match a properties text: a key with a value is edited to it, a key without one (commented,
			* deleted, blank) goes back to the default. The staged result is the same per-field `set` / `unset` the one-control
			* form produced, so the saved configuration has the same flat keys and nothing else.
			*/
			editProperties(text) {
				this.propsRaw = text;
				const parsed = parseProperties(text);
				this.propsIssues = checkProperties(parsed, (key) => this.form.field(key).text);
				const actions = this.form.actions();
				for (const field of PROPERTY_FIELDS) {
					const entry = parsed.values.get(field.key);
					if (entry) actions.edit(field.key, entry.value);
					else if (this.isStored(field.key)) actions.resetField(field.key);
					else actions.edit(field.key, this.storedText(field.key));
				}
			}
			/** Print the comments of the advanced text in this language (`zh`, anything else is English). Text the person typed is not touched. */
			setPropertyLanguage(lang) {
				const next = lang === "zh" ? "zh" : "en";
				if (next === this.docsLang) return;
				this.docsLang = next;
				this.refresh();
			}
			/** Comment out one key's line: that parameter goes back to the default. */
			resetProperty(key) {
				const current = this.propsRaw ?? this.printProperties();
				const base = this.scope.getSnapshot().base?.[key];
				this.editProperties(commentOutProperty(current, key, this.spec(key).format(base) || (PROPERTY_FIELDS.find((field) => field.key === key)?.defaultText ?? "")));
			}
			projectProperties() {
				const text = this.propsRaw ?? this.printProperties();
				const parsed = parseProperties(text);
				const overridden = PROPERTY_FIELDS.filter((field) => parsed.values.has(field.key)).map((field) => ({
					key: field.key,
					value: parsed.values.get(field.key).value
				}));
				return {
					text,
					issues: this.propsIssues,
					overridden,
					invalid: this.propsIssues.some((issue) => issue.level === "error")
				};
			}
			/** The staged `prompts` value as an object (empty when none, or when its text is not JSON). */
			promptsDraft() {
				const text = this.form.field("prompts").text;
				if (text.trim() === "") return {};
				try {
					const value = JSON.parse(text);
					return value && typeof value === "object" && !Array.isArray(value) ? canonicalPrompts(value) : {};
				} catch {
					return {};
				}
			}
			stagePrompts(value) {
				const next = canonicalPrompts(value);
				const stored = this.scope.getSnapshot().value?.prompts;
				const text = JSON.stringify(next) === JSON.stringify(stored && typeof stored === "object" ? canonicalPrompts(stored) : {}) ? ALL_FIELD_SPECS.find((spec) => spec.field === "prompts").format(stored) : Object.keys(next).length ? JSON.stringify(next, null, 2) : "";
				this.form.actions().edit("prompts", text);
			}
			refresh() {
				this.form.actions().edit("prompts", this.form.field("prompts").text);
			}
			clearPromptRaw() {
				for (const key of Object.keys(this.promptRaw)) delete this.promptRaw[key];
			}
			/**
			* A prompt text: blank, or exactly the plugin's default text, is NO override. Saving the default as an override
			* would freeze today's wording and hide every later improvement, so the box keeps what was typed (an author may
			* have copied the default to edit it) while nothing is staged for it.
			*/
			editPromptText(id, text) {
				const field = PROMPT_TEXT_FIELDS.find((entry) => entry.id === id);
				const base = this.promptDefaults()?.texts[id];
				const none = text.trim() === "" || base !== void 0 && text === base;
				if (text === "" || !none) delete this.promptRaw[id];
				else this.promptRaw[id] = text;
				this.stagePrompts(setAt(this.promptsDraft(), field.path, none ? void 0 : text));
			}
			setPromptSkillEnabled(enabled) {
				this.stagePrompts(setAt(this.promptsDraft(), ["skill", "enabled"], enabled ? void 0 : false));
			}
			editPromptExtras(text) {
				this.extrasRaw = text;
				this.extrasInvalid = false;
				if (text.trim() === "") {
					this.stagePrompts(withExtras(this.promptsDraft(), {}));
					return;
				}
				try {
					const value = JSON.parse(text);
					if (value && typeof value === "object" && !Array.isArray(value) && validExtras(value)) {
						const defaults = this.promptDefaults()?.extras;
						const effective = defaults ? pruneDefaultExtras(value, defaults) : value;
						this.stagePrompts(withExtras(this.promptsDraft(), effective));
						return;
					}
				} catch {}
				this.extrasInvalid = true;
				this.refresh();
			}
			/**
			* One entry of the groups / actions / errorHints lists, from the entry dialog. An entry equal to the plugin's own
			* text is no override (see editPromptText), so it leaves the list instead of freezing today's wording.
			*/
			setPromptExtra(kind, key, value) {
				this.extrasRaw = void 0;
				this.extrasInvalid = false;
				const next = withExtraEntry(this.promptsDraft(), kind, key, value);
				const defaults = this.promptDefaults()?.extras;
				const extras = Object.fromEntries([
					"groups",
					"actions",
					"errorHints"
				].filter((name) => next[name] !== void 0).map((name) => [name, next[name]]));
				const effective = defaults ? pruneDefaultExtras(extras, defaults) : extras;
				this.stagePrompts(withExtras(next, effective));
			}
			/** Back to the plugin's own text for groups, actions and error hints. */
			resetPromptExtras() {
				this.extrasRaw = void 0;
				this.extrasInvalid = false;
				this.stagePrompts(withExtras(this.promptsDraft(), {}));
			}
			clearPolicyRaw() {
				this.policyRaw.usagePolicy = {};
				this.policyRaw.automationAssets = {};
			}
			policyHasRaw() {
				return Object.values(this.policyRaw).some((entries) => Object.keys(entries).length > 0);
			}
			/** The staged policy object (empty when its text is not a JSON object yet). */
			policyDraft(field) {
				const text = this.form.field(field).text;
				if (text.trim() === "") return {};
				try {
					const value = JSON.parse(text);
					return value && typeof value === "object" && !Array.isArray(value) ? value : {};
				} catch {
					return {};
				}
			}
			/** `value` without the keys that equal their default (and without anything the policy does not know), keys in the card's order. */
			minimalPolicy(field, value) {
				const out = {};
				for (const spec of POLICY_SPECS[field]) {
					const entry = value[spec.key];
					if (entry !== void 0 && entry !== defaultOf(field, spec.key)) out[spec.key] = entry;
				}
				return out;
			}
			/**
			* One key of a policy object, from its own control. A text the key does not accept is kept as typed (and blocks the
			* save); an empty text, or the default itself, removes the key so the object holds only what differs.
			*/
			editPolicyKey(field, key, text) {
				const spec = POLICY_SPECS[field].find((entry) => entry.key === key);
				if (!spec) return;
				const parsed = parsePolicyText(field, spec, text);
				if (!parsed.ok) {
					this.policyRaw[field][key] = text;
					this.form.actions().edit(field, this.form.field(field).text);
					return;
				}
				delete this.policyRaw[field][key];
				const next = { ...this.policyDraft(field) };
				if (parsed.value === void 0) delete next[key];
				else next[key] = parsed.value;
				const minimal = this.minimalPolicy(field, next);
				const spec2 = ALL_FIELD_SPECS.find((entry) => entry.field === field);
				const stored = this.scope.getSnapshot().value?.[field];
				const same = JSON.stringify(this.minimalPolicy(field, stored && typeof stored === "object" ? stored : {})) === JSON.stringify(minimal);
				this.form.actions().edit(field, same ? spec2.format(stored) : JSON.stringify(minimal, null, 2));
			}
			projectPolicies() {
				const out = {
					usagePolicy: {},
					automationAssets: {}
				};
				for (const field of Object.keys(POLICY_SPECS)) {
					const draft = this.policyDraft(field);
					for (const spec of POLICY_SPECS[field]) {
						const raw = this.policyRaw[field][spec.key];
						const value = draft[spec.key] ?? defaultOf(field, spec.key);
						const parsed = raw === void 0 ? void 0 : parsePolicyText(field, spec, raw);
						out[field][spec.key] = {
							text: raw ?? valueText(value),
							overridden: draft[spec.key] !== void 0 && draft[spec.key] !== defaultOf(field, spec.key),
							...parsed && !parsed.ok ? { problem: parsed.problem } : {}
						};
					}
				}
				return out;
			}
			/** Stage a whole `authProfiles` map; the stored map itself is staged back when they are equal, so the form is clean again. */
			stageProfiles(next) {
				const spec = ALL_FIELD_SPECS.find((entry) => entry.field === "authProfiles");
				const stored = this.scope.getSnapshot().value?.authProfiles;
				const canonical = (map) => JSON.stringify(Object.keys(map).sort().map((id) => [
					id,
					map[id].storageStatePath,
					[...map[id].allowedDomains],
					map[id].persistState
				]));
				const same = canonical(next) === canonical(parseProfiles(spec.format(stored)));
				this.form.actions().edit("authProfiles", same ? spec.format(stored) : JSON.stringify(next, null, 2));
			}
			/** Add or replace one profile. A profile's state-file path is kept as given: the card never rewrites a path it did not create. */
			saveAuthProfile(id, entry) {
				const current = parseProfiles(this.form.field("authProfiles").text);
				this.stageProfiles({
					...current,
					[id]: {
						storageStatePath: entry.storageStatePath,
						allowedDomains: [...entry.allowedDomains],
						persistState: entry.persistState
					}
				});
			}
			/** Remove one profile from the baseline configuration. */
			removeAuthProfile(id) {
				const current = parseProfiles(this.form.field("authProfiles").text);
				delete current[id];
				this.stageProfiles(current);
			}
			snapshot() {
				return this.store.getSnapshot();
			}
			dispose() {
				this.form.dispose();
			}
			project() {
				const fields = {};
				for (const spec of FIELD_SPECS) fields[spec.field] = this.form.field(spec.field);
				const jsonFields = {};
				for (const spec of JSON_FIELD_SPECS) jsonFields[spec.field] = this.form.field(spec.field);
				const shell = this.form.shell();
				const properties = this.projectProperties();
				const problems = this.crossProblems();
				return {
					...shell,
					invalid: shell.invalid || this.extrasInvalid || this.policyHasRaw() || properties.invalid || Object.keys(problems).length > 0,
					problems,
					policies: this.projectPolicies(),
					fields,
					jsonFields,
					prompts: this.projectPrompts(jsonFields.prompts),
					properties,
					changes: this.changedFields()
				};
			}
			projectPrompts(field) {
				const draft = this.promptsDraft();
				const texts = {};
				for (const entry of PROMPT_TEXT_FIELDS) {
					const value = getAt(draft, entry.path);
					const stored = typeof value === "string" ? value : "";
					const text = this.promptRaw[entry.id] ?? stored;
					const base = this.promptDefaults()?.texts[entry.id];
					texts[entry.id] = {
						text,
						invalid: text.length > entry.limit,
						sameAsDefault: stored !== "" && stored === base
					};
				}
				return {
					texts,
					skillEnabled: getAt(draft, ["skill", "enabled"]) !== false,
					extras: {
						text: this.extrasRaw ?? extrasText(draft),
						invalid: this.extrasInvalid
					},
					entries: extraEntries(draft),
					overridden: field.overridden,
					invalid: field.invalid
				};
			}
		};
		//#endregion
		//#region src/activation-rules.ts
		/**
		* How many different input sets the credential's passing test covered: its passed sets, one for a plain single run,
		* and enough for any requirement when it is a `legacy` credential synthesized from data written before input sets
		* existed (so upgrading never strands an already-tested asset).
		*/
		function inputSetsCovered(credential) {
			if (credential.legacy) return Number.POSITIVE_INFINITY;
			return credential.inputSets ? credential.inputSets.filter((entry) => entry.passed).length : 1;
		}
		/** How many inputs the asset declares (typed `inputSchema` for v2, `inputNames` otherwise). Zero means the rule does not apply. */
		function declaredInputs(asset) {
			return Math.max(asset.inputSchema?.length ?? 0, asset.inputNames?.length ?? 0);
		}
		/** What stands between this asset and activation on input sets, or undefined when nothing does. `credential` is the latest of the current revision. */
		function inputSetShortfall(asset, credential, required) {
			const declared = declaredInputs(asset);
			if (declared === 0) return void 0;
			const covered = credential ? inputSetsCovered(credential) : 0;
			return covered < required ? {
				declared,
				required,
				covered
			} : void 0;
		}
		//#endregion
		//#region src/client/asset-editor.ts
		/** The fields a person edits. Everything else (id, revision, hash, status, credentials, counters) is shown, never edited. */
		const EDITABLE_KEYS = [
			"kind",
			"name",
			"description",
			"domains",
			"tags",
			"inputNames",
			"schemaVersion",
			"recipe",
			"source",
			"inputSchema",
			"outputSchema",
			"postconditions",
			"requiredCapabilities"
		];
		/** The saved asset as the editor text starts out: only the editable fields, so a test or a status change never makes it look edited. */
		function editableView(asset) {
			const record = asset;
			return Object.fromEntries(EDITABLE_KEYS.filter((key) => record[key] !== void 0).map((key) => [key, structuredClone(record[key])]));
		}
		function serializeEditable(asset) {
			return JSON.stringify(editableView(asset), null, 2);
		}
		/** JSON with sorted keys, so reformatting or reordering the text is not an edit. */
		function stableJson(value) {
			if (Array.isArray(value)) return "[" + value.map((entry) => stableJson(entry)).join(",") + "]";
			if (value && typeof value === "object") {
				const record = value;
				return "{" + Object.keys(record).sort().map((key) => JSON.stringify(key) + ":" + stableJson(record[key])).join(",") + "}";
			}
			return JSON.stringify(value) ?? "null";
		}
		/** Whether the editor text differs from the baseline it was loaded from. Text that is not JSON is compared as text. */
		function isDirty(text, baseline) {
			if (text === baseline) return false;
			try {
				return stableJson(JSON.parse(text)) !== stableJson(JSON.parse(baseline));
			} catch {
				return true;
			}
		}
		/** Parse the editor text into something saveable, or say why not. */
		function parseEditor(text) {
			let value;
			try {
				value = JSON.parse(text);
			} catch (error) {
				return {
					ok: false,
					message: error instanceof Error ? error.message : String(error)
				};
			}
			if (!value || typeof value !== "object" || Array.isArray(value)) return {
				ok: false,
				message: "the editor must hold one JSON object"
			};
			const record = value;
			if (record.kind !== "recipe" && record.kind !== "userscript") return {
				ok: false,
				message: "kind must be \"recipe\" or \"userscript\""
			};
			if (typeof record.name !== "string" || !record.name.trim()) return {
				ok: false,
				message: "name must be a non-empty string"
			};
			return {
				ok: true,
				value: record
			};
		}
		function shortHash(hash) {
			return hash ? hash.slice(0, 8) : "--------";
		}
		function credentialView(asset) {
			const credentials = asset?.testCredentials ?? [];
			const current = credentials.filter((entry) => entry.revision === asset?.revision).at(-1);
			return {
				...current ? { current } : {},
				...credentials.at(-1) ? { latest: credentials.at(-1) } : {},
				vouches: !!asset && !!current && current.passed && asset.testStatus === "passed" && (asset.contentHash === void 0 || current.contentHash === asset.contentHash)
			};
		}
		const isObject = (value) => !!value && typeof value === "object" && !Array.isArray(value);
		function parseTestInputs(text) {
			let value;
			try {
				value = JSON.parse(text.trim() || "{}");
			} catch (error) {
				return {
					kind: "error",
					message: "test inputs: " + (error instanceof Error ? error.message : String(error))
				};
			}
			if (isObject(value)) return {
				kind: "single",
				inputs: value
			};
			if (!Array.isArray(value)) return {
				kind: "error",
				message: `test inputs must be a JSON object, or an array of 2 to 5 objects`
			};
			if (value.length < 2 || value.length > 5) return {
				kind: "error",
				message: `test inputs: an array holds 2 to 5 input objects, found ${value.length}`
			};
			const bad = value.findIndex((entry) => !isObject(entry));
			if (bad >= 0) return {
				kind: "error",
				message: `test inputs: set ${bad + 1} is not an object`
			};
			return {
				kind: "sets",
				sets: value
			};
		}
		function inputSetLines(credential) {
			return (credential?.inputSets ?? []).map((entry) => ({
				set: entry.index + 1,
				passed: entry.passed,
				status: `${entry.executionStatus}/${entry.validationStatus}`,
				inputsDigest: entry.inputsDigest,
				outputsDigest: entry.outputsDigest
			}));
		}
		/** Pairs of sets (1-based) that got the same output from different inputs: what `PARAMETERIZATION_SUSPECT` is about. */
		function identicalOutputPairs(credential) {
			const lines = inputSetLines(credential);
			const pairs = [];
			for (let a = 0; a < lines.length; a += 1) for (let b = a + 1; b < lines.length; b += 1) if (lines[a].outputsDigest === lines[b].outputsDigest) pairs.push([lines[a].set, lines[b].set]);
			return pairs;
		}
		//#endregion
		//#region src/client/automation-assets-client.ts
		const EMPTY_EDITOR = {
			text: "",
			baseline: "",
			testUrl: "",
			testInputs: "{}"
		};
		function localStore(initial) {
			let snapshot = initial;
			const listeners = /* @__PURE__ */ new Set();
			return {
				getSnapshot: () => snapshot,
				subscribe(listener) {
					listeners.add(listener);
					return () => {
						listeners.delete(listener);
					};
				},
				set(next) {
					snapshot = next;
					for (const listener of listeners) listener();
				},
				update(updater) {
					const draft = structuredClone(snapshot);
					updater(draft);
					snapshot = draft;
					for (const listener of listeners) listener();
				}
			};
		}
		/** This plugin's private RPC channel, matching the Host half. */
		const CHANNEL$2 = "/dsh-browser-assets";
		/** A failed RPC call, with the structured details the Host attached (`errorCode`, `reason`, ...). */
		var AssetCallError = class extends Error {
			details;
			constructor(message, details = {}) {
				super(message);
				this.details = details;
				this.name = "AssetCallError";
			}
			get code() {
				return typeof this.details.errorCode === "string" ? this.details.errorCode : void 0;
			}
		};
		const VALIDATION_CODES = /* @__PURE__ */ new Set(["VALIDATION_FAILED", "VALIDATION_MISSING"]);
		function noticeFor(error) {
			const message = String(error instanceof Error ? error.message : error).slice(0, 400);
			const code = error instanceof AssetCallError ? error.code : void 0;
			return {
				kind: code && VALIDATION_CODES.has(code) ? "validation" : "backend",
				message,
				...code ? { code } : {}
			};
		}
		/**
		* The "new recipe" template: schema v2 (typed inputs, locators, a result to extract and a postcondition that checks it),
		* so what a person starts from is what the plugin writes today. Every value is a placeholder to replace; the template
		* itself passes the save validation, which test/automation-assets-client.test.ts holds it to.
		*/
		const NEW_RECIPE = {
			kind: "recipe",
			schemaVersion: 2,
			name: "New recipe",
			description: "",
			domains: ["example.com"],
			tags: [],
			inputSchema: [{
				name: "keyword",
				type: "string",
				required: true,
				example: "example"
			}],
			recipe: [
				{
					type: "fill",
					locator: { label: "Search" },
					value: "{{keyword}}"
				},
				{
					type: "click",
					locator: {
						role: "button",
						name: "Search"
					}
				},
				{
					type: "extract",
					locator: { css: "#results" },
					as: "results"
				}
			],
			postconditions: [{
				output: "results",
				nonEmpty: true
			}]
		};
		const NEW_SCRIPT = {
			kind: "userscript",
			name: "New userscript",
			description: "",
			domains: [],
			tags: [],
			inputNames: [],
			source: "// ==UserScript==\n// @name New userscript\n// @match https://example.com/*\n// @grant none\n// ==/UserScript==\nreturn { title: document.title }"
		};
		var AutomationAssetsController = class {
			rpc;
			store = localStore({
				loading: true,
				busy: false,
				failed: false,
				editor: EMPTY_EDITOR
			});
			disposed = false;
			constructor(rpc) {
				this.rpc = rpc;
				this.refresh();
			}
			inject() {
				return {
					hooks: { automationAssets: this.store },
					refreshAutomationAssets: () => {
						this.refresh();
					},
					selectAutomationAsset: (id) => {
						this.select(id);
					},
					saveAutomationAsset: (asset) => this.mutate("save", { asset }),
					summarizeAutomationCandidate: (id) => this.mutate("summarize", { id }),
					dismissAutomationCandidate: (id) => this.mutate("dismiss", { id }),
					validateAutomationAsset: (id) => this.mutate("validate", { id }),
					testAutomationAsset: (id, url, inputs, expectedRevision) => this.mutate("test", {
						id,
						url,
						inputs,
						...expectedRevision !== void 0 ? { expectedRevision } : {}
					}),
					setAutomationAssetStatus: (id, status, expectedRevision) => this.mutate("status", {
						id,
						status,
						...expectedRevision !== void 0 ? { expectedRevision } : {}
					}),
					editAutomationAsset: (text) => this.edit(text),
					setAssetTestUrl: (value) => this.patchEditor({
						testUrl: value,
						notice: void 0
					}),
					setAssetTestInputs: (value) => this.patchEditor({
						testInputs: value,
						notice: void 0
					}),
					requestSelectAutomationAsset: (id) => this.requestLeave({
						kind: "select",
						id
					}),
					requestNewAutomationAsset: (assetKind) => this.requestLeave({
						kind: "new",
						assetKind
					}),
					requestRefreshAutomationAssets: () => this.requestLeave({ kind: "refresh" }),
					requestForkAutomationAsset: (id) => this.requestLeave({
						kind: "fork",
						id
					}),
					requestConvertAutomationAsset: (id) => this.requestLeave({
						kind: "convert",
						id
					}),
					confirmLeaveAutomationAsset: () => this.confirmLeave(),
					cancelLeaveAutomationAsset: () => this.patchEditor({ confirm: void 0 }),
					saveEditedAutomationAsset: () => this.saveEdited(),
					saveAndTestAutomationAsset: () => this.saveAndTest(),
					activateAutomationAsset: () => this.activate()
				};
			}
			snapshot() {
				return this.store.getSnapshot();
			}
			dispose() {
				this.disposed = true;
			}
			/** Whether the editor holds edits that are not saved. */
			dirty() {
				const { editor } = this.store.getSnapshot();
				return isDirty(editor.text, editor.baseline);
			}
			async refresh() {
				this.publish({
					...this.store.getSnapshot(),
					loading: true,
					failed: false,
					error: void 0
				});
				try {
					const snapshot = await this.call("snapshot", {});
					this.publish({
						...this.store.getSnapshot(),
						loading: false,
						snapshot
					});
				} catch (error) {
					this.fail(error);
				}
			}
			/** Load one asset into the selection and the editor, replacing whatever the editor held. */
			async select(id) {
				if (!id) {
					this.publish({
						...this.store.getSnapshot(),
						selected: void 0,
						editor: {
							...this.store.getSnapshot().editor,
							text: "",
							baseline: "",
							notice: void 0,
							confirm: void 0
						}
					});
					return;
				}
				try {
					const selected = await this.call("get", { id });
					this.publish({
						...this.store.getSnapshot(),
						selected: selected ?? void 0,
						failed: false,
						error: void 0,
						editor: this.editorFor(selected ?? void 0)
					});
				} catch (error) {
					this.fail(error);
				}
			}
			editorFor(asset) {
				const previous = this.store.getSnapshot().editor;
				const text = asset ? serializeEditable(asset) : "";
				return {
					text,
					baseline: text,
					testUrl: previous.testUrl,
					testInputs: previous.testInputs
				};
			}
			requestLeave(leave) {
				if (this.dirty()) {
					this.patchEditor({ confirm: leave });
					return;
				}
				this.perform(leave);
			}
			confirmLeave() {
				const leave = this.store.getSnapshot().editor.confirm;
				this.patchEditor({ confirm: void 0 });
				if (leave) this.perform(leave);
			}
			async perform(leave) {
				switch (leave.kind) {
					case "select":
						await this.select(leave.id);
						return;
					case "new":
						this.startNew(leave.assetKind);
						return;
					case "refresh": {
						await this.refresh();
						const id = this.store.getSnapshot().selected?.id;
						if (id) await this.select(id);
						return;
					}
					case "fork": {
						const draft = await this.run(() => this.call("fork", { id: leave.id }));
						if (draft) {
							await this.reloadSnapshot();
							this.publish({
								...this.store.getSnapshot(),
								selected: draft,
								editor: this.editorFor(draft)
							});
						}
						return;
					}
					case "convert": {
						const sourceName = this.store.getSnapshot().snapshot?.assets.find((entry) => entry.id === leave.id)?.name ?? this.store.getSnapshot().selected?.name ?? "";
						const result = await this.run(() => this.call("convert", { id: leave.id }));
						if (result) {
							await this.reloadSnapshot();
							this.publish({
								...this.store.getSnapshot(),
								selected: result.draft,
								editor: {
									...this.editorFor(result.draft),
									converted: {
										sourceName,
										notes: result.notes
									}
								}
							});
						}
					}
				}
			}
			startNew(assetKind) {
				const text = JSON.stringify(assetKind === "recipe" ? NEW_RECIPE : NEW_SCRIPT, null, 2);
				const current = this.store.getSnapshot();
				this.publish({
					...current,
					selected: void 0,
					editor: {
						text,
						baseline: text,
						testUrl: current.editor.testUrl,
						testInputs: current.editor.testInputs
					}
				});
			}
			edit(text) {
				this.patchEditor({
					text,
					notice: void 0
				});
			}
			/** Save the editor text as a new revision. Resolves to the saved asset, or undefined when nothing was saved (the notice says why). */
			async saveEdited() {
				const { editor, selected } = this.store.getSnapshot();
				const parsed = parseEditor(editor.text);
				if (!parsed.ok) {
					this.patchEditor({ notice: {
						kind: "json",
						message: parsed.message
					} });
					return;
				}
				if (selected?.status === "active") {
					this.patchEditor({ notice: {
						kind: "refused",
						message: "active assets cannot be edited: create a repair draft first"
					} });
					return;
				}
				const value = parsed.value;
				if (selected?.id) value.id = selected.id;
				const saved = await this.run(() => this.call("save", { asset: value }));
				if (!saved) return void 0;
				await this.reloadSnapshot();
				this.publish({
					...this.store.getSnapshot(),
					selected: saved,
					editor: {
						...this.editorFor(saved),
						notice: void 0
					}
				});
				return saved;
			}
			/**
			* One button, one meaning: whatever is in the editor is what gets tested. Unsaved edits are saved first
			* (a new revision), and the test is pinned to that revision, so the test, its credential and a later
			* activation all refer to the content on screen.
			*/
			async saveAndTest() {
				const state = this.store.getSnapshot();
				const url = state.editor.testUrl.trim();
				const parsedInputs = parseTestInputs(state.editor.testInputs);
				if (parsedInputs.kind === "error") {
					this.patchEditor({ notice: {
						kind: "json",
						message: parsedInputs.message
					} });
					return;
				}
				if (!url) {
					this.patchEditor({ notice: {
						kind: "json",
						message: "enter the test URL first"
					} });
					return;
				}
				let target = state.selected;
				if (this.dirty() || !target) {
					target = await this.saveEdited();
					if (!target) return;
				}
				if (target.status !== "draft") {
					this.patchEditor({ notice: {
						kind: "refused",
						message: "only drafts can be tested"
					} });
					return;
				}
				const id = target.id;
				const revision = target.revision;
				this.publish({
					...this.store.getSnapshot(),
					busy: true
				});
				try {
					const body = parsedInputs.kind === "sets" ? { inputSets: parsedInputs.sets } : { inputs: parsedInputs.inputs };
					const tested = await this.call("test", {
						id,
						url,
						...body,
						expectedRevision: revision
					});
					await this.reloadSnapshot();
					this.publish({
						...this.store.getSnapshot(),
						busy: false,
						selected: tested,
						editor: {
							...this.store.getSnapshot().editor,
							notice: void 0
						}
					});
				} catch (error) {
					const notice = noticeFor(error);
					await this.reloadSnapshot();
					let selected = this.store.getSnapshot().selected;
					try {
						selected = await this.call("get", { id }) ?? selected;
					} catch {}
					this.publish({
						...this.store.getSnapshot(),
						busy: false,
						selected,
						editor: {
							...this.store.getSnapshot().editor,
							notice
						}
					});
				}
			}
			/** Activate the revision on screen. Refused while the editor has edits, and the request names the revision. */
			async activate() {
				const { selected } = this.store.getSnapshot();
				if (!selected) return;
				if (this.dirty()) {
					this.patchEditor({ notice: {
						kind: "refused",
						message: "save and test your edits before activating"
					} });
					return;
				}
				const activated = await this.run(() => this.call("status", {
					id: selected.id,
					status: "active",
					expectedRevision: selected.revision
				}));
				if (!activated) return;
				await this.reloadSnapshot();
				this.publish({
					...this.store.getSnapshot(),
					selected: activated,
					editor: {
						...this.editorFor(activated),
						notice: void 0
					}
				});
			}
			/** Run a call with the busy flag; a failure becomes the editor's notice. */
			async run(fn) {
				this.publish({
					...this.store.getSnapshot(),
					busy: true
				});
				try {
					const value = await fn();
					this.publish({
						...this.store.getSnapshot(),
						busy: false
					});
					return value;
				} catch (error) {
					this.publish({
						...this.store.getSnapshot(),
						busy: false,
						editor: {
							...this.store.getSnapshot().editor,
							notice: noticeFor(error)
						}
					});
					return;
				}
			}
			async reloadSnapshot() {
				try {
					const snapshot = await this.call("snapshot", {});
					this.publish({
						...this.store.getSnapshot(),
						snapshot
					});
				} catch {}
			}
			async mutate(endpoint, payload) {
				this.publish({
					...this.store.getSnapshot(),
					busy: true,
					failed: false,
					error: void 0
				});
				const before = this.store.getSnapshot().selected;
				try {
					const value = await this.call(endpoint, payload);
					const selected = value && typeof value === "object" && "id" in value ? value : before;
					const snapshot = await this.call("snapshot", {});
					const replaced = !!selected && selected.id !== before?.id;
					const now = this.store.getSnapshot();
					this.publish({
						...now,
						loading: false,
						busy: false,
						failed: false,
						error: void 0,
						snapshot,
						...selected ? { selected } : {},
						...replaced ? { editor: this.editorFor(selected) } : {}
					});
				} catch (error) {
					const now = this.store.getSnapshot();
					this.publish({
						...now,
						loading: false,
						busy: false,
						failed: false,
						error: void 0,
						editor: {
							...now.editor,
							notice: noticeFor(error)
						}
					});
				}
			}
			patchEditor(patch) {
				const current = this.store.getSnapshot();
				this.publish({
					...current,
					editor: {
						...current.editor,
						...patch
					}
				});
			}
			async call(endpoint, payload) {
				const result = await this.rpc.call(CHANNEL$2, endpoint, payload);
				if (!result.ok) throw new AssetCallError(result.error.message, result.error.details ?? {});
				return result.value;
			}
			fail(error) {
				this.publish({
					...this.store.getSnapshot(),
					loading: false,
					busy: false,
					failed: true,
					error: String(error instanceof Error ? error.message : error).slice(0, 300)
				});
			}
			publish(state) {
				if (!this.disposed) this.store.set(state);
			}
		};
		//#endregion
		//#region src/client/prompts-status-client.ts
		/** Same private channel as the automation assets (see automation-assets-rpc.ts). */
		const CHANNEL$1 = "/dsh-browser-assets";
		/** Reads the plugin's own account of its prompt overrides, for the "prompt text" section. */
		var PromptsStatusController = class {
			rpc;
			store = localStore({
				loading: true,
				failed: false
			});
			disposed = false;
			constructor(rpc) {
				this.rpc = rpc;
				this.refresh();
				this.loadDefaults();
			}
			/** The prompt defaults the form compares with and shows as placeholders; undefined until they are loaded. */
			promptDefaults() {
				return this.store.getSnapshot().defaultTexts;
			}
			inject() {
				return {
					hooks: { promptsStatus: this.store },
					refreshPromptsStatus: () => {
						this.refresh();
					},
					exportPromptDefaults: () => this.exportDefaults(),
					exportPromptYaml: (lang) => this.exportYaml(lang),
					loadPromptDefaults: () => this.loadDefaults(),
					hidePromptDefaults: () => {
						const { defaults: _defaults, defaultsFailed: _failed, yamlFailed: _yamlFailed, ...rest } = this.store.getSnapshot();
						this.publish(rest);
					}
				};
			}
			snapshot() {
				return this.store.getSnapshot();
			}
			dispose() {
				this.disposed = true;
			}
			/** Fetch the default texts (once; a later call reuses them). They feed the placeholders and the "equal to default is no override" rule. */
			async loadDefaults() {
				if (this.store.getSnapshot().defaultsJson !== void 0) return;
				try {
					const result = await this.rpc.call(CHANNEL$1, "promptsDefaults", {});
					if (!result.ok) throw new Error(result.error.message);
					const json = result.value.json;
					const parsed = defaultsFromJson(json);
					const { defaultsFailed: _failed, ...rest } = this.store.getSnapshot();
					this.publish({
						...rest,
						defaultsJson: json,
						...parsed ? { defaultTexts: parsed } : {}
					});
				} catch {
					this.publish({
						...this.store.getSnapshot(),
						defaultsFailed: true
					});
				}
			}
			/** Show the default text in the read-only box under the section. */
			async exportDefaults() {
				await this.loadDefaults();
				const current = this.store.getSnapshot();
				if (current.defaultsJson !== void 0) this.publish({
					...current,
					defaults: current.defaultsJson
				});
			}
			/** The commented YAML of the defaults, in the card's language (fetched once per language). */
			async exportYaml(lang) {
				if (this.store.getSnapshot().defaultsYaml?.lang === lang) return;
				try {
					const result = await this.rpc.call(CHANNEL$1, "promptsDefaultsYaml", { lang });
					if (!result.ok) throw new Error(result.error.message);
					const { yamlFailed: _failed, ...rest } = this.store.getSnapshot();
					this.publish({
						...rest,
						defaultsYaml: {
							lang,
							text: result.value.yaml
						}
					});
				} catch {
					this.publish({
						...this.store.getSnapshot(),
						yamlFailed: true
					});
				}
			}
			async refresh() {
				const current = this.store.getSnapshot();
				this.publish({
					...current,
					loading: true
				});
				try {
					const result = await this.rpc.call(CHANNEL$1, "prompts", {});
					if (!result.ok) throw new Error(result.error.message);
					this.publish({
						...this.store.getSnapshot(),
						loading: false,
						failed: false,
						status: result.value
					});
				} catch {
					this.publish({
						...this.store.getSnapshot(),
						loading: false,
						failed: true
					});
				}
			}
			publish(state) {
				if (!this.disposed) this.store.set(state);
			}
		};
		//#endregion
		//#region src/client/policy-status-client.ts
		/** Only a reply of the right shape is used: an older plugin, or a bridge that answers `{}` to every endpoint, must not break the card. */
		function isRuntimeView(value) {
			const view = value;
			return typeof view === "object" && view !== null && typeof view.browser?.ready === "boolean" && typeof view.opencli?.installed === "boolean";
		}
		const CHANNEL = "/dsh-browser-assets";
		/** Reads the policy overlay for the "policy overlay" section and clears it back to the baseline. */
		var PolicyStatusController = class {
			rpc;
			store = localStore({
				loading: true,
				failed: false
			});
			disposed = false;
			constructor(rpc) {
				this.rpc = rpc;
				this.refresh();
			}
			inject() {
				return {
					hooks: { policyStatus: this.store },
					refreshPolicyStatus: () => {
						this.refresh();
					},
					clearPolicyOverlay: (scope = "all", id) => this.clear(scope, id)
				};
			}
			snapshot() {
				return this.store.getSnapshot();
			}
			dispose() {
				this.disposed = true;
			}
			async refresh() {
				this.publish({
					...this.store.getSnapshot(),
					loading: true
				});
				try {
					const result = await this.rpc.call(CHANNEL, "policy", {});
					if (!result.ok) throw new Error(result.error.message);
					this.publish({
						...this.store.getSnapshot(),
						loading: false,
						failed: false,
						report: result.value
					});
					this.refreshRuntime();
				} catch {
					this.publish({
						...this.store.getSnapshot(),
						loading: false,
						failed: true
					});
				}
			}
			async refreshRuntime() {
				try {
					const result = await this.rpc.call(CHANNEL, "runtime", {});
					if (result.ok && isRuntimeView(result.value)) this.publish({
						...this.store.getSnapshot(),
						runtime: result.value
					});
				} catch {}
			}
			async clear(scope, id) {
				this.publish({
					...this.store.getSnapshot(),
					busy: true,
					error: void 0
				});
				try {
					const result = await this.rpc.call(CHANNEL, "policyReset", {
						scope,
						...id ? { id } : {},
						expectedRevision: this.store.getSnapshot().report?.revision
					});
					if (!result.ok) throw new Error(result.error.message);
					this.publish({
						...this.store.getSnapshot(),
						busy: false
					});
				} catch (error) {
					this.publish({
						...this.store.getSnapshot(),
						busy: false,
						error: String(error instanceof Error ? error.message : error)
					});
				}
				await this.refresh();
			}
			publish(state) {
				if (!this.disposed) this.store.set(state);
			}
		};
		//#endregion
		//#region src/client/styles.ts
		const styles = {
			notice: "dsb-notice",
			field: "dsb-field",
			fieldHead: "dsb-field-head",
			label: "dsb-label",
			hint: "dsb-hint",
			input: "dsb-input",
			textarea: "dsb-textarea",
			code: "dsb-code",
			failed: "dsb-failed",
			actions: "dsb-actions",
			root: "dsb-root",
			summaryBar: "dsb-summary",
			chips: "dsb-chips",
			chip: "dsb-chip",
			chipRemove: "dsb-chip-remove",
			chipInput: "dsb-chip-input",
			group: "dsb-group",
			groupHead: "dsb-group-head",
			groupTitle: "dsb-group-title",
			groupSub: "dsb-group-sub",
			groupBadges: "dsb-group-badges",
			groupBody: "dsb-group-body",
			row: "dsb-row",
			rowText: "dsb-row-text",
			rowLabel: "dsb-row-label",
			rowControl: "dsb-row-control",
			rowHint: "dsb-row-hint",
			rowMeta: "dsb-row-meta",
			muted: "dsb-muted",
			select: "dsb-select",
			unitInput: "dsb-unit-input",
			unit: "dsb-unit",
			help: "dsb-help",
			link: "dsb-link",
			danger: "dsb-danger",
			list: "dsb-list",
			item: "dsb-item",
			itemMain: "dsb-item-main",
			itemTitle: "dsb-item-title",
			itemMeta: "dsb-item-meta",
			itemActions: "dsb-item-actions",
			empty: "dsb-empty",
			subHead: "dsb-sub-head",
			compare: "dsb-compare",
			compareCol: "dsb-compare-col",
			preview: "dsb-preview",
			savebar: "dsb-savebar",
			saveText: "dsb-save-text",
			dialogBody: "dsb-dialog-body",
			stack: "dsb-stack",
			fold: "dsb-fold",
			foldBody: "dsb-fold-body",
			foldHint: "dsb-fold-hint",
			assetToolbar: "dsb-asset-toolbar",
			assetTestForm: "dsb-asset-test-form",
			assetEditor: "dsb-asset-editor",
			invalidInput: "dsb-invalid-input"
		};
		/**
		* Inject the card's stylesheet, or refresh it in place. A Host that hot-reloads the plugin keeps the page (and the
		* `<style>` an older version injected), so an existing element gets the current CSS instead of being kept as is.
		*/
		function ensureStyles() {
			const existing = document.getElementById("dsh-browser-settings-styles");
			const style = existing ?? document.createElement("style");
			style.id = "dsh-browser-settings-styles";
			const css = `
.dsb-notice{margin:0;padding:9px 11px;border-radius:8px;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-bg-layer-3)}.dsb-hint{font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary);margin:0}
.dsb-field{display:flex;min-width:0;flex-direction:column;gap:6px}.dsb-field-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.dsb-label{font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary)}
.dsb-input{box-sizing:border-box;width:100%;min-width:0;height:34px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-3);font:inherit;font-size:13px;color:var(--dsw-alias-label-primary)}.dsb-input:focus-visible{outline:none;border-color:var(--dsw-alias-state-business-primary)}.dsb-input:disabled{opacity:.55}.dsb-textarea{height:auto;padding:9px 10px;resize:vertical;line-height:1.45}.dsb-code{font-family:var(--ds-font-family-code);font-size:12px}
.dsb-failed{margin:0;font-size:12px;color:var(--dsw-alias-state-error-primary)}.dsb-actions{display:flex;flex-wrap:wrap;gap:8px}.dsb-invalid-input{border-color:var(--dsw-alias-state-error-primary)}
.dsb-asset-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px}.dsb-asset-toolbar p{margin:3px 0 0;font-size:11px;color:var(--dsw-alias-label-tertiary)}.dsb-asset-editor{display:flex;min-width:0;flex-direction:column;gap:8px}.dsb-asset-editor .dsb-actions{justify-content:flex-end}
.dsb-asset-test-form{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px}.dsb-asset-test-form .dsb-textarea{min-height:64px}
@media(max-width:560px){.dsb-asset-test-form{grid-template-columns:minmax(0,1fr)}.dsb-asset-toolbar{align-items:stretch;flex-direction:column}}
.dsb-root{container-type:inline-size;display:flex;flex-direction:column;gap:12px;min-width:0}
.dsb-summary{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-3)}.dsb-summary>strong{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary);margin-right:2px}
.dsb-link{appearance:none;border:0;background:none;padding:0;margin:0;font:inherit;font-size:12px;color:var(--dsw-alias-state-business-primary);cursor:pointer;text-decoration:none}.dsb-link:hover{text-decoration:underline}.dsb-link:disabled{opacity:.4;cursor:default;text-decoration:none}.dsb-danger{color:var(--dsw-alias-state-error-primary)}
.dsb-group{border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-3);min-width:0}.dsb-group[open]{background:var(--dsw-alias-bg-layer-2)}
.dsb-group-head{list-style:none;display:flex;align-items:center;gap:10px;padding:12px 14px;cursor:pointer;border-radius:12px;min-width:0}.dsb-group-head::-webkit-details-marker{display:none}.dsb-group-head::marker{content:''}
.dsb-group-head::after{content:'';flex:none;width:7px;height:7px;margin:0 4px 2px 2px;border-right:1.5px solid var(--dsw-alias-label-tertiary);border-bottom:1.5px solid var(--dsw-alias-label-tertiary);transform:rotate(45deg);transition:transform .16s}.dsb-group[open]>.dsb-group-head::after{transform:rotate(-135deg);margin-bottom:-2px}
.dsb-group-head:hover{background:var(--dsw-alias-interactive-bg-hover)}.dsb-group-head:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px}
.dsb-group-title{display:flex;flex-direction:column;gap:2px;flex:1;min-width:0}.dsb-group-title strong{font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary)}.dsb-group-sub{font-size:12px;line-height:1.4;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsb-group-badges{display:flex;flex:none;align-items:center;gap:6px}.dsb-group-body{padding:2px 14px 14px;border-top:1px solid var(--dsw-alias-border-l2);display:flex;flex-direction:column}
.dsb-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(180px,260px);gap:6px 16px;align-items:start;padding:12px 0}.dsb-row+.dsb-row,.dsb-row+.dsb-sub-head,.dsb-sub-head+.dsb-row{border-top:1px solid var(--dsw-alias-border-l1)}
.dsb-row-text{display:flex;flex-direction:column;gap:3px;min-width:0}.dsb-row-label{display:flex;flex-wrap:wrap;align-items:center;gap:6px}.dsb-row-label label,.dsb-row-label>span:first-child{font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary)}
.dsb-row-hint{margin:0;font-size:12px;line-height:1.45;color:var(--dsw-alias-label-tertiary)}.dsb-row-hint.dsb-bad,.dsb-bad{color:var(--dsw-alias-state-error-primary)}.dsb-row-control{display:flex;flex-direction:column;gap:6px;min-width:0}.dsb-row-control.dsb-inline{flex-direction:row;align-items:center;justify-content:flex-end}.dsb-row-wide{grid-template-columns:minmax(0,1fr)}
.dsb-row-meta{font-size:11px;color:var(--dsw-alias-label-tertiary);opacity:.85}.dsb-muted{color:var(--dsw-alias-label-tertiary)}.dsb-sub-head{margin:14px 0 2px;padding-top:2px;font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary)}.dsb-sub-head:first-child{margin-top:8px}
.dsb-select{box-sizing:border-box;width:100%;min-width:0;height:34px;padding:0 28px 0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background-color:var(--dsw-alias-bg-layer-3);font:inherit;font-size:13px;color:var(--dsw-alias-label-primary);cursor:pointer;appearance:none;background-image:linear-gradient(45deg,transparent 50%,var(--dsw-alias-label-tertiary) 50%),linear-gradient(135deg,var(--dsw-alias-label-tertiary) 50%,transparent 50%);background-position:calc(100% - 15px) 14px,calc(100% - 10px) 14px;background-size:5px 5px;background-repeat:no-repeat}
.dsb-select:focus-visible{outline:none;border-color:var(--dsw-alias-state-business-primary)}.dsb-select:disabled{opacity:.55;cursor:default}.dsb-select.dsb-muted,.dsb-input.dsb-muted{color:var(--dsw-alias-label-tertiary)}.dsb-select option{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}
.dsb-input:focus-visible{border-color:var(--dsw-alias-state-business-primary)}.dsb-unit-input{display:flex;align-items:center;gap:6px;min-width:0}.dsb-unit-input .dsb-input{flex:none;width:120px}.dsb-input.dsb-num{max-width:160px}.dsb-unit-input .dsb-select{flex:none;width:auto;min-width:72px}.dsb-unit{flex:none;font-size:12px;color:var(--dsw-alias-label-tertiary)}
.dsb-help{appearance:none;display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;padding:0;border:1px solid var(--dsw-alias-border-l3);border-radius:50%;background:transparent;font:inherit;font-size:10px;line-height:1;color:var(--dsw-alias-label-tertiary);cursor:pointer}.dsb-help:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-tertiary)}.dsb-help:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}
.dsb-chips{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:6px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-3);min-width:0}.dsb-chips:focus-within{border-color:var(--dsw-alias-state-business-primary)}
.dsb-chip{display:inline-flex;align-items:center;gap:4px;max-width:100%;padding:2px 4px 2px 8px;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover);font-size:12px;color:var(--dsw-alias-label-primary)}.dsb-chip>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsb-chip-remove{appearance:none;border:0;background:none;padding:0 4px;font:inherit;font-size:13px;line-height:1;color:var(--dsw-alias-label-tertiary);cursor:pointer;border-radius:50%}.dsb-chip-remove:hover{color:var(--dsw-alias-state-error-primary)}.dsb-chip-remove:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary)}
.dsb-chip-input{flex:1;min-width:120px;height:24px;border:0;background:transparent;font:inherit;font-size:13px;color:var(--dsw-alias-label-primary)}.dsb-chip-input:focus{outline:none}
.dsb-list{display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;overflow:hidden;background:var(--dsw-alias-bg-layer-3)}.dsb-item{display:flex;align-items:center;gap:10px;padding:9px 12px;min-width:0}.dsb-item+.dsb-item{border-top:1px solid var(--dsw-alias-border-l1)}
.dsb-item-main{display:flex;flex-direction:column;gap:2px;flex:1;min-width:0}.dsb-item-title{display:flex;align-items:center;flex-wrap:wrap;gap:6px;font-size:13px;color:var(--dsw-alias-label-primary)}.dsb-item-title code{font-family:var(--ds-font-family-code);font-size:12px}.dsb-item-meta{font-size:11px;line-height:1.4;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsb-item-actions{display:flex;flex:none;align-items:center;gap:6px}.dsb-empty{margin:0;padding:12px;font-size:12px;color:var(--dsw-alias-label-tertiary)}
.dsb-compare{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px}.dsb-compare-col{display:flex;flex-direction:column;gap:6px;min-width:0}.dsb-compare-col>label,.dsb-compare-col>strong{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary)}
.dsb-preview{margin:0;padding:9px 10px;max-height:280px;overflow:auto;border:1px dashed var(--dsw-alias-border-l3);border-radius:8px;background:var(--dsw-alias-bg-layer-1);font-family:var(--ds-font-family-code);font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;word-break:break-word}
.dsb-dialog-body{display:flex;flex-direction:column;gap:14px;min-width:0}.dsb-dialog-body .dsb-row{padding:8px 0}.dsb-stack{display:flex;flex-direction:column;gap:8px}
div.dsb-modal{width:min(560px,100%);max-height:100%}div.dsb-modal-wide{width:min(980px,100%)}.dsb-modal-content{min-height:0;overflow:auto}div.dsb-modal{gap:16px}
.dsb-savebar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:4px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l3);border-radius:12px;background:var(--dsw-alias-bg-layer-2)}.dsb-savebar[data-dsb-floating]{position:sticky;bottom:0;z-index:2;box-shadow:0 -6px 16px -8px rgba(0,0,0,.35)}.dsb-save-text{display:flex;flex-direction:column;gap:2px;min-width:0;font-size:12px;color:var(--dsw-alias-label-secondary)}.dsb-save-text .dsb-bad{margin:0}
.dsb-fold{margin-top:6px;border-top:1px solid var(--dsw-alias-border-l1)}.dsb-fold>summary{list-style:none;display:flex;align-items:center;gap:6px;padding:10px 0;cursor:pointer;font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary)}.dsb-fold>summary::-webkit-details-marker{display:none}.dsb-fold>summary::before{content:'';width:6px;height:6px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(-45deg);transition:transform .16s}.dsb-fold[open]>summary::before{transform:rotate(45deg)}.dsb-fold>summary:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}.dsb-fold-body{display:flex;flex-direction:column}.dsb-fold-hint{font-weight:400;color:var(--dsw-alias-label-tertiary)}
@container (max-width:560px){.dsb-row{grid-template-columns:minmax(0,1fr)}.dsb-row-control.dsb-inline{justify-content:flex-start}.dsb-compare{grid-template-columns:minmax(0,1fr)}.dsb-group-sub{white-space:normal}.dsb-item{flex-wrap:wrap}.dsb-savebar{flex-wrap:wrap}.dsb-savebar .dsb-actions{margin-left:auto}}
@media(max-width:560px){.dsb-compare{grid-template-columns:minmax(0,1fr)}div.dsb-modal{width:100%}}
`;
			if (style.textContent !== css) style.textContent = css;
			if (!existing) document.head.append(style);
		}
		//#endregion
		//#region src/client/ui-kit.tsx
		/**
		* The small set of controls the settings card is made of.
		*
		* Switches, buttons, badges, dialogs and the click-to-read help bubble are the Host's own
		* (`@deepseek-ai/dsh-client-ui-primitives`). The Host ships no select, no chip input, no accordion and no
		* list-row, so those four are built here from native elements (`<select>`, `<details>`, `<input>`) and the
		* `--dsw-alias-*` tokens, which makes them follow the light and dark themes without a color of their own.
		* Nothing in this file knows about a configuration field: callers pass text and callbacks.
		* @module dsh-browser/client/ui-kit
		*/
		/** A read-only badge. */
		function Badge(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tag, {
				tone: props.tone ?? "neutral",
				children: props.children
			});
		}
		/** The `?` button: its text opens on click, so a long explanation costs one glyph until someone asks. */
		function Help(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
				label: props.text,
				openOnClick: true,
				portal: true,
				maxWidth: 360,
				side: "top",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: styles.help,
					"aria-label": props.label,
					"data-dsb-help": true,
					children: "?"
				})
			});
		}
		/** One setting: label, one-line hint, an optional `?`, the "overridden" badge with its reset, and the control. */
		function Row(props) {
			const { labels } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: `${styles.row} ${props.wide ? "dsb-row-wide" : ""}`,
				"data-dsb-field": props.field,
				"data-dsb-policy-key": props.policyKey,
				"data-dsb-overridden": props.overridden ? "true" : void 0,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: styles.rowText,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: styles.rowLabel,
						children: [
							props.id ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
								htmlFor: props.id,
								children: props.label
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: props.label }),
							props.help ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Help, {
								label: labels.help,
								text: props.help
							}) : null,
							props.risk ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Badge, {
								tone: "warning",
								children: props.risk
							}) : null,
							props.overridden ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Badge, {
								tone: "info",
								children: labels.overridden
							}) : null,
							props.overridden && props.onReset ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: styles.link,
								disabled: props.disabled,
								onClick: props.onReset,
								"data-dsb-reset": props.field,
								children: labels.reset
							}) : null
						]
					}), props.invalid && props.problem ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: `${styles.rowHint} dsb-bad`,
						role: "alert",
						children: props.problem
					}) : props.hint || props.meta ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						className: styles.rowHint,
						children: [props.hint, props.meta ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: styles.rowMeta,
							children: [props.hint ? " · " : "", props.meta]
						}) : null]
					}) : null]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: `${styles.rowControl} ${props.inline ? "dsb-inline" : ""}`,
					children: props.children
				})]
			});
		}
		/** A closed-by-default fold inside a group, for the items few people need. */
		function Fold(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
				className: styles.fold,
				"data-dsb-fold": props.id,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("summary", { children: [props.title, props.hint ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: styles.foldHint,
					children: [" · ", props.hint]
				}) : null] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: styles.foldBody,
					children: props.children
				})]
			});
		}
		/** A small heading inside a group, for sets of rows that belong together. */
		function SubHead(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: styles.subHead,
				role: "presentation",
				children: props.children
			});
		}
		/**
		* One group of the card, an accordion item. `<details>` keeps every control in the document while the group is
		* closed (so a server-rendered check still sees them) and gives keyboard and screen-reader behavior for free.
		*/
		function Group(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
				className: styles.group,
				open: props.defaultOpen ? true : void 0,
				"data-dsb-group": props.id,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("summary", {
					className: styles.groupHead,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: styles.groupTitle,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: props.title }), props.summary ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: styles.groupSub,
							children: props.summary
						}) : null]
					}), props.badges ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: styles.groupBadges,
						children: props.badges
					}) : null]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: styles.groupBody,
					children: props.children
				})]
			});
		}
		/**
		* A native select. A stored value that is not among the options (a channel the list does not know, an older
		* enum value) is shown as its own entry instead of being silently replaced by the first option.
		*/
		function Select(props) {
			const options = props.options.some((option) => option.value === props.value) || props.value === "" ? props.options : [{
				value: props.value,
				label: props.value
			}, ...props.options];
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
				id: props.id,
				className: `${styles.select} ${props.muted ? styles.muted : ""}`,
				value: props.value,
				disabled: props.disabled,
				"aria-label": props.ariaLabel,
				"aria-invalid": props.invalid || void 0,
				onChange: (event) => props.onChange(event.currentTarget.value),
				children: options.map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
					value: option.value,
					children: option.label
				}, option.value))
			});
		}
		/** A single-line text input; `muted` greys the value while it is only the inherited default. */
		function TextInput(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
				id: props.id,
				type: "text",
				className: `${styles.input} ${props.muted ? styles.muted : ""} ${props.invalid ? styles.invalidInput : ""} ${props.code ? styles.code : ""} ${props.numeric ? "dsb-num" : ""}`,
				value: props.value,
				placeholder: props.placeholder,
				disabled: props.disabled,
				list: props.list,
				inputMode: props.numeric ? "numeric" : void 0,
				spellCheck: false,
				"aria-label": props.ariaLabel,
				"aria-invalid": props.invalid || void 0,
				onChange: (event) => props.onChange(event.currentTarget.value)
			});
		}
		/** A text input followed by a fixed unit. */
		function UnitInput(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				className: styles.unitInput,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextInput, {
					id: props.id,
					value: props.value,
					onChange: props.onChange,
					placeholder: props.placeholder,
					disabled: props.disabled,
					muted: props.muted,
					invalid: props.invalid,
					numeric: true,
					ariaLabel: props.ariaLabel
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: styles.unit,
					children: props.unit
				})]
			});
		}
		/** The Host's switch, named by its row. */
		function Toggle(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Switch, {
				label: props.label,
				checked: props.checked,
				disabled: props.disabled,
				onChange: props.onChange
			});
		}
		/** A list of short strings as removable chips with an add box (Enter or comma adds; Backspace on an empty box removes the last). */
		function Chips(props) {
			const [draft, setDraft] = (0, react.useState)("");
			const [problem, setProblem] = (0, react.useState)();
			const commit = (raw) => {
				const value = raw.trim();
				if (value === "") {
					setDraft("");
					setProblem(void 0);
					return;
				}
				const refused = props.check?.(value, props.values);
				if (refused) {
					setProblem(refused);
					return;
				}
				if (!props.values.includes(value)) props.onChange([...props.values, value]);
				setDraft("");
				setProblem(void 0);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: styles.stack,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: styles.chips,
					"data-dsb-chips": true,
					children: [props.values.map((value) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: styles.chip,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: value }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: styles.chipRemove,
							disabled: props.disabled,
							"aria-label": `${props.removeLabel}: ${value}`,
							onClick: () => props.onChange(props.values.filter((entry) => entry !== value)),
							children: "×"
						})]
					}, value)), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						id: props.id,
						className: styles.chipInput,
						value: draft,
						placeholder: props.placeholder,
						disabled: props.disabled,
						"aria-label": props.addLabel,
						spellCheck: false,
						onChange: (event) => {
							const text = event.currentTarget.value;
							if (text.endsWith(",")) commit(text.slice(0, -1));
							else setDraft(text);
						},
						onBlur: () => {
							if (draft.trim() !== "") commit(draft);
						},
						onKeyDown: (event) => {
							if (event.key === "Enter") {
								event.preventDefault();
								commit(draft);
							} else if (event.key === "Backspace" && draft === "" && props.values.length) props.onChange(props.values.slice(0, -1));
						}
					})]
				}), problem ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: `${styles.rowHint} dsb-bad`,
					role: "alert",
					children: problem
				}) : null]
			});
		}
		/** A dialog on the Host's modal: a title, a scrolling body, and a footer of actions. */
		function Dialog(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open: props.open,
				onClose: props.onClose,
				title: props.title,
				closeLabel: props.closeLabel,
				description: props.description,
				footer: props.footer,
				className: `dsb-modal ${props.wide ? "dsb-modal-wide" : ""}`,
				contentClassName: "dsb-modal-content",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: styles.dialogBody,
					children: props.children
				})
			});
		}
		/** Primary and secondary buttons at the card's size. */
		function Btn(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
				type: "button",
				variant: props.primary ? "primary" : "outline",
				size: "sm",
				disabled: props.disabled,
				title: props.title,
				className: props.danger ? styles.danger : void 0,
				onClick: props.onClick,
				"data-dsb-action": props.data,
				children: props.children
			});
		}
		/** A list row: a title with badges, a meta line, and actions on the right. */
		function Item(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: styles.item,
				"data-dsb-item": props.data,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: styles.itemMain,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: styles.itemTitle,
						children: [props.title, props.badges]
					}), props.meta ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: styles.itemMeta,
						children: props.meta
					}) : null]
				}), props.actions ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: styles.itemActions,
					children: props.actions
				}) : null]
			});
		}
		//#endregion
		//#region src/client/field-rows.tsx
		/** Fill `{name}` placeholders of a dictionary entry. */
		const fill = (text, values) => text.replace(/\{(\w+)\}/g, (_match, key) => String(values[key] ?? ""));
		/** The words every row shares. */
		function rowLabels(t) {
			return {
				overridden: t("overridden"),
				reset: t("reset"),
				help: t("helpLabel"),
				invalid: t("invalid")
			};
		}
		/** The id of a field's control, tied to its label. */
		const controlId = (name) => `plugin-config-dsh-browser-${name}`;
		/** The names that have a `?` text of their own in the dictionary. */
		const WITH_HELP = /* @__PURE__ */ new Set([
			"automationMode",
			"toolSurface",
			"channel",
			"headless",
			"autoInstall",
			"executablePath",
			"cdpPort",
			"maxSessions",
			"args",
			"snapshotDir",
			"storageStatePath",
			"viewportMode",
			"userAgent",
			"locale",
			"timezoneId",
			"proxyServer",
			"proxyBypass",
			"downloadDir",
			"downloadMaxBytes",
			"allowPrivateHosts",
			"authProfiles",
			"usagePolicy",
			"automationAssets"
		]);
		/** How many of these fields carry an override: the number a group's badge shows. */
		function useOverriddenCount(card, names) {
			return card.useBrowserSettings((snapshot) => names.filter((name) => stateOf(snapshot, name)?.overridden).length);
		}
		/** A field's staged state, whether it is a single-input field or one of the JSON-shaped ones (launch arguments, policies). */
		function stateOf(snapshot, name) {
			return snapshot.fields[name] ?? snapshot.jsonFields[name];
		}
		/** Read one single-input field's staged state. */
		function useField(card, name) {
			return {
				state: card.useBrowserSettings((snapshot) => stateOf(snapshot, name)),
				disabled: card.useBrowserSettings((snapshot) => !snapshot.writable),
				problem: card.useBrowserSettings((snapshot) => snapshot.problems?.[name]),
				edit: (text) => card.edit(name, text),
				reset: () => card.resetField(name)
			};
		}
		function rowFor(props, field, children, extra = {}) {
			const { card, name } = props;
			const { t } = card;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Row, {
				field: name,
				id: extra.id,
				label: props.label ?? t(name),
				hint: typeof props.hint === "function" ? props.hint(field.state.text) : props.hint ?? t(`${name}Hint`),
				help: WITH_HELP.has(name) ? t(`${name}Help`) : void 0,
				risk: props.risk,
				overridden: field.state.overridden,
				invalid: field.state.invalid || !!field.problem,
				problem: extra.problem ?? field.problem ?? t("invalid"),
				disabled: field.disabled,
				labels: rowLabels(t),
				onReset: field.reset,
				inline: extra.inline,
				wide: extra.wide,
				children
			});
		}
		/** A boolean field as a switch. */
		function SwitchRow(props) {
			const field = useField(props.card, props.name);
			const label = props.label ?? props.card.t(props.name);
			return rowFor(props, field, /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Toggle, {
				label,
				checked: field.state.text === "true",
				disabled: field.disabled,
				onChange: (next) => field.edit(String(next))
			}), { inline: true });
		}
		/** An enumerated field as a drop-down. */
		function SelectRow(props) {
			const field = useField(props.card, props.name);
			const id = controlId(props.name);
			return rowFor(props, field, /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Select, {
				id,
				value: field.state.text,
				options: props.options,
				disabled: field.disabled,
				muted: !field.state.overridden,
				invalid: field.state.invalid || !!field.problem,
				onChange: field.edit
			}), { id });
		}
		/** A free-text field. `listId` names a `<datalist>` of suggestions rendered by the caller. */
		function TextRow(props) {
			const field = useField(props.card, props.name);
			const id = controlId(props.name);
			return rowFor(props, field, /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextInput, {
				id,
				value: field.state.text,
				placeholder: props.placeholder,
				list: props.listId,
				code: props.code,
				disabled: field.disabled,
				muted: !field.state.overridden,
				invalid: field.state.invalid || !!field.problem,
				onChange: field.edit
			}), { id });
		}
		/** A whole-number field with its unit written after the input. */
		function NumberRow(props) {
			const field = useField(props.card, props.name);
			const id = controlId(props.name);
			return rowFor(props, field, props.unit ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(UnitInput, {
				id,
				value: field.state.text,
				unit: props.unit,
				placeholder: props.placeholder,
				disabled: field.disabled,
				muted: !field.state.overridden,
				invalid: field.state.invalid || !!field.problem,
				onChange: field.edit
			}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextInput, {
				id,
				value: field.state.text,
				placeholder: props.placeholder,
				numeric: true,
				disabled: field.disabled,
				muted: !field.state.overridden,
				invalid: field.state.invalid || !!field.problem,
				onChange: field.edit
			}), { id });
		}
		//#endregion
		//#region src/client/card-frame.tsx
		/**
		* The frame around the groups: the status summary on top (with the warnings dialog) and the save bar at the bottom.
		*
		* The Host's `SettingsForm` offers one save button below the controls. This card needs the bar to stay in view while a
		* long page scrolls, to say how many edits are waiting, and to offer "Discard", so the frame is built here; the
		* behaviors `SettingsForm` has are kept: it says so when the settings are not served or read-only, and it drops the
		* staged edits when the page is left.
		* @module dsh-browser/client/card-frame
		*/
		const MODE_TONE = {
			"read-only": "success",
			standard: "info",
			autonomous: "warning",
			unrestricted: "danger"
		};
		/** Everything the "needs attention" badge counts: the warnings the running plugin reported about the configuration, and the overlay warning. */
		function useWarnings(card) {
			const report = card.usePolicyStatus((snapshot) => snapshot.report);
			return {
				config: report?.configWarnings ?? [],
				overlay: report?.warning,
				overlayActive: report?.overlayActive ?? false,
				revision: report?.revision
			};
		}
		function SummaryBar({ card }) {
			const { t } = card;
			const [open, setOpen] = (0, react.useState)(false);
			const view = card.useBrowserSettings((snapshot) => ({
				enabled: snapshot.fields.enabled.text !== "false",
				mode: snapshot.fields.automationMode.text || "standard",
				surface: snapshot.fields.toolSurface.text || "indexed",
				opencli: snapshot.fields.opencliEnabled.text !== "false"
			}));
			const warnings = useWarnings(card);
			const runtime = card.usePolicyStatus((snapshot) => snapshot.runtime);
			const noBrowser = runtime !== void 0 && !runtime.browser.ready;
			const opencliMissing = view.opencli && runtime !== void 0 && !runtime.opencli.installed;
			const count = warnings.config.length + (warnings.overlay ? 1 : 0) + (noBrowser ? 1 : 0);
			const notices = [...runtime && runtime.browser.ready && runtime.browser.note ? [runtime.browser.note] : [], ...opencliMissing && runtime?.opencli.hint ? [runtime.opencli.hint] : []];
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: styles.summaryBar,
				role: "group",
				"aria-label": t("summaryTitle"),
				"data-dsb-summary": true,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("summaryTitle") }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Badge, {
						tone: view.enabled ? "success" : "neutral",
						children: view.enabled ? t("summaryEnabledOn") : t("summaryEnabledOff")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Badge, {
						tone: MODE_TONE[view.mode] ?? "neutral",
						children: [
							t("summaryMode"),
							" ",
							view.mode
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Badge, {
						tone: "neutral",
						children: [
							t("summarySurface"),
							" ",
							view.surface
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Badge, {
						tone: "neutral",
						children: !view.opencli ? t("summaryOpencliOff") : opencliMissing ? t("summaryOpencliMissing") : t("summaryOpencliOn")
					}),
					noBrowser ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Badge, {
						tone: "warning",
						children: t("summaryNoBrowser")
					}) : runtime?.browser.source === "system-browser" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Badge, {
						tone: "neutral",
						children: t("summaryBrowserSystem")
					}) : null,
					warnings.overlayActive ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Badge, {
						tone: "warning",
						children: t("summaryOverlay")
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: styles.link,
						onClick: () => setOpen(true),
						"data-dsb-warnings-count": count,
						children: [
							count ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Badge, {
								tone: "warning",
								children: fill(t("summaryWarnings"), { n: count })
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: styles.muted,
								children: t("summaryNoWarnings")
							}),
							" · ",
							t("summaryDetails")
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Dialog, {
						open,
						title: t("warningsTitle"),
						closeLabel: t("close"),
						onClose: () => setOpen(false),
						footer: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Btn, {
							onClick: () => setOpen(false),
							primary: true,
							children: t("close")
						}),
						children: [
							count === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: styles.rowHint,
								children: t("warningsNone")
							}) : null,
							noBrowser ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: styles.stack,
								"data-dsb-runtime-warning": true,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("warningsNoBrowser") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: `${styles.rowHint} dsb-bad`,
									role: "alert",
									children: runtime?.browser.installAdvice
								})]
							}) : null,
							warnings.config.length ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: styles.stack,
								"data-dsb-config-warnings": true,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("warningsConfig") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", { children: warnings.config.map((warning, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: warning }, index)) })]
							}) : null,
							notices.length ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: styles.stack,
								"data-dsb-runtime-notices": true,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("noticesRuntime") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", { children: notices.map((notice, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: notice }, index)) })]
							}) : null,
							warnings.overlay ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: styles.stack,
								"data-dsb-policy-warning": true,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("warningsOverlay") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: `${styles.rowHint} dsb-bad`,
									role: "alert",
									children: warnings.overlay
								})]
							}) : null
						]
					})
				]
			});
		}
		function SaveBar({ card }) {
			const { t } = card;
			const state = card.useBrowserSettings((snapshot) => snapshot);
			const count = state.changes.length;
			const blocked = !state.dirty || state.invalid || state.saving;
			const floating = state.dirty || state.saving || state.failed;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: styles.savebar,
				role: "region",
				"aria-label": t("save"),
				"data-dsb-savebar": true,
				"data-dsb-floating": floating ? "" : void 0,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: styles.saveText,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						"data-dsb-unsaved": count,
						children: state.invalid ? t("savebarInvalid") : count ? fill(t("savebarDirty"), { n: count }) : t("savebarClean")
					}), state.failed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "dsb-bad",
						role: "status",
						children: t("saveFailed")
					}) : null]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: styles.actions,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Btn, {
						onClick: card.discard,
						disabled: !state.dirty || state.saving,
						data: "discard",
						children: t("discardChanges")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Btn, {
						primary: true,
						onClick: card.save,
						disabled: blocked,
						data: "save",
						children: state.saving ? t("saving") : t("save")
					})]
				})]
			});
		}
		/** The page frame: nothing but a notice while the settings are not served; the staged edits are dropped when the page is left. */
		function Frame({ card, children }) {
			const { t } = card;
			const state = card.useBrowserSettings((snapshot) => ({
				available: snapshot.available,
				writable: snapshot.writable
			}));
			const discard = (0, react.useRef)(card.discard);
			discard.current = card.discard;
			(0, react.useEffect)(() => () => {
				discard.current();
			}, []);
			if (!state.available) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: styles.notice,
				role: "status",
				children: t("unavailable")
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: styles.root,
				"data-dsb-root": true,
				children: [!state.writable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: styles.notice,
					role: "status",
					children: t("readOnly")
				}) : null, children]
			});
		}
		//#endregion
		//#region src/client/group-access.tsx
		/**
		* "Sign-in and permissions": which login profiles exist and where they may be used, which one is the default, whether an
		* agent may put private-network names in them, and what agents have changed on top (the policy overlay).
		*
		* The profile list is a list: a row per profile, a dialog to edit one or add one. The dialog stages its result like any
		* other control, and the page's Save writes it. The overlay's audit trail is behind "View change log" instead of being
		* spread over the page.
		* @module dsh-browser/client/group-access
		*/
		const ACCESS_FIELDS = [
			"defaultAuthProfile",
			"allowPrivateHosts",
			"storageStatePath"
		];
		/** The staged profiles, and what the running plugin reports about them (the overlay's origin, the login-state directory). */
		function useProfiles(card) {
			const staged = card.useBrowserSettings((snapshot) => snapshot.jsonFields.authProfiles?.text ?? "");
			const disabled = card.useBrowserSettings((snapshot) => !snapshot.writable);
			const policy = card.usePolicyStatus((snapshot) => snapshot);
			const profiles = parseProfiles(staged);
			return {
				profiles,
				ids: Object.keys(profiles).sort(),
				disabled,
				report: policy.report,
				policy
			};
		}
		function ProfileDialog(props) {
			const { card, entry } = props;
			const { t } = card;
			const editing = props.id !== void 0;
			const [id, setId] = (0, react.useState)(props.id ?? "");
			const [domains, setDomains] = (0, react.useState)(entry?.allowedDomains ?? []);
			const [persist, setPersist] = (0, react.useState)(entry?.persistState ?? false);
			const [confirmRemove, setConfirmRemove] = (0, react.useState)(false);
			const idRefused = editing ? void 0 : id === "" ? void 0 : idProblem(id, props.existing);
			const path = entry?.storageStatePath ?? (props.authDir && id ? profilePathFor(props.authDir, id) : void 0);
			const complete = (editing || id !== "" && !idRefused) && domains.length > 0 && path !== void 0;
			const save = () => {
				if (!complete || path === void 0) return;
				card.saveAuthProfile(editing ? props.id : id, {
					storageStatePath: path,
					allowedDomains: domains,
					persistState: persist
				});
				props.onClose();
			};
			const privateDomains = domains.filter(isPrivateName);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Dialog, {
				open: true,
				title: editing ? t("authEdit") : t("authNew"),
				closeLabel: t("close"),
				onClose: props.onClose,
				footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
					editing ? confirmRemove ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Btn, {
						danger: true,
						disabled: props.disabled,
						onClick: () => {
							card.removeAuthProfile(props.id);
							props.onClose();
						},
						data: "auth-remove-confirm",
						children: t("authRemoveConfirm")
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Btn, {
						danger: true,
						disabled: props.disabled,
						onClick: () => setConfirmRemove(true),
						data: "auth-remove",
						children: t("authRemove")
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Btn, {
						onClick: props.onClose,
						data: "auth-cancel",
						children: t("cancel")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Btn, {
						primary: true,
						disabled: !complete || props.disabled,
						onClick: save,
						data: "auth-save",
						children: t("done")
					})
				] }),
				children: [
					confirmRemove ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: styles.rowHint,
						role: "note",
						children: t("authRemoveNote")
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Row, {
						id: "dsb-auth-id",
						label: t("authId"),
						hint: t("authIdHint"),
						invalid: !!idRefused,
						problem: idRefused ? t(idRefused) : void 0,
						labels: rowLabels(t),
						wide: true,
						children: editing ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: props.id }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextInput, {
							id: "dsb-auth-id",
							value: id,
							invalid: !!idRefused,
							disabled: props.disabled,
							placeholder: "work-portal",
							code: true,
							onChange: setId
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Row, {
						id: "dsb-auth-domains",
						label: t("authDomains"),
						hint: t("authDomainsHint"),
						invalid: domains.length === 0,
						problem: t("authDomainsEmpty"),
						labels: rowLabels(t),
						wide: true,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Chips, {
							id: "dsb-auth-domains",
							values: domains,
							disabled: props.disabled,
							placeholder: "example.com",
							addLabel: t("authDomains"),
							removeLabel: t("remove"),
							onChange: setDomains,
							check: (value) => {
								const refused = domainProblem(value);
								return refused ? t(refused) : void 0;
							}
						}), privateDomains.length ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: styles.rowHint,
							role: "note",
							children: t("authDomainPrivate")
						}) : null]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Row, {
						label: t("authPersist"),
						hint: t("authPersistHint"),
						help: t("authPersistHelp"),
						labels: rowLabels(t),
						inline: true,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Toggle, {
							label: t("authPersist"),
							checked: persist,
							disabled: props.disabled,
							onChange: setPersist
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Row, {
						label: t("authPath"),
						hint: t("authPathHint"),
						labels: rowLabels(t),
						wide: true,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
							"data-dsb-auth-path": true,
							className: "dsb-preview",
							children: path ?? t("authPathUnknown")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: styles.rowHint,
							children: t("authPathRule")
						})]
					})
				]
			});
		}
		/** The login profiles: a row each, an edit dialog, and an add button. */
		function ProfileList({ card }) {
			const { t } = card;
			const { profiles, ids, disabled, report, policy } = useProfiles(card);
			const [dialog, setDialog] = (0, react.useState)();
			const effective = new Map((report?.authProfiles ?? []).map((profile) => [profile.id, profile]));
			const overlayOnly = (report?.authProfiles ?? []).filter((profile) => profile.origin === "overlay-created" && !(profile.id in profiles));
			const origin = (value) => value === "overlay-changed" ? t("authOriginChanged") : value === "overlay-created" ? t("authOriginCreated") : "";
			const row = (id, entry, overlayCreated = false) => {
				const live = effective.get(id);
				const domains = live && live.origin !== "baseline" ? live.allowedDomains : entry.allowedDomains;
				const persistState = live && live.origin !== "baseline" ? live.persistState : entry.persistState;
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Item, {
					data: id,
					title: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: id }),
					badges: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Badge, {
							tone: "neutral",
							children: fill(t("authDomainsCount"), { n: domains.length })
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Badge, {
							tone: persistState ? "info" : "outline",
							children: persistState ? t("authPersistOn") : t("authPersistOff")
						}),
						live && live.origin !== "baseline" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Badge, {
							tone: "warning",
							children: origin(live.origin)
						}) : null
					] }),
					meta: overlayCreated ? t("authOverlayOnly") : domains.join(", ") || "—",
					actions: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [live && live.origin !== "baseline" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: styles.link,
						disabled: policy.busy,
						onClick: () => void card.clearPolicyOverlay("authProfile", id),
						children: t("authRevert")
					}) : null, overlayCreated ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Btn, {
						disabled,
						onClick: () => setDialog({ id }),
						data: "auth-edit",
						children: t("edit")
					})] })
				}, id);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Row, {
				field: "authProfiles",
				label: t("authProfiles"),
				hint: t("authProfilesHint"),
				help: t("authProfilesHelp"),
				labels: rowLabels(t),
				wide: true,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: styles.list,
						"data-dsb-profiles": true,
						children: [
							ids.length === 0 && overlayOnly.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: styles.empty,
								children: t("authProfilesEmpty")
							}) : null,
							ids.map((id) => row(id, profiles[id])),
							overlayOnly.map((profile) => row(profile.id, {
								storageStatePath: profile.storageStatePath ?? "",
								allowedDomains: profile.allowedDomains,
								persistState: profile.persistState
							}, true))
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Btn, {
						disabled,
						onClick: () => setDialog({}),
						data: "auth-add",
						children: t("authAdd")
					}) }),
					dialog ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProfileDialog, {
						card,
						id: dialog.id,
						entry: dialog.id ? profiles[dialog.id] : void 0,
						existing: ids,
						authDir: report?.authDir,
						disabled,
						onClose: () => setDialog(void 0)
					}, dialog.id ?? "\0new") : null
				]
			});
		}
		/** The default profile, picked from the list above (a stored name that is not in it is shown as missing). */
		function DefaultProfileRow({ card }) {
			const { t } = card;
			const { ids } = useProfiles(card);
			const field = useField(card, "defaultAuthProfile");
			const id = controlId("defaultAuthProfile");
			const current = field.state.text;
			const missing = current !== "" && !ids.includes(current);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Row, {
				field: "defaultAuthProfile",
				id,
				label: t("defaultAuthProfile"),
				hint: t("defaultAuthProfileHint"),
				overridden: field.state.overridden,
				invalid: field.state.invalid || missing,
				problem: missing ? `${current} ${t("defaultAuthProfileMissing")}` : t("invalid"),
				disabled: field.disabled,
				labels: rowLabels(t),
				onReset: field.reset,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Select, {
					id,
					value: current === "" ? "__none__" : current,
					muted: !field.state.overridden,
					invalid: missing,
					disabled: field.disabled,
					options: [{
						value: "__none__",
						label: t("defaultAuthProfileNone")
					}, ...ids.map((entry) => ({
						value: entry,
						label: entry
					}))],
					onChange: (value) => field.edit(value === "__none__" ? "" : value)
				})
			});
		}
		/** What agents changed on top of this page's settings: a status line, the change log in a dialog, and the way back to the baseline. */
		function OverlayRows({ card }) {
			const { t } = card;
			const state = card.usePolicyStatus((snapshot) => snapshot);
			const saving = card.useBrowserSettings((snapshot) => snapshot.saving);
			const { refreshPolicyStatus } = card;
			(0, react.useEffect)(() => {
				if (!saving) refreshPolicyStatus();
			}, [saving, refreshPolicyStatus]);
			const [open, setOpen] = (0, react.useState)(false);
			const report = state.report;
			const origin = (value) => t({
				baseline: "policyOriginBaseline",
				"overlay-changed": "policyOriginChanged",
				"overlay-created": "policyOriginCreated"
			}[value]);
			const direction = (value) => t({
				tighten: "policyTightened",
				loosen: "policyLoosened",
				none: "policyUnchanged"
			}[value]);
			const usage = report ? Object.entries(report.usagePolicy).filter(([, entry]) => entry.overridden) : [];
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				"data-dsb-policy": true,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Row, {
					label: t("policyOverlay"),
					hint: t("policyOverlayHint"),
					help: t("policyOverlayHelp"),
					labels: rowLabels(t),
					wide: true,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: styles.item,
						"data-dsb-policy-status": true,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: styles.itemMain,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: styles.itemTitle,
								"data-dsh-browser-policy-revision": true,
								children: state.loading && !report ? t("promptsLoading") : state.failed ? t("policyUnavailable") : report?.overlayActive ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Badge, {
									tone: "warning",
									children: fill(t("policyOverlayActive"), { n: report.revision })
								}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: styles.muted,
									children: t("policyOverlayIdle")
								})
							}), report?.warning ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dsb-bad",
								role: "alert",
								"data-dsh-browser-policy-warning": true,
								children: report.warning
							}) : null]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: styles.itemActions,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Btn, {
								onClick: () => setOpen(true),
								data: "policy-audit",
								children: t("policyAuditOpen")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Btn, {
								disabled: state.busy || !report || !report.overlayActive && !report.warning,
								onClick: () => void card.clearPolicyOverlay("all"),
								data: "policy-clear",
								children: t("policyClearAll")
							})]
						})]
					}), state.error ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "dsb-bad",
						role: "alert",
						children: state.error
					}) : null]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Dialog, {
					open,
					wide: true,
					title: t("policyAuditTitle"),
					closeLabel: t("close"),
					onClose: () => setOpen(false),
					footer: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Btn, {
						primary: true,
						onClick: () => setOpen(false),
						children: t("close")
					}),
					children: report ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
							className: styles.rowHint,
							"data-dsh-browser-policy-meta": true,
							children: [
								t("policyRevision"),
								" ",
								report.revision,
								report.updatedAt ? ` · ${new Date(report.updatedAt).toLocaleString()}` : "",
								" · ",
								report.overlayActive ? t("policyActive") : t("policyInactive"),
								" · ",
								t("policyAuthDirLabel"),
								": ",
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: report.authDir })
							]
						}),
						report.warning ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "dsb-bad",
							role: "alert",
							children: report.warning
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SubHead, { children: t("policyProfiles") }),
						report.authProfiles.length ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: styles.list,
							"data-dsh-browser-policy-profiles": true,
							children: report.authProfiles.map((profile) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Item, {
								data: profile.id,
								title: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: profile.id }),
								badges: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Badge, {
									tone: profile.origin === "baseline" ? "outline" : "warning",
									children: origin(profile.origin)
								}),
								meta: `${profile.allowedDomains.join(", ")} · persistState=${String(profile.persistState)}`
							}, profile.id))
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: styles.empty,
							children: t("policyNoProfiles")
						}),
						report.removedByOverlay.length ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
							className: styles.rowHint,
							"data-dsh-browser-policy-removed": true,
							children: [
								t("policyRemovedLabel"),
								": ",
								report.removedByOverlay.join(", ")
							]
						}) : null,
						usage.length ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SubHead, { children: t("policyUsageEffective") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: styles.list,
							"data-dsh-browser-policy-usage": true,
							children: usage.map(([key, entry]) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Item, {
								title: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("code", { children: [
									key,
									" = ",
									entry.value
								] }),
								meta: `${t("policyBaselineWas")} ${entry.baseline}`
							}, key))
						})] }) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SubHead, { children: t("policyAudit") }),
						report.audit.length ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: styles.list,
							"data-dsh-browser-policy-audit": true,
							children: [...report.audit].reverse().map((entry) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Item, {
								title: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
									"r",
									entry.revision,
									" · ",
									entry.action,
									" ",
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Badge, {
										tone: entry.direction === "loosen" ? "warning" : entry.direction === "tighten" ? "success" : "outline",
										children: direction(entry.direction)
									})
								] }),
								meta: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
									new Date(entry.at).toLocaleString(),
									" · ",
									entry.source,
									entry.session ? ` ${entry.session}` : "",
									" · ",
									entry.reason,
									entry.changes.length ? ` — ${entry.changes.join("; ")}` : ""
								] })
							}, entry.revision))
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: styles.empty,
							children: t("policyNoAudit")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: styles.rowHint,
							children: t("policyUnrestrictedNote")
						})
					] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: styles.empty,
						children: state.failed ? t("policyUnavailable") : t("promptsLoading")
					})
				})]
			});
		}
		function AccessGroup({ card }) {
			const { t } = card;
			const count = useOverriddenCount(card, [...ACCESS_FIELDS, "authProfiles"]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Group, {
				id: "access",
				title: t("groupAccess"),
				summary: t("groupAccessSub"),
				badges: count ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Badge, {
					tone: "info",
					children: fill(t("overriddenCount"), { n: count })
				}) : null,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProfileList, { card }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(DefaultProfileRow, { card }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SwitchRow, {
						card,
						name: "allowPrivateHosts",
						risk: t("riskNote")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(OverlayRows, { card }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Fold, {
						id: "access-legacy",
						title: t("browserAdvanced"),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextRow, {
							card,
							name: "storageStatePath",
							code: true
						})
					})
				]
			});
		}
		//#endregion
		//#region src/client/group-advanced.tsx
		/**
		* "Advanced: text mode": the default parameters as one commented `key = value` text, for people who prefer to read and
		* edit them that way. It is a view of the controls above, not a second place the settings live: editing the text stages
		* the same fields, and editing a control prints the text again. Every key has a comment in front of it (what it is for,
		* the allowed values, the default, the risk); comment lines are ignored when the text is read.
		* @module dsh-browser/client/group-advanced
		*/
		/** A public field the card has no form for, on purpose: its name, what it is for, and where to edit it. */
		function ConfigFileNote({ card, name }) {
			const { t } = card;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: styles.field,
				"data-dsh-browser-config-note": name,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: styles.fieldHead,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: styles.label,
						children: t(name)
					})
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
					className: styles.hint,
					children: [
						t(`${name}Hint`),
						" ",
						t("configFileOnly")
					]
				})]
			});
		}
		function AdvancedGroup({ card }) {
			const { t } = card;
			const view = card.useBrowserSettings((snapshot) => snapshot.properties);
			const disabled = card.useBrowserSettings((snapshot) => !snapshot.writable);
			const [copied, setCopied] = (0, react.useState)(false);
			const lang = t("lang");
			const { setPropertyLanguage } = card;
			(0, react.useEffect)(() => {
				setPropertyLanguage(lang);
			}, [lang, setPropertyLanguage]);
			const errors = view.issues.filter((issue) => issue.level === "error");
			const warnings = view.issues.filter((issue) => issue.level === "warning");
			const id = "plugin-config-dsh-browser-properties";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Group, {
				id: "advanced",
				title: t("groupAdvanced"),
				summary: t("groupAdvancedSub"),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: styles.stack,
					"data-dsh-browser-properties": true,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Row, {
							id,
							label: t("propertiesEditor"),
							hint: t("advancedHint"),
							labels: rowLabels(t),
							wide: true,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
									id,
									className: `${styles.input} ${styles.textarea} ${styles.code} ${errors.length ? styles.invalidInput : ""}`,
									rows: 26,
									spellCheck: false,
									"data-dsb-mirror": true,
									disabled,
									"aria-invalid": errors.length > 0 || void 0,
									value: view.text,
									onChange: (event) => {
										setCopied(false);
										card.editProperties(event.currentTarget.value);
									}
								}),
								errors.length ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
									className: styles.failed,
									role: "alert",
									"data-dsh-browser-properties-errors": true,
									children: errors.map((issue, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: issue.message }, index))
								}) : null,
								warnings.length ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
									className: styles.hint,
									"data-dsh-browser-properties-warnings": true,
									children: warnings.map((issue, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: issue.message }, index))
								}) : null,
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: styles.hint,
									children: t("propertiesFormat")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Btn, {
									onClick: () => {
										navigator.clipboard?.writeText(view.text).then(() => setCopied(true)).catch(() => void 0);
									},
									data: "properties-copy",
									children: copied ? t("advancedCopied") : t("advancedCopy")
								}) })
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: styles.notice,
							role: "note",
							children: t("advancedNote")
						}),
						CONFIG_FILE_ONLY_FIELDS.map((name) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ConfigFileNote, {
							card,
							name
						}, name))
					]
				})
			});
		}
		//#endregion
		//#region src/client/group-assets.tsx
		/**
		* "Automation assets": reusable recipes and userscripts. The group is a list (a suggestion row per candidate the plugin
		* wants summarized, a row per asset) and ONE editor dialog; it does not lay the editor out beside the list any more.
		*
		* The editing logic is unchanged and lives in `automation-assets-client.ts`: every way out of unsaved edits (closing the
		* dialog, creating, forking, converting, refreshing) goes through a request/confirm pair, which this dialog shows as a
		* confirmation inside itself. Closing the dialog is a request to select nothing.
		* @module dsh-browser/client/group-assets
		*/
		const STATUS_TONE = {
			active: "success",
			draft: "info",
			archived: "outline"
		};
		function AssetsGroup({ card }) {
			const { t } = card;
			const state = card.useAutomationAssets((snapshot) => snapshot);
			const { editor, selected } = state;
			const dirty = isDirty(editor.text, editor.baseline);
			const credentials = credentialView(selected);
			const draft = selected?.status === "draft";
			(0, react.useEffect)(() => {
				if (!dirty) return void 0;
				const guard = (event) => {
					event.preventDefault();
					event.returnValue = "";
				};
				window.addEventListener("beforeunload", guard);
				return () => window.removeEventListener("beforeunload", guard);
			}, [dirty]);
			const candidates = state.snapshot?.candidates.filter((candidate) => candidate.suggestedAt && !candidate.dismissedAt) ?? [];
			const assets = state.snapshot?.assets ?? [];
			const noticeLabel = (kind) => t({
				json: "assetNoticeJson",
				backend: "assetNoticeBackend",
				validation: "assetNoticeValidation",
				refused: "assetNoticeRefused"
			}[kind]);
			const saveFirst = dirty || !selected;
			const latest = credentials.latest;
			const sets = latest?.revision === selected?.revision ? inputSetLines(latest) : [];
			const suspect = latest && sets.length ? identicalOutputPairs(latest) : [];
			const required = state.snapshot?.policy.minInputSetsForActivation ?? 1;
			const shortfall = selected && draft && credentials.vouches ? inputSetShortfall(selected, credentials.current, required) : void 0;
			const shortfallText = shortfall ? fill(t("assetNeedsInputSets"), {
				required: shortfall.required,
				covered: shortfall.covered
			}) : "";
			const convertible = !!selected && selected.kind === "recipe" && (selected.schemaVersion ?? 1) === 1;
			const editing = !!selected || editor.text !== "";
			const open = (id) => card.requestSelectAutomationAsset(id);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Group, {
				id: "assets",
				title: t("groupAssets"),
				summary: t("groupAssetsSub"),
				badges: assets.length ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Badge, {
					tone: "neutral",
					children: assets.length
				}) : null,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: styles.stack,
					"data-dsh-browser-assets": true,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: styles.rowHint,
							children: t("assetLibraryHint")
						}),
						state.loading ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: styles.notice,
							children: t("assetLoading")
						}) : null,
						state.failed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: styles.failed,
							role: "alert",
							children: state.error || t("assetFailed")
						}) : null,
						candidates.length ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: styles.list,
							"data-dsb-asset-candidates": true,
							children: candidates.map((candidate) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Item, {
								data: candidate.id,
								title: candidate.title,
								meta: `${candidate.domain} · ${candidate.successfulRuns} ${t("assetRuns")} · ${candidate.distinctSessions} ${t("assetSessions")}`,
								badges: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Badge, {
									tone: "info",
									children: t("assetSuggestions")
								}),
								actions: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Btn, {
									disabled: state.busy,
									onClick: () => card.dismissAutomationCandidate(candidate.id),
									children: t("assetDismiss")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Btn, {
									primary: true,
									disabled: state.busy,
									onClick: () => card.summarizeAutomationCandidate(candidate.id),
									children: t("assetSummarize")
								})] })
							}, candidate.id))
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: styles.assetToolbar,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("assetScripts") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: styles.hint,
								children: t("assetScriptsHint")
							})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: styles.actions,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Btn, {
										onClick: () => card.requestNewAutomationAsset("recipe"),
										data: "asset-new-recipe",
										children: t("assetNewRecipe")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Btn, {
										onClick: () => card.requestNewAutomationAsset("userscript"),
										data: "asset-new-script",
										children: t("assetNewScript")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Btn, {
										onClick: card.requestRefreshAutomationAssets,
										data: "asset-refresh",
										children: t("assetRefresh")
									})
								]
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: styles.list,
							"data-dsb-asset-list": true,
							children: assets.length ? assets.map((asset) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Item, {
								data: asset.id,
								title: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: styles.link,
									onClick: () => open(asset.id),
									children: asset.name
								}),
								badges: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Badge, {
									tone: "neutral",
									children: asset.kind
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Badge, {
									tone: STATUS_TONE[asset.status] ?? "outline",
									children: asset.status
								})] }),
								meta: `r${asset.revision} · ${asset.testStatus}`,
								actions: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Btn, {
									onClick: () => open(asset.id),
									data: "asset-open",
									children: t("edit")
								})
							}, asset.id)) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: styles.empty,
								children: t("assetEmpty")
							})
						})
					]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Dialog, {
					open: editing,
					wide: true,
					title: selected?.name ?? t("assetNewTitle"),
					closeLabel: t("close"),
					onClose: () => card.requestSelectAutomationAsset(void 0),
					footer: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Btn, {
						onClick: () => card.requestSelectAutomationAsset(void 0),
						data: "asset-close",
						children: t("close")
					}),
					children: [editor.confirm ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: styles.failed,
						role: "alertdialog",
						"aria-label": t("assetLeaveTitle"),
						"data-dsh-browser-leave": true,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("assetLeaveTitle") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: styles.actions,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Btn, {
								onClick: card.cancelLeaveAutomationAsset,
								children: t("assetLeaveKeep")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Btn, {
								primary: true,
								onClick: card.confirmLeaveAutomationAsset,
								children: t("assetLeaveConfirm")
							})]
						})]
					}) : null, /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: styles.assetEditor,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: styles.label,
								htmlFor: "dsh-browser-asset-editor",
								children: [t("assetEditor"), dirty ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [" · ", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									"data-dsh-browser-dirty": true,
									children: t("assetEditorDirtyBadge")
								})] }) : null]
							}),
							selected ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: styles.hint,
								"data-dsh-browser-version": true,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [
										t("assetRevision"),
										" r",
										selected.revision,
										" · ",
										t("assetHash"),
										" ",
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: shortHash(selected.contentHash) }),
										" · ",
										selected.status,
										selected.sourceAssetId ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
											" · ",
											t("assetDerivedFrom"),
											" ",
											selected.sourceAssetId.slice(0, 8),
											" r",
											selected.sourceRevision
										] }) : null
									] }),
									credentials.latest ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
										"data-dsh-browser-credential": true,
										children: [
											t("assetLastTest"),
											": r",
											credentials.latest.revision,
											" · ",
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: shortHash(credentials.latest.contentHash) }),
											" · ",
											credentials.latest.passed ? t("assetPassed") : t("assetNotPassed"),
											" (",
											credentials.latest.executionStatus,
											"/",
											credentials.latest.validationStatus,
											", ",
											credentials.latest.evidenceLevel,
											credentials.latest.legacy ? ", legacy" : "",
											") · ",
											new Date(credentials.latest.testedAt).toLocaleString(),
											" · ",
											t("assetInputsDigest"),
											" ",
											credentials.latest.inputsDigest,
											credentials.latest.revision !== selected.revision ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [" · ", t("assetStaleTest")] }) : null
										]
									}) : null,
									selected.status === "draft" && !credentials.vouches ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("assetNoTest") }) : null,
									sets.length ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										"data-dsh-browser-sets": true,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [t("assetInputSets"), latest?.plannedSets && latest.plannedSets > sets.length ? ` (${t("assetSetsRan")} ${sets.length}/${latest.plannedSets})` : ""] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", { children: sets.map((line) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
											"data-dsh-browser-set": line.set,
											children: [
												t("assetInputSet"),
												" ",
												line.set,
												" ",
												t("assetInputSetUnit"),
												" · ",
												line.passed ? t("assetPassed") : t("assetNotPassed"),
												" (",
												line.status,
												") · ",
												t("assetInputsDigest"),
												" ",
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: line.inputsDigest })
											]
										}, line.set)) })]
									}) : null,
									suspect.length ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: styles.failed,
										role: "note",
										"data-dsh-browser-suspect": true,
										children: fill(t("assetSuspect"), { pairs: suspect.map((pair) => pair.join("/")).join("; ") })
									}) : null,
									selected.pendingDisambiguation?.length ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										"data-dsh-browser-pending": true,
										children: fill(t("assetPending"), { n: selected.pendingDisambiguation.length })
									}) : null
								]
							}) : null,
							editor.converted ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: styles.notice,
								role: "status",
								"data-dsh-browser-converted": true,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: fill(t("assetConverted"), { name: editor.converted.sourceName }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", { children: editor.converted.notes.map((note, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: note }, index)) })]
							}) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
								id: "dsh-browser-asset-editor",
								"aria-label": t("assetEditor"),
								className: `${styles.input} ${styles.textarea} ${styles.code} ${editor.notice?.kind === "json" ? styles.invalidInput : ""}`,
								rows: 18,
								value: editor.text,
								spellCheck: false,
								disabled: state.busy,
								placeholder: t("assetEditorHint"),
								onChange: (event) => card.editAutomationAsset(event.currentTarget.value)
							}),
							editor.notice ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
								className: styles.failed,
								role: "alert",
								"data-dsh-browser-notice": editor.notice.kind,
								children: [
									noticeLabel(editor.notice.kind),
									editor.notice.message,
									editor.notice.code ? ` [${editor.notice.code}]` : ""
								]
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: styles.hint,
								children: dirty ? t("assetUnsaved") : t("assetSourceBoundary")
							}),
							draft || !selected ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: styles.assetTestForm,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: styles.input,
									value: editor.testUrl,
									"aria-label": t("assetTestUrl"),
									placeholder: t("assetTestUrl"),
									onChange: (event) => card.setAssetTestUrl(event.currentTarget.value)
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
									className: `${styles.input} ${styles.textarea} ${styles.code}`,
									rows: 3,
									value: editor.testInputs,
									spellCheck: false,
									"aria-label": t("assetTestInputs"),
									onChange: (event) => card.setAssetTestInputs(event.currentTarget.value)
								})]
							}) : null,
							shortfall ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: styles.hint,
								role: "note",
								"data-dsh-browser-activation-hint": true,
								children: shortfallText
							}) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: styles.actions,
								children: [
									selected ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Btn, {
										disabled: state.busy || dirty,
										onClick: () => card.validateAutomationAsset(selected.id),
										children: t("assetValidate")
									}) : null,
									draft || !selected ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Btn, {
										disabled: state.busy || !editor.testUrl.trim() || !editor.text,
										onClick: () => void card.saveAndTestAutomationAsset(),
										children: saveFirst ? t("assetSaveAndTest") : t("assetTest")
									}) : null,
									draft ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Btn, {
										disabled: state.busy || dirty || !credentials.vouches || !!shortfall,
										title: dirty ? t("assetActivateNeedsSave") : shortfallText || void 0,
										onClick: () => void card.activateAutomationAsset(),
										children: [
											t("assetActivate"),
											" r",
											selected.revision
										]
									}) : null,
									convertible ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Btn, {
										disabled: state.busy,
										onClick: () => card.requestConvertAutomationAsset(selected.id),
										children: t("assetConvert")
									}) : null,
									selected && selected.status !== "draft" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Btn, {
										disabled: state.busy,
										onClick: () => card.requestForkAutomationAsset(selected.id),
										children: t("assetFork")
									}) : null,
									selected && selected.status !== "archived" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Btn, {
										disabled: state.busy,
										onClick: () => card.setAutomationAssetStatus(selected.id, "archived"),
										children: t("assetArchive")
									}) : null,
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Btn, {
										primary: true,
										disabled: state.busy || !editor.text || selected?.status === "active",
										onClick: () => void card.saveEditedAutomationAsset(),
										children: t("assetSaveDraft")
									})
								]
							})
						]
					})]
				})]
			});
		}
		//#endregion
		//#region src/client/group-browser.tsx
		/**
		* "Browser": which engine runs and how. Four everyday choices up front; the rest folded under "Advanced".
		* @module dsh-browser/client/group-browser
		*/
		const BROWSER_FIELDS = [
			"browserRuntime",
			"channel",
			"headless",
			"autoInstall",
			"executablePath",
			"cdpPort",
			"maxSessions",
			"args",
			"snapshotDir",
			"verbose"
		];
		/** The Chromium launch arguments as chips; the staged text is a JSON array (or empty). */
		function ArgsRow({ card }) {
			const { t } = card;
			const field = useField(card, "args");
			let values = [];
			try {
				const parsed = field.state.text.trim() === "" ? [] : JSON.parse(field.state.text);
				if (Array.isArray(parsed)) values = parsed.filter((entry) => typeof entry === "string");
			} catch {}
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Row, {
				field: "args",
				id: controlId("args"),
				label: t("args"),
				hint: t("argsHint"),
				help: t("argsHelp"),
				overridden: field.state.overridden,
				invalid: field.state.invalid,
				problem: t("invalid"),
				disabled: field.disabled,
				labels: rowLabels(t),
				onReset: field.reset,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Chips, {
					id: controlId("args"),
					values,
					disabled: field.disabled,
					placeholder: t("argsPlaceholder"),
					addLabel: t("args"),
					removeLabel: t("remove"),
					onChange: (next) => field.edit(next.length ? JSON.stringify(next) : "")
				})
			});
		}
		function BrowserGroup({ card }) {
			const { t } = card;
			const count = useOverriddenCount(card, BROWSER_FIELDS);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Group, {
				id: "browser",
				title: t("groupBrowser"),
				summary: t("groupBrowserSub"),
				badges: count ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Badge, {
					tone: "info",
					children: fill(t("overriddenCount"), { n: count })
				}) : null,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SelectRow, {
						card,
						name: "browserRuntime",
						options: [{
							value: "playwright",
							label: "playwright"
						}, {
							value: "patchright",
							label: "patchright"
						}]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SelectRow, {
						card,
						name: "channel",
						options: [
							{
								value: "chromium",
								label: "chromium"
							},
							{
								value: "chrome",
								label: "chrome"
							},
							{
								value: "msedge",
								label: "msedge"
							}
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SwitchRow, {
						card,
						name: "headless"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SwitchRow, {
						card,
						name: "autoInstall"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Fold, {
						id: "browser-advanced",
						title: t("browserAdvanced"),
						hint: t("browserAdvancedHint"),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextRow, {
								card,
								name: "executablePath",
								code: true
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(NumberRow, {
								card,
								name: "cdpPort"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(NumberRow, {
								card,
								name: "maxSessions"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ArgsRow, { card }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextRow, {
								card,
								name: "snapshotDir",
								code: true
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SwitchRow, {
								card,
								name: "verbose"
							})
						]
					})
				]
			});
		}
		//#endregion
		//#region src/client/group-common.tsx
		/**
		* "Common": the four settings nearly everyone touches. Open by default; every other group starts closed.
		* @module dsh-browser/client/group-common
		*/
		/** The names of the common group's fields, in order. */
		const COMMON_FIELDS = [
			"enabled",
			"automationMode",
			"toolSurface",
			"opencliEnabled"
		];
		const MODE_LINES = {
			"read-only": "modeReadOnlyLine",
			standard: "modeStandardLine",
			autonomous: "modeAutonomousLine",
			unrestricted: "modeUnrestrictedLine"
		};
		function CommonGroup({ card }) {
			const { t } = card;
			const count = useOverriddenCount(card, COMMON_FIELDS);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Group, {
				id: "common",
				title: t("groupCommon"),
				summary: t("groupCommonSub"),
				defaultOpen: true,
				badges: count ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Badge, {
					tone: "info",
					children: fill(t("overriddenCount"), { n: count })
				}) : null,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SwitchRow, {
						card,
						name: "enabled"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SelectRow, {
						card,
						name: "automationMode",
						hint: (text) => t(MODE_LINES[text] ?? "automationModeHint"),
						options: [
							{
								value: "read-only",
								label: t("modeReadOnly")
							},
							{
								value: "standard",
								label: t("modeStandard")
							},
							{
								value: "autonomous",
								label: t("modeAutonomous")
							},
							{
								value: "unrestricted",
								label: t("modeUnrestricted")
							}
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SelectRow, {
						card,
						name: "toolSurface",
						options: [{
							value: "indexed",
							label: t("surfaceIndexed")
						}, {
							value: "flat",
							label: t("surfaceFlat")
						}]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SwitchRow, {
						card,
						name: "opencliEnabled"
					})
				]
			});
		}
		//#endregion
		//#region src/client/group-context.tsx
		/**
		* "Page environment": what every new browser context starts from (viewport, user agent, language, time zone, proxy).
		* The agent copies these for a task and changes only what the task needs, so they are plain defaults here.
		*
		* Conditional rows (the custom size, the proxy address) exist only while they apply; the settings are still in the
		* configuration when hidden, which is what lets the render test count every public field exactly once.
		* @module dsh-browser/client/group-context
		*/
		const CONTEXT_FIELDS = [
			"viewportMode",
			"viewportWidth",
			"viewportHeight",
			"userAgent",
			"locale",
			"timezoneId",
			"proxyServer",
			"proxyBypass"
		];
		/** Common user agents; the browser's own is the empty one. Version numbers are examples: a site that checks them needs the custom entry. */
		const USER_AGENT_PRESETS = {
			chromeMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
			chromeWin: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
			iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
		};
		const LOCALE_SUGGESTIONS = [
			"en-US",
			"en-GB",
			"zh-CN",
			"zh-TW",
			"ja-JP",
			"ko-KR",
			"de-DE",
			"fr-FR",
			"es-ES",
			"pt-BR",
			"ru-RU"
		];
		const TIMEZONE_FALLBACK = [
			"UTC",
			"Asia/Shanghai",
			"Asia/Tokyo",
			"Asia/Singapore",
			"Europe/London",
			"Europe/Berlin",
			"America/New_York",
			"America/Los_Angeles"
		];
		const CUSTOM = "__custom__";
		function timeZones() {
			try {
				const list = Intl.supportedValuesOf?.("timeZone");
				if (list && list.length) return list;
			} catch {}
			return TIMEZONE_FALLBACK;
		}
		/** A preset drop-down over the user agent, with a free input when none of the presets is wanted. */
		function UserAgentRow({ card }) {
			const { t } = card;
			const field = useField(card, "userAgent");
			const [forceCustom, setForceCustom] = (0, react.useState)(false);
			const presets = [
				["", t("uaDefault")],
				[USER_AGENT_PRESETS.chromeMac, t("uaChromeMac")],
				[USER_AGENT_PRESETS.chromeWin, t("uaChromeWin")],
				[USER_AGENT_PRESETS.iphone, t("uaIphone")]
			];
			const text = field.state.text;
			const known = presets.some(([value]) => value === text);
			const custom = forceCustom || !known;
			const selected = custom ? CUSTOM : text;
			const id = controlId("userAgent");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Row, {
				field: "userAgent",
				id,
				label: t("userAgent"),
				hint: t("userAgentHint"),
				help: t("userAgentHelp"),
				overridden: field.state.overridden,
				invalid: field.state.invalid,
				problem: t("invalid"),
				disabled: field.disabled,
				labels: rowLabels(t),
				onReset: () => {
					setForceCustom(false);
					field.reset();
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Select, {
					id,
					value: selected,
					muted: !field.state.overridden,
					invalid: field.state.invalid,
					disabled: field.disabled,
					options: [...presets.map(([value, label]) => ({
						value: value || "__default__",
						label
					})), {
						value: CUSTOM,
						label: t("uaCustom")
					}],
					onChange: (value) => {
						if (value === CUSTOM) {
							setForceCustom(true);
							return;
						}
						setForceCustom(false);
						field.edit(value === "__default__" ? "" : value);
					}
				}), custom ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextInput, {
					ariaLabel: t("userAgent"),
					value: text,
					placeholder: t("uaCustomPlaceholder"),
					disabled: field.disabled,
					invalid: field.state.invalid,
					code: true,
					onChange: field.edit
				}) : null]
			});
		}
		/** The proxy switch decides whether the address and bypass rows exist; turning it off clears both settings. */
		function ProxyRows({ card }) {
			const { t } = card;
			const server = useField(card, "proxyServer");
			const bypass = useField(card, "proxyBypass");
			const [enabledByHand, setEnabledByHand] = (0, react.useState)(false);
			const on = enabledByHand || server.state.text !== "";
			const hosts = bypass.state.text.split(",").map((entry) => entry.trim()).filter(Boolean);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Row, {
				label: t("proxyEnabled"),
				hint: t("proxyEnabledHint"),
				help: t("proxyEnabledHelp"),
				labels: rowLabels(t),
				inline: true,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Toggle, {
					label: t("proxyEnabled"),
					checked: on,
					disabled: server.disabled,
					onChange: (next) => {
						setEnabledByHand(next);
						if (!next) {
							server.edit("");
							bypass.edit("");
						}
					}
				})
			}), on ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextRow, {
				card,
				name: "proxyServer",
				placeholder: "http://127.0.0.1:7890",
				code: true
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Row, {
				field: "proxyBypass",
				id: controlId("proxyBypass"),
				label: t("proxyBypass"),
				hint: t("proxyBypassHint"),
				help: t("proxyBypassHelp"),
				overridden: bypass.state.overridden,
				invalid: bypass.state.invalid,
				problem: t("invalid"),
				disabled: bypass.disabled,
				labels: rowLabels(t),
				onReset: bypass.reset,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Chips, {
					id: controlId("proxyBypass"),
					values: hosts,
					disabled: bypass.disabled,
					placeholder: t("proxyBypassPlaceholder"),
					addLabel: t("proxyBypass"),
					removeLabel: t("remove"),
					onChange: (next) => bypass.edit(next.join(","))
				})
			})] }) : null] });
		}
		function ContextGroup({ card }) {
			const { t } = card;
			const count = useOverriddenCount(card, CONTEXT_FIELDS);
			const mode = card.useBrowserSettings((snapshot) => snapshot.fields.viewportMode.text);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Group, {
				id: "context",
				title: t("groupContext"),
				summary: t("groupContextSub"),
				badges: count ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Badge, {
					tone: "info",
					children: fill(t("overriddenCount"), { n: count })
				}) : null,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SelectRow, {
						card,
						name: "viewportMode",
						options: [
							{
								value: "window",
								label: t("viewportWindow")
							},
							{
								value: "720p",
								label: t("viewport720")
							},
							{
								value: "1080p",
								label: t("viewport1080")
							},
							{
								value: "custom",
								label: t("viewportCustom")
							}
						]
					}),
					mode === "custom" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(NumberRow, {
						card,
						name: "viewportWidth",
						unit: "px",
						placeholder: "1280"
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(NumberRow, {
						card,
						name: "viewportHeight",
						unit: "px",
						placeholder: "720"
					})] }) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(UserAgentRow, { card }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextRow, {
						card,
						name: "locale",
						listId: "dsb-locales",
						placeholder: "en-US"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("datalist", {
						id: "dsb-locales",
						children: LOCALE_SUGGESTIONS.map((value) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", { value }, value))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextRow, {
						card,
						name: "timezoneId",
						listId: "dsb-timezones",
						placeholder: "Asia/Shanghai"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("datalist", {
						id: "dsb-timezones",
						children: timeZones().map((value) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", { value }, value))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProxyRows, { card })
				]
			});
		}
		//#endregion
		//#region src/client/size-units.ts
		/**
		* Byte counts as a number in a unit, for the download size control. The setting itself stays a plain byte count.
		* @module dsh-browser/client/size-units
		*/
		const SIZE_UNITS = [
			["B", 1],
			["KiB", 1024],
			["MiB", 1024 ** 2],
			["GiB", 1024 ** 3]
		];
		const factor = (unit) => SIZE_UNITS.find(([name]) => name === unit)[1];
		/** The unit a byte count is shown in: the largest that divides it exactly (MiB when there is no count). */
		function unitFor(bytes) {
			if (bytes === void 0 || !Number.isFinite(bytes) || bytes <= 0) return "MiB";
			for (const [name, size] of [...SIZE_UNITS].reverse()) if (bytes % size === 0) return name;
			return "B";
		}
		/** A byte count as the text of one unit, without a trailing ".0". */
		function bytesToUnitText(bytes, unit) {
			return String(bytes / factor(unit));
		}
		/** The bytes a number typed in a unit stands for: '' for an empty text ("unset"), undefined when it is not a positive number. */
		function unitTextToBytes(text, unit) {
			if (text.trim() === "") return "";
			const value = Number(text);
			if (!Number.isFinite(value) || value <= 0) return void 0;
			return Math.round(value * factor(unit));
		}
		//#endregion
		//#region src/client/group-downloads.tsx
		/**
		* "Downloads": where files land and how large one may be. The size is stored in bytes; the control shows the largest
		* unit that divides it exactly, so 104857600 reads as "100 MiB".
		* @module dsh-browser/client/group-downloads
		*/
		const DOWNLOAD_FIELDS = ["downloadDir", "downloadMaxBytes"];
		function MaxBytesRow({ card }) {
			const { t } = card;
			const field = useField(card, "downloadMaxBytes");
			const bytes = field.state.text.trim() === "" ? void 0 : Number(field.state.text);
			const [unit, setUnit] = (0, react.useState)();
			const shown = unit ?? unitFor(bytes);
			const [draft, setDraft] = (0, react.useState)();
			/** What a typed text stages: its bytes, or the text itself when it is not a positive number (the field is then invalid and the save refused). */
			const stagedFor = (nextText, nextUnit) => {
				const result = unitTextToBytes(nextText, nextUnit);
				return result === void 0 ? nextText : String(result);
			};
			const text = draft !== void 0 && stagedFor(draft, shown) === field.state.text ? draft : bytes !== void 0 && Number.isFinite(bytes) ? bytesToUnitText(bytes, shown) : "";
			const id = controlId("downloadMaxBytes");
			const apply = (nextText, nextUnit) => field.edit(stagedFor(nextText, nextUnit));
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Row, {
				field: "downloadMaxBytes",
				id,
				label: t("downloadMaxBytes"),
				hint: t("downloadMaxBytesHint"),
				help: t("downloadMaxBytesHelp"),
				overridden: field.state.overridden,
				invalid: field.state.invalid,
				problem: t("invalid"),
				disabled: field.disabled,
				labels: rowLabels(t),
				onReset: () => {
					setDraft(void 0);
					setUnit(void 0);
					field.reset();
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: "dsb-unit-input",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextInput, {
						id,
						value: text,
						numeric: true,
						placeholder: "100",
						muted: !field.state.overridden,
						invalid: field.state.invalid,
						disabled: field.disabled,
						onChange: (value) => {
							setUnit(shown);
							setDraft(value);
							apply(value, shown);
						}
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Select, {
						ariaLabel: t("downloadMaxBytes"),
						value: shown,
						disabled: field.disabled,
						options: SIZE_UNITS.map(([name]) => ({
							value: name,
							label: name
						})),
						onChange: (value) => {
							const next = value;
							setUnit(next);
							setDraft(text);
							apply(text, next);
						}
					})]
				})
			});
		}
		function DownloadsGroup({ card }) {
			const { t } = card;
			const count = useOverriddenCount(card, DOWNLOAD_FIELDS);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Group, {
				id: "downloads",
				title: t("groupDownloads"),
				summary: t("groupDownloadsSub"),
				badges: count ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Badge, {
					tone: "info",
					children: fill(t("overriddenCount"), { n: count })
				}) : null,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextRow, {
					card,
					name: "downloadDir",
					placeholder: "$DSH_HOME/data/browser/downloads",
					code: true
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MaxBytesRow, { card })]
			});
		}
		//#endregion
		//#region src/client/group-limits.tsx
		/**
		* "Usage limits": the call buffer as grouped number inputs with their unit, range and default, and the asset policy
		* in a fold. Each key edits the same staged JSON object the raw box (folded away under "Advanced: raw JSON") shows.
		* @module dsh-browser/client/group-limits
		*/
		const UNIT_KEYS = {
			ms: "limitsUnitMs",
			days: "limitsUnitDays",
			tokens: "limitsUnitTokens",
			count: "limitsUnitCount",
			ratio: "limitsUnitRatio"
		};
		const SECTION_KEYS = {
			candidates: "limitsSectionCandidates",
			library: "limitsSectionLibrary",
			activation: "limitsSectionActivation"
		};
		const RAW_KEY_LISTS = {
			usagePolicy: USAGE_POLICY_KEYS,
			automationAssets: ASSET_POLICY_KEYS
		};
		function PolicyKeyRow({ card, field, spec }) {
			const { t } = card;
			const state = card.useBrowserSettings((snapshot) => snapshot.policies[field][spec.key]);
			const disabled = card.useBrowserSettings((snapshot) => !snapshot.writable);
			const overlay = card.usePolicyStatus((snapshot) => field === "usagePolicy" ? snapshot.report?.usagePolicy[spec.key] : void 0);
			const id = `plugin-config-dsh-browser-${field}-${spec.key}`;
			const edit = (text) => card.editPolicyKey(field, spec.key, text);
			const range = boundsOf(field, spec.key);
			const fallback = defaultOf(field, spec.key);
			const unit = spec.unit ? t(UNIT_KEYS[spec.unit]) : "";
			const meta = [
				range ? fill(t("limitsRange"), {
					min: range[0],
					max: range[1]
				}) : "",
				fallback !== void 0 ? fill(t("limitsDefault"), { value: valueText(fallback) }) : "",
				overlay?.overridden ? fill(t("limitsOverlayNote"), {
					value: overlay.value,
					baseline: overlay.baseline
				}) : ""
			].filter(Boolean).join(" · ");
			const common = {
				disabled,
				muted: !state.overridden,
				invalid: !!state.problem
			};
			let control;
			switch (spec.kind) {
				case "bool":
					control = /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Toggle, {
						label: t(`pk_${spec.key}`),
						checked: state.text === "true",
						disabled,
						onChange: (next) => edit(String(next))
					});
					break;
				case "enum":
					control = /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Select, {
						id,
						value: state.text,
						options: (spec.options ?? []).map((value) => ({
							value,
							label: value
						})),
						...common,
						onChange: edit
					});
					break;
				case "text":
					control = /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextInput, {
						id,
						value: state.text,
						placeholder: "$DSH_HOME/data/browser/automations",
						code: true,
						...common,
						onChange: edit
					});
					break;
				default: control = /* @__PURE__ */ (0, react_jsx_runtime.jsx)(UnitInput, {
					id,
					value: state.text,
					unit,
					...common,
					onChange: edit
				});
			}
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Row, {
				policyKey: `${field}.${spec.key}`,
				id: spec.kind === "bool" ? void 0 : id,
				label: t(`pk_${spec.key}`),
				hint: t(`pk_${spec.key}Hint`),
				meta,
				overridden: state.overridden,
				invalid: !!state.problem,
				problem: state.problem ? t(state.problem) : void 0,
				disabled,
				labels: rowLabels(t),
				onReset: () => edit(""),
				inline: spec.kind === "bool",
				children: control
			});
		}
		/** The raw JSON of one policy object, the same data as its rows. */
		function RawBox({ card, field, label }) {
			const { t } = card;
			const state = card.useBrowserSettings((snapshot) => stateOf(snapshot, field));
			const disabled = card.useBrowserSettings((snapshot) => !snapshot.writable);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.SettingsValueField, {
				id: `plugin-config-dsh-browser-${field}-json`,
				label: t(label),
				hint: `${t("limitsRawHint")} ${t("policyKeys")} ${RAW_KEY_LISTS[field].join(", ")}`,
				overriddenLabel: t("overridden"),
				resetLabel: t("reset"),
				invalidLabel: t("invalidJson"),
				numeric: false,
				disabled,
				...state,
				onEdit: (text) => card.edit(field, text),
				onReset: () => card.resetField(field)
			});
		}
		function LimitsGroup({ card }) {
			const { t } = card;
			const count = card.useBrowserSettings((snapshot) => Object.values(snapshot.policies.usagePolicy).filter((entry) => entry.overridden).length + Object.values(snapshot.policies.automationAssets).filter((entry) => entry.overridden).length);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Group, {
				id: "limits",
				title: t("groupLimits"),
				summary: t("groupLimitsSub"),
				badges: count ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Badge, {
					tone: "info",
					children: fill(t("overriddenCount"), { n: count })
				}) : null,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						"data-dsb-field": "usagePolicy",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: styles.subHead,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("limitsUsageTitle") }),
									" ",
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Help, {
										label: t("helpLabel"),
										text: t("usagePolicyHelp")
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: styles.rowHint,
								children: t("limitsUsageSub")
							}),
							POLICY_SPECS.usagePolicy.map((spec) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PolicyKeyRow, {
								card,
								field: "usagePolicy",
								spec
							}, spec.key))
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Fold, {
						id: "limits-assets",
						title: t("limitsAssetsFold"),
						hint: t("limitsAssetsFoldHint"),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							"data-dsb-field": "automationAssets",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: styles.rowHint,
								children: t("automationAssetsHelp")
							}), [
								"candidates",
								"library",
								"activation"
							].map((section) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: styles.subHead,
								children: t(SECTION_KEYS[section])
							}), POLICY_SPECS.automationAssets.filter((spec) => spec.section === section).map((spec) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PolicyKeyRow, {
								card,
								field: "automationAssets",
								spec
							}, spec.key))] }, section))]
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Fold, {
						id: "limits-raw",
						title: t("limitsRawFold"),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(RawBox, {
							card,
							field: "usagePolicy",
							label: "limitsRawUsage"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RawBox, {
							card,
							field: "automationAssets",
							label: "limitsRawAssets"
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: styles.notice,
						role: "note",
						children: t("restart")
					})
				]
			});
		}
		//#endregion
		//#region src/client/group-prompts.tsx
		/**
		* "Prompts": the text the model reads, as a list. A row per text (name, default or overridden, length) and an Edit
		* dialog that puts the default text beside your override; the per-entry overrides (groups, actions, error hints) are a
		* list of only the entries you changed, with their own dialog. The budget summary stays on top and the default text can be
		* exported, as commented YAML or plain JSON.
		*
		* Every edit stages into the one `prompts` draft the page's Save writes (see form.ts); a dialog's own Save only stages.
		* @module dsh-browser/client/group-prompts
		*/
		/** Label and hint keys of each text, by id. */
		const TEXT_LABELS = {
			indexDescription: {
				label: "promptsIndexDescription",
				hint: "promptsIndexDescriptionHint"
			},
			callDescription: {
				label: "promptsCallDescription",
				hint: "promptsCallDescriptionHint"
			},
			rootGuide: {
				label: "promptsRootGuide",
				hint: "promptsRootGuideHint"
			},
			rootNote: {
				label: "promptsRootNote",
				hint: "promptsRootNoteHint"
			},
			skillDescription: {
				label: "promptsSkillDescription",
				hint: "promptsSkillDescriptionHint"
			},
			skillBodyFile: {
				label: "promptsSkillBodyFile",
				hint: "promptsSkillBodyFileHint"
			},
			skillAppend: {
				label: "promptsSkillAppend",
				hint: "promptsSkillAppendHint"
			}
		};
		const KIND_LABELS = {
			groups: "promptKindGroups",
			actions: "promptKindActions",
			errorHints: "promptKindErrorHints"
		};
		function usePrompts(card) {
			const state = card.useBrowserSettings((snapshot) => snapshot.prompts);
			const disabled = card.useBrowserSettings((snapshot) => !snapshot.writable);
			const status = card.usePromptsStatus((snapshot) => snapshot);
			return {
				state,
				disabled,
				status,
				defaults: status.defaultTexts
			};
		}
		/** The budget line and the diagnostics, from what the running plugin reports. */
		function StatusLine({ card }) {
			const { t } = card;
			const { status, state } = usePrompts(card);
			const { refreshPromptsStatus } = card;
			useRefreshAfterSave(card.useBrowserSettings((snapshot) => snapshot.saving), refreshPromptsStatus);
			const report = status.status;
			const count = report?.overrides.length ?? 0;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: styles.item,
				role: "status",
				"data-dsh-browser-prompts-status": true,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: styles.itemMain,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: styles.itemTitle,
							"data-dsh-browser-prompts-budget": true,
							children: report ? fill(t("promptsStatusLine"), {
								l0: report.budget.l0Tokens,
								l0Budget: report.budget.l0Budget,
								layer: report.budget.largestLayer.name,
								tokens: report.budget.largestLayer.tokens,
								layerBudget: report.budget.layerBudget
							}) : status.failed ? t("promptsStatusUnavailable2") : t("promptsLoading")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: styles.itemMeta,
							children: [report ? count ? fill(t("promptsStatusOverrides"), { n: count }) : t("promptsStatusNone") : "", state.invalid ? ` · ${t("invalid")}` : ""]
						}),
						report?.diagnostics.length ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Fold, {
							id: "prompts-diagnostics",
							title: fill(t("promptsStatusDiagnostics"), { n: report.diagnostics.length }),
							hint: t("promptsDiagnosticsFold"),
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
								"data-dsh-browser-prompts-diagnostics": true,
								children: report.diagnostics.map((entry, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: entry.message }, index))
							})
						}) : null
					]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: styles.itemActions,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: styles.link,
						onClick: refreshPromptsStatus,
						children: t("promptsRefresh")
					})
				})]
			});
		}
		function useRefreshAfterSave(saving, refresh) {
			(0, react.useEffect)(() => {
				if (!saving) refresh();
			}, [saving, refresh]);
		}
		/** One text: the default beside your override. Save only stages. */
		function TextDialog({ card, id, onClose }) {
			const { t } = card;
			const { state, disabled, defaults } = usePrompts(card);
			const spec = PROMPT_TEXT_FIELDS.find((entry) => entry.id === id);
			const labels = TEXT_LABELS[id];
			const base = defaults?.texts[id];
			const hasDefault = id !== "skillBodyFile" && id !== "skillAppend";
			const [draft, setDraft] = (0, react.useState)(state.texts[id].text);
			const tooLong = draft.length > spec.limit;
			const same = base !== void 0 && draft === base;
			const inputId = `plugin-config-dsh-browser-prompts-${id}`;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Dialog, {
				open: true,
				wide: true,
				title: fill(t("promptEditTitle"), { name: t(labels.label) }),
				closeLabel: t("close"),
				description: t(labels.hint),
				onClose,
				footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
					hasDefault && base !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Btn, {
						disabled: disabled || draft === base,
						onClick: () => setDraft(base),
						data: "prompt-start",
						children: t("promptStart")
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Btn, {
						disabled: disabled || draft === "",
						onClick: () => setDraft(""),
						data: "prompt-restore",
						children: t("promptRestore")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Btn, {
						onClick: onClose,
						data: "prompt-cancel",
						children: t("cancel")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Btn, {
						primary: true,
						disabled: disabled || tooLong,
						onClick: () => {
							card.editPromptText(id, draft);
							onClose();
						},
						data: "prompt-save",
						children: t("promptSave")
					})
				] }),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: styles.compare,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: styles.compareCol,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("promptDefaultCol") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
							className: styles.preview,
							"data-dsb-prompt-default": true,
							children: hasDefault ? base ?? t("promptDefaultMissing") : t("promptNoDefault")
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: styles.compareCol,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
								htmlFor: inputId,
								children: t("promptMineCol")
							}),
							spec.multiline ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
								id: inputId,
								className: `${styles.input} ${styles.textarea} ${styles.code} ${tooLong ? styles.invalidInput : ""}`,
								rows: 12,
								spellCheck: false,
								value: draft,
								disabled,
								placeholder: t("promptEmptyIsDefault"),
								"aria-invalid": tooLong || void 0,
								onChange: (event) => setDraft(event.currentTarget.value)
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextInput, {
								id: inputId,
								value: draft,
								code: true,
								disabled,
								invalid: tooLong,
								placeholder: t("promptEmptyIsDefault"),
								onChange: setDraft
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
								className: tooLong ? `${styles.rowHint} dsb-bad` : styles.rowHint,
								role: tooLong ? "alert" : void 0,
								children: [
									tooLong ? t("promptsTooLong") : same ? t("promptSameAsDefault") : "",
									" (",
									draft.length,
									"/",
									spec.limit,
									")"
								]
							})
						]
					})]
				})
			});
		}
		/** The seven texts as a list. */
		function TextList({ card }) {
			const { t } = card;
			const { state, disabled } = usePrompts(card);
			const [editing, setEditing] = (0, react.useState)();
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SubHead, { children: t("promptsListTitle") }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: styles.rowHint,
					children: t("promptsListHint")
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: styles.list,
					"data-dsb-prompt-list": true,
					children: PROMPT_TEXT_FIELDS.map((spec) => {
						const entry = state.texts[spec.id];
						const overridden = entry.text !== "" && !entry.sameAsDefault;
						return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Item, {
							data: spec.id,
							title: t(TEXT_LABELS[spec.id].label),
							badges: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Badge, {
								tone: overridden ? "info" : "outline",
								children: overridden ? t("promptStateOverridden") : t("promptStateDefault")
							}), entry.text !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Badge, {
								tone: entry.invalid ? "danger" : "neutral",
								children: fill(t("promptChars"), { n: entry.text.length })
							}) : null] }),
							meta: t(TEXT_LABELS[spec.id].hint),
							actions: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [entry.text !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: styles.link,
								disabled,
								onClick: () => card.editPromptText(spec.id, ""),
								children: t("promptRestore")
							}) : null, /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Btn, {
								disabled,
								onClick: () => setEditing(spec.id),
								data: "prompt-edit",
								children: t("edit")
							})] })
						}, spec.id);
					})
				}),
				editing ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextDialog, {
					card,
					id: editing,
					onClose: () => setEditing(void 0)
				}, editing) : null
			] });
		}
		/** One entry of the groups / actions / errorHints lists. */
		function EntryDialog({ card, entry, onClose }) {
			const { t } = card;
			const { disabled, defaults } = usePrompts(card);
			const [kind, setKind] = (0, react.useState)(entry?.kind ?? "actions");
			const [key, setKey] = (0, react.useState)(entry?.key ?? "");
			const [summary, setSummary] = (0, react.useState)(entry?.summary ?? "");
			const [notes, setNotes] = (0, react.useState)(entry?.notes ?? "");
			const [text, setText] = (0, react.useState)(entry?.text ?? "");
			const known = defaults?.extras[kind];
			const base = known?.[key];
			const baseSummary = typeof base === "object" && base !== null ? base.summary : void 0;
			const baseNotes = typeof base === "object" && base !== null ? base.notes : void 0;
			const baseText = typeof base === "string" ? base : void 0;
			const keyProblem = key !== "" && !/^[A-Za-z0-9_.-]+$/.test(key);
			const unknown = key !== "" && !keyProblem && defaults !== void 0 && !(key in (known ?? {}));
			const caps = {
				summary: PROMPT_LIMITS.summary,
				notes: PROMPT_LIMITS.topicText,
				text: PROMPT_LIMITS.errorHint
			};
			const over = kind !== "errorHints" && (summary.length > caps.summary || notes.length > caps.notes) || kind === "errorHints" && text.length > caps.text;
			const complete = key !== "" && !keyProblem && !over && (kind === "errorHints" ? text !== "" : summary !== "" || kind === "actions" && notes !== "");
			const save = () => {
				card.setPromptExtra(kind, key, kind === "errorHints" ? text : kind === "groups" ? { summary } : {
					summary,
					notes
				});
				onClose();
			};
			const field = (label, id, value, set, cap, defaultText, rows) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: styles.compare,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: styles.compareCol,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("strong", { children: [
						label,
						" · ",
						t("promptDefaultCol")
					] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
						className: styles.preview,
						children: defaultText ?? t("promptNoDefault")
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: styles.compareCol,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							htmlFor: id,
							children: [
								label,
								" · ",
								t("promptMineCol")
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
							id,
							className: `${styles.input} ${styles.textarea} ${value.length > cap ? styles.invalidInput : ""}`,
							rows,
							spellCheck: false,
							value,
							disabled,
							placeholder: t("promptEmptyIsDefault"),
							onChange: (event) => set(event.currentTarget.value)
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
							className: value.length > cap ? `${styles.rowHint} dsb-bad` : styles.rowHint,
							children: [
								"(",
								value.length,
								"/",
								cap,
								")"
							]
						})
					]
				})]
			}, id);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Dialog, {
				open: true,
				wide: true,
				title: entry ? fill(t("promptEntryEditTitle"), { key: entry.key }) : t("promptEntryNewTitle"),
				closeLabel: t("close"),
				onClose,
				footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
					entry ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Btn, {
						danger: true,
						disabled,
						onClick: () => {
							card.setPromptExtra(entry.kind, entry.key, void 0);
							onClose();
						},
						data: "entry-remove",
						children: t("promptEntryRemove")
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Btn, {
						onClick: onClose,
						data: "entry-cancel",
						children: t("cancel")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Btn, {
						primary: true,
						disabled: disabled || !complete,
						onClick: save,
						data: "entry-save",
						children: t("promptSave")
					})
				] }),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Row, {
						id: "dsb-entry-kind",
						label: t("promptEntryKind"),
						hint: t("promptEntryKindHint"),
						labels: rowLabels(t),
						children: entry ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Badge, {
							tone: "neutral",
							children: t(KIND_LABELS[kind])
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Select, {
							id: "dsb-entry-kind",
							value: kind,
							disabled,
							options: PROMPT_EXTRA_KEYS.map((value) => ({
								value,
								label: t(KIND_LABELS[value])
							})),
							onChange: (value) => setKind(value)
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Row, {
						id: "dsb-entry-key",
						label: t("promptEntryKey"),
						hint: t("promptEntryKeyHint"),
						invalid: keyProblem,
						problem: t("promptEntryKeyInvalid"),
						labels: rowLabels(t),
						children: [entry ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: entry.key }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextInput, {
							id: "dsb-entry-key",
							value: key,
							list: "dsb-entry-keys",
							code: true,
							disabled,
							invalid: keyProblem,
							placeholder: kind === "errorHints" ? "DEADLINE" : kind === "groups" ? "act" : "act.click",
							onChange: setKey
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("datalist", {
							id: "dsb-entry-keys",
							children: Object.keys(known ?? {}).map((name) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", { value: name }, name))
						})] }), unknown ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: styles.rowHint,
							role: "note",
							children: t("promptEntryUnknown")
						}) : null]
					}),
					kind === "errorHints" ? field(t("promptEntryText"), "dsb-entry-text", text, setText, caps.text, baseText, 6) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [field(t("promptEntrySummary"), "dsb-entry-summary", summary, setSummary, caps.summary, baseSummary, 3), kind === "actions" ? field(t("promptEntryNotes"), "dsb-entry-notes", notes, setNotes, caps.notes, baseNotes, 8) : null] })
				]
			});
		}
		/** The entries you changed. */
		function EntryList({ card }) {
			const { t } = card;
			const { state, disabled } = usePrompts(card);
			const [dialog, setDialog] = (0, react.useState)();
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SubHead, { children: t("promptsEntriesTitle") }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: styles.rowHint,
					children: t("promptsEntriesHint")
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: styles.list,
					"data-dsb-entry-list": true,
					children: [state.entries.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: styles.empty,
						children: t("promptsEntriesEmpty")
					}) : null, state.entries.map((entry) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Item, {
						data: `${entry.kind}:${entry.key}`,
						title: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: entry.key }),
						badges: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Badge, {
							tone: "neutral",
							children: t(KIND_LABELS[entry.kind])
						}),
						meta: entry.summary ?? entry.text ?? entry.notes,
						actions: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Btn, {
							disabled,
							onClick: () => setDialog({ entry }),
							data: "entry-edit",
							children: t("edit")
						})
					}, `${entry.kind}:${entry.key}`))]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Btn, {
					disabled,
					onClick: () => setDialog({}),
					data: "entry-add",
					children: t("promptsEntryAdd")
				}) }),
				dialog ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EntryDialog, {
					card,
					entry: dialog.entry,
					onClose: () => setDialog(void 0)
				}, dialog.entry ? `${dialog.entry.kind}:${dialog.entry.key}` : "\0new") : null
			] });
		}
		/** The default text, commented YAML or JSON, to copy. */
		function ExportDialog({ card, onClose }) {
			const { t } = card;
			const { status } = usePrompts(card);
			const [form, setForm] = (0, react.useState)("yaml");
			const [copied, setCopied] = (0, react.useState)(false);
			const lang = t("lang");
			const { exportPromptDefaults, exportPromptYaml } = card;
			(0, react.useEffect)(() => {
				exportPromptDefaults();
				exportPromptYaml(lang);
			}, [
				exportPromptDefaults,
				exportPromptYaml,
				lang
			]);
			const shown = form === "yaml" ? status.defaultsYaml?.lang === lang ? status.defaultsYaml.text : void 0 : status.defaults;
			const failed = form === "yaml" ? status.yamlFailed : status.defaultsFailed;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Dialog, {
				open: true,
				wide: true,
				title: t("promptExportTitle"),
				closeLabel: t("close"),
				description: t("promptExportHint"),
				onClose,
				footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Btn, {
					disabled: shown === void 0,
					onClick: () => {
						navigator.clipboard?.writeText(shown ?? "").then(() => setCopied(true)).catch(() => void 0);
					},
					data: "export-copy",
					children: copied ? t("promptExportCopied") : t("promptExportCopy")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Btn, {
					primary: true,
					onClick: onClose,
					children: t("close")
				})] }),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.SegmentedControl, {
					id: "dsb-export-form",
					label: t("promptExportTitle"),
					value: form,
					onChange: (next) => {
						setForm(next);
						setCopied(false);
					},
					options: [{
						value: "yaml",
						label: t("promptExportYaml")
					}, {
						value: "json",
						label: t("promptExportJson")
					}]
				}), failed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "dsb-bad",
					role: "alert",
					children: t("promptExportFailed")
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
					className: `${styles.input} ${styles.textarea} ${styles.code}`,
					rows: 16,
					readOnly: true,
					spellCheck: false,
					"aria-label": t("promptExportTitle"),
					value: shown ?? t("promptExportLoading"),
					onFocus: (event) => event.currentTarget.select(),
					"data-dsh-browser-prompts-defaults": true
				})]
			});
		}
		function PromptsGroup({ card }) {
			const { t } = card;
			const { state, disabled } = usePrompts(card);
			const [exporting, setExporting] = (0, react.useState)(false);
			const overridden = state.overridden;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Group, {
				id: "prompts",
				title: t("groupPrompts"),
				summary: t("groupPromptsSub"),
				badges: overridden ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Badge, {
					tone: "info",
					children: t("overridden")
				}) : null,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: styles.stack,
					"data-dsb-field": "prompts",
					"data-dsh-browser-prompts": true,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StatusLine, { card }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Row, {
							label: t("promptsSkillEnabled"),
							hint: t("promptsSkillEnabledHint"),
							labels: rowLabels(t),
							inline: true,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Toggle, {
								label: t("promptsSkillEnabled"),
								checked: state.skillEnabled,
								disabled,
								onChange: card.setPromptSkillEnabled
							})
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextList, { card }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(EntryList, { card }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							"data-dsh-browser-prompts-export": true,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Btn, {
								onClick: () => setExporting(true),
								data: "export-open",
								children: t("promptExportOpen")
							})
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: styles.notice,
							role: "note",
							children: t("promptsRestart")
						})
					]
				}), exporting ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ExportDialog, {
					card,
					onClose: () => setExporting(false)
				}) : null]
			});
		}
		//#endregion
		//#region src/client/SettingsCard.tsx
		function SettingsCard(props) {
			if (props.view === "summary") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: props.t("description") });
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Frame, {
				card: props,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SummaryBar, { card: props }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(CommonGroup, { card: props }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(BrowserGroup, { card: props }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ContextGroup, { card: props }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(DownloadsGroup, { card: props }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(AccessGroup, { card: props }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(LimitsGroup, { card: props }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PromptsGroup, { card: props }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(AssetsGroup, { card: props }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(AdvancedGroup, { card: props }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SaveBar, { card: props })
				]
			});
		}
		//#endregion
		//#region src/client/locales-ui.ts
		/**
		* The dictionary of the redesigned settings card: groups, the status summary, the save bar and the controls the
		* groups are made of. Entries here replace same-named entries of `locales.ts`.
		*
		* Every field has a label, a one-sentence `Hint` (kept short on purpose: it sits under the label) and, where the full
		* story is longer, a `Help` text that opens from the `?` button.
		* @module dsh-browser/client/locales-ui
		*/
		const zhUi = {
			summaryTitle: "当前状态",
			summaryEnabledOn: "已启用",
			summaryEnabledOff: "已停用",
			summaryMode: "模式",
			summarySurface: "工具面",
			summaryOpencliOn: "OpenCLI 开",
			summaryOpencliOff: "OpenCLI 关",
			summaryWarnings: "{n} 条警告",
			summaryNoWarnings: "无警告",
			summaryOverlay: "覆盖层生效",
			summaryDetails: "查看详情",
			summaryOpencliMissing: "OpenCLI 未安装",
			summaryNoBrowser: "没有可用浏览器",
			summaryBrowserSystem: "浏览器：系统 Chrome / Edge",
			warningsTitle: "需要注意",
			warningsConfig: "配置里有被忽略的值（已回退到默认）",
			warningsOverlay: "策略覆盖层",
			warningsNone: "没有警告。",
			warningsNoBrowser: "找不到可启动的浏览器",
			noticesRuntime: "运行环境说明（不是警告）",
			close: "关闭",
			helpLabel: "说明",
			savebarClean: "没有未保存的修改",
			savebarDirty: "{n} 项未保存",
			savebarInvalid: "有无效的值，修正后才能保存",
			discardChanges: "放弃",
			overriddenCount: "{n} 项已覆盖",
			cancel: "取消",
			done: "完成",
			edit: "编辑",
			remove: "删除",
			groupCommon: "常用",
			groupCommonSub: "启用、自动化模式、工具面、OpenCLI",
			groupBrowser: "浏览器",
			groupBrowserSub: "运行时、通道、无头、自动安装；高级项折叠",
			groupContext: "页面环境",
			groupContextSub: "视口、User-Agent、语言、时区、代理（每个新 context 的起点）",
			groupDownloads: "下载",
			groupDownloadsSub: "保存目录与单个文件上限",
			groupAccess: "登录与权限",
			groupAccessSub: "登录态 profile、默认 profile、内网域名、策略覆盖层",
			groupLimits: "使用限流",
			groupLimitsSub: "并发、突发、爬取预算与退避；自动化资产的阈值",
			groupPrompts: "提示词",
			groupPromptsSub: "模型看到的工具描述与指南；默认文本与你的覆盖对照",
			assetNewTitle: "新建草稿",
			groupAssets: "自动化资产",
			groupAssetsSub: "可复用的 recipe 与脚本（实验性）",
			groupAdvanced: "高级：文本模式",
			groupAdvancedSub: "把默认参数当作带注释的 properties 文本查看与编辑",
			enabled: "启用浏览器服务",
			enabledHint: "关闭后 agent 不再有浏览器工具。",
			automationMode: "自动化模式",
			automationModeHint: "决定 agent 能做什么、哪些操作要你批准。",
			automationModeHelp: "四档，越往下越少打扰、风险越高：\nread-only —— 只能读取与截图，页面交互与写入一律拒绝。\nstandard（默认）—— 读取直接执行，点击、输入、上传等写操作每次询问。\nautonomous —— 页面交互直接执行；外部脚本、安装、本地文件上传仍询问。\nunrestricted —— 全部直接执行，agent 还能自行放宽登录态域名与限流。\n无论哪档，调用缓冲与参数校验都不会被绕过。",
			modeReadOnly: "read-only · 只读 · 风险低",
			modeStandard: "standard · 标准（默认）· 风险中",
			modeAutonomous: "autonomous · 自主 · 风险较高",
			modeUnrestricted: "unrestricted · 免审批 · 风险高",
			modeReadOnlyLine: "只读：不能点击、输入或写入。",
			modeStandardLine: "标准：读取直接执行，写操作每次询问。",
			modeAutonomousLine: "自主：页面交互直接执行，脚本与安装仍询问。",
			modeUnrestrictedLine: "免审批：全部直接执行，含放宽登录态域名。",
			toolSurface: "工具面",
			toolSurfaceHint: "常驻上下文里放几个工具。",
			toolSurfaceHelp: "indexed（默认）：只常驻 browser_index / browser_call 两个工具，按需查目录，常驻约 325 token。\nflat：每个动作注册一个独立工具，常驻上下文明显更大（约 8.8k token）。\n工具在启动时注册，保存后需重启 profile。",
			surfaceIndexed: "indexed · 两个入口（默认）",
			surfaceFlat: "flat · 每个动作一个工具",
			opencliEnabled: "启用 OpenCLI",
			opencliEnabledHint: "站点 adapter 与 Chrome Browser Bridge 总开关。",
			reset: "恢复默认",
			overridden: "已覆盖",
			browserRuntime: "运行时",
			browserRuntimeHint: "默认 Playwright；Patchright 仅支持 Chromium。",
			channel: "浏览器通道",
			channelHint: "用哪个浏览器内核。",
			channelHelp: "chromium（默认）：用 Playwright 的 Chromium；它没有下载过时，自动改用本机已装的 Google Chrome 或 Edge，都没有才提示安装。chrome / msedge：固定使用本机已装的那个，没装就报错。其它值（如 chrome-beta）请先在“高级：文本模式”里确认可用。Patchright 推荐 chrome。",
			headless: "无头模式",
			headlessHint: "不显示浏览器窗口。",
			headlessHelp: "默认开启。需要亲眼看页面、或者站点检测到无头浏览器时可关闭；Patchright 的兼容性最好的配置通常是关闭无头。",
			autoInstall: "缺失时自动安装 Chromium",
			autoInstallHint: "可能触发较大的下载，日常建议关闭。",
			autoInstallHelp: "开启后，找不到 Playwright Chromium 时会自动执行 playwright install chromium（约 150 MB），并且不再改用系统 Chrome。默认关闭：装了 Chrome / Edge 就直接用，没有时用 runtime.install 动作显式安装。",
			browserAdvanced: "高级",
			browserAdvancedHint: "少数部署才需要改的项。",
			executablePath: "浏览器可执行文件",
			executablePathHint: "留空：Playwright Chromium，缺失时用系统 Chrome / Edge。",
			executablePathHelp: "自定义浏览器的绝对路径，例如 Chrome for Testing。填了它，通道设置仍用于选择驱动行为。",
			cdpPort: "CDP 调试端口",
			cdpPortHint: "本机远程调试端口，留空即关闭。",
			cdpPortHelp: "1–65535。开启后外部工具可连到这个端口调试浏览器；只监听本机，但同机的其它程序也能控制浏览器，请谨慎使用。",
			maxSessions: "会话上限",
			maxSessionsHint: "同时持有页面的会话数，1–64。",
			maxSessionsHelp: "默认 8。超出时关闭最久未使用的会话。所有会话共用一个浏览器进程，这个数限制的是页面（context）数。",
			args: "启动参数",
			argsHint: "追加的 Chromium 命令行参数。",
			argsHelp: "每项一个参数，例如 --disable-gpu。只添加你信任并理解其影响的参数；回车添加，点 × 删除。",
			argsPlaceholder: "--disable-gpu，回车添加",
			snapshotDir: "快照目录",
			snapshotDirHint: "截图保存位置，留空用默认。",
			snapshotDirHelp: "默认 $DSH_HOME/data/browser/snapshots。",
			verbose: "详细日志",
			verboseHint: "输出启动与诊断信息。",
			storageStatePath: "全局登录态文件",
			storageStatePathHint: "旧版入口，新配置请用登录 profile。",
			storageStatePathHelp: "Playwright storageState JSON 的路径，对所有网站生效，没有域名限制。新配置请改用“登录与权限”里按域名限定的 profile。",
			viewportMode: "视口大小",
			viewportModeHint: "新页面的窗口尺寸。",
			viewportModeHelp: "window：用浏览器自带大小（默认）。720p：1280×720。1080p：1920×1080。custom：自己填宽高（200–7680 × 200–4320）。",
			viewportWindow: "window · 浏览器默认",
			viewport720: "720p · 1280×720",
			viewport1080: "1080p · 1920×1080",
			viewportCustom: "custom · 自定义",
			viewportWidth: "宽度",
			viewportWidthHint: "200–7680 像素。",
			viewportHeight: "高度",
			viewportHeightHint: "200–4320 像素。",
			userAgent: "User-Agent",
			userAgentHint: "站点看到的浏览器标识。",
			userAgentHelp: "会改变站点看到的浏览器指纹；留空使用浏览器自带。agent 按次改 UA 时需要你批准（unrestricted 除外）。",
			uaDefault: "浏览器自带（默认）",
			uaChromeMac: "Chrome · macOS",
			uaChromeWin: "Chrome · Windows",
			uaIphone: "Safari · iPhone",
			uaCustom: "自定义…",
			uaCustomPlaceholder: "完整的 User-Agent 字符串",
			locale: "语言区域",
			localeHint: "例如 en-US、zh-CN。",
			localeHelp: "BCP 47 语言标签，影响页面语言偏好与 Accept-Language；留空使用浏览器自带。",
			timezoneId: "时区",
			timezoneIdHint: "例如 Asia/Shanghai。",
			timezoneIdHelp: "IANA 时区名，影响页面里的日期与时间；留空使用本机时区。",
			proxyEnabled: "使用代理",
			proxyEnabledHint: "让浏览器流量走代理出口。",
			proxyEnabledHelp: "关闭即直连。代理会改变出口 IP；agent 按次指定代理时需要你批准（unrestricted 除外）。不支持账号密码，请不要把凭据写进地址。",
			proxyServer: "代理服务器",
			proxyServerHint: "如 http://127.0.0.1:7890。",
			proxyServerHelp: "支持 http、https、socks5、socks4；不支持账号密码，也不要带路径。",
			proxyBypass: "绕过代理",
			proxyBypassHint: "这些主机直连。",
			proxyBypassHelp: "逗号分隔的主机，例如 example.com 或 .internal.test；需要先填代理服务器。",
			proxyBypassPlaceholder: "example.com，回车添加",
			downloadDir: "下载目录",
			downloadDirHint: "绝对路径；留空用默认。",
			downloadDirHelp: "默认 $DSH_HOME/data/browser/downloads。文件只会写入该目录，重名自动加 -1、-2 后缀，不覆盖。",
			downloadMaxBytes: "单个文件上限",
			downloadMaxBytesHint: "超出会中止并删除半成品。",
			downloadMaxBytesHelp: "默认 100 MiB，最大 10 GiB。",
			allowPrivateHosts: "允许内网域名",
			allowPrivateHostsHint: "让 agent 能把 localhost 与内网地址加入登录 profile。",
			allowPrivateHostsHelp: "开启后，agent 经策略动作可把 localhost、.local/.internal 域名和回环/内网 IPv4 写进登录 profile 的 allowedDomains。默认关闭；云元数据与链路本地地址始终拒绝。",
			riskNote: "风险",
			authProfiles: "登录 profile",
			authProfilesHint: "按域名限定的命名登录态。",
			authProfilesHelp: "每个 profile 是一个 Playwright storageState 文件加一份允许使用它的域名清单。agent 只能在清单内的域名上选用它。状态文件含 cookie，不要提交到仓库。",
			authProfilesEmpty: "还没有登录 profile。",
			authAdd: "新增 profile",
			authEdit: "编辑 profile",
			authNew: "新增登录 profile",
			authDomainsCount: "{n} 个域名",
			authPersistOn: "自动保存登录态",
			authPersistOff: "只读登录态",
			authId: "名称",
			authIdHint: "字母、数字、- 与 _，1–40 个字符，创建后不可改。",
			authIdExists: "已有同名 profile。",
			authIdInvalid: "名称只能含字母、数字、- 与 _，且以字母或数字开头。",
			authDomains: "允许的域名",
			authDomainsHint: "回车添加；子域名自动包含，*. 前缀可省略。",
			authDomainsEmpty: "至少需要一个域名，否则这个 profile 不能被任何网站使用。",
			authDomainInvalid: "只写主机名，不要带协议、路径或空格。",
			authDomainPrivate: "内网域名需要先开启“允许内网域名”才能由 agent 使用；这里作为你自己的配置可以填写。",
			authPersist: "自动保存登录态",
			authPersistHint: "页面关闭后把 cookie 写回状态文件。",
			authPersistHelp: "关闭（默认）：状态文件只读，必须事先存在。开启：关闭临时 context 时把最新的 cookie 与 localStorage 写回文件，文件可以先不存在。",
			authPath: "状态文件",
			authPathHint: "只读。",
			authPathRule: "规则：新建的 profile 保存为 <登录态目录>/<名称>.json；已有的 profile 保持原路径不变。内容是 Playwright storageState，不要提交到仓库。",
			authPathUnknown: "（登录态目录尚未读到，稍后重试）",
			authRemove: "删除此 profile",
			authRemoveConfirm: "确认删除",
			authRemoveNote: "删除只改基线配置；保存后才生效。",
			authOverlayOnly: "由 agent 创建，不在配置文件里。",
			authOriginChanged: "覆盖层改动",
			authOriginCreated: "覆盖层新建",
			authRevert: "回滚",
			defaultAuthProfile: "默认 profile",
			defaultAuthProfileHint: "未指定时使用；crawl 始终匿名。",
			defaultAuthProfileNone: "（不使用）",
			defaultAuthProfileMissing: "（不存在）",
			policyOverlay: "策略覆盖层",
			policyOverlayHint: "agent 经 runtime.* 动作对上面设置的叠加修改。",
			policyOverlayHelp: "agent 可经 runtime.* 动作修改“限制类”设置（登录 profile 的域名/新建/删除、使用限流），叠加在基线配置之上，覆盖层优先。收紧不询问；放宽按自动化模式处理，unrestricted 下 agent 可自行放宽，请定期查看变更记录。",
			policyAuditOpen: "查看变更记录",
			policyAuditTitle: "策略覆盖层变更记录",
			policyOverlayActive: "覆盖层生效中，版本 {n}",
			policyOverlayIdle: "没有覆盖，全部取自基线配置。",
			policyClearAll: "清除覆盖 / 回滚到基线",
			policyAuthDirLabel: "登录态目录",
			policyUsageEffective: "限流生效值",
			policyRemovedLabel: "被覆盖层移除的基线 profile",
			usagePolicy: "调用缓冲",
			usagePolicyHint: "限制并发、突发与爬取预算，保护目标站点。",
			usagePolicyHelp: "这些数值作用于所有浏览器与爬取流量，与审批无关。收到 429/503 时按退避与冷却时间暂停。",
			automationAssets: "资产策略",
			automationAssetsHint: "候选阈值、持久化与激活规则、数量与预算。",
			automationAssetsHelp: "控制 agent 的成功操作何时被建议总结为可复用资产，以及资产的数量、上下文预算与激活条件。",
			limitsRange: "范围 {min}–{max}",
			limitsDefault: "默认 {value}",
			advancedHint: "文本即视图：改它就是改上面的字段，反之亦然。# 开头的是注释，保存时忽略。",
			advancedCopy: "复制为文本",
			advancedCopied: "已复制",
			advancedNote: "这里只列“默认参数”；开关、策略、提示词与登录 profile 在各自的分组里编辑。"
		};
		const enUi = {
			summaryTitle: "Status",
			summaryEnabledOn: "Enabled",
			summaryEnabledOff: "Disabled",
			summaryMode: "Mode",
			summarySurface: "Tool surface",
			summaryOpencliOn: "OpenCLI on",
			summaryOpencliOff: "OpenCLI off",
			summaryWarnings: "{n} warning(s)",
			summaryNoWarnings: "No warnings",
			summaryOverlay: "Overlay active",
			summaryDetails: "Details",
			summaryOpencliMissing: "OpenCLI not installed",
			summaryNoBrowser: "No browser available",
			summaryBrowserSystem: "Browser: system Chrome / Edge",
			warningsTitle: "Needs attention",
			warningsConfig: "Values in the configuration were ignored (fell back to defaults)",
			warningsOverlay: "Policy overlay",
			warningsNone: "No warnings.",
			warningsNoBrowser: "No browser can be launched",
			noticesRuntime: "About this machine (not warnings)",
			close: "Close",
			helpLabel: "Explanation",
			savebarClean: "No unsaved changes",
			savebarDirty: "{n} unsaved",
			savebarInvalid: "Some values are invalid; fix them to save",
			discardChanges: "Discard",
			overriddenCount: "{n} overridden",
			cancel: "Cancel",
			done: "Done",
			edit: "Edit",
			remove: "Delete",
			groupCommon: "Common",
			groupCommonSub: "Enable, automation mode, tool surface, OpenCLI",
			groupBrowser: "Browser",
			groupBrowserSub: "Runtime, channel, headless, auto-install; advanced items folded",
			groupContext: "Page environment",
			groupContextSub: "Viewport, user agent, language, time zone, proxy (what every new context starts from)",
			groupDownloads: "Downloads",
			groupDownloadsSub: "Save directory and per-file size limit",
			groupAccess: "Sign-in and permissions",
			groupAccessSub: "Login profiles, default profile, private hosts, policy overlay",
			groupLimits: "Usage limits",
			groupLimitsSub: "Concurrency, bursts, crawl budget and backoff; asset thresholds",
			groupPrompts: "Prompts",
			groupPromptsSub: "Tool descriptions and guides the model reads; default text beside your override",
			assetNewTitle: "New draft",
			groupAssets: "Automation assets",
			groupAssetsSub: "Reusable recipes and scripts (experimental)",
			groupAdvanced: "Advanced: text mode",
			groupAdvancedSub: "The default parameters as a commented properties text",
			enabled: "Enable browser service",
			enabledHint: "Off: the agent has no browser tools.",
			automationMode: "Automation mode",
			automationModeHint: "What the agent may do and what needs your approval.",
			automationModeHelp: "Four levels; each step down asks less and carries more risk:\nread-only: read and screenshot only; page interaction and writes are refused.\nstandard (default): reads run directly; clicks, typing, uploads and other writes ask every time.\nautonomous: page interaction runs directly; external scripts, installs and local file uploads still ask.\nunrestricted: everything runs directly, and the agent may loosen login-profile domains and limits on its own.\nIn every mode the call buffer and argument validation stay on.",
			modeReadOnly: "read-only · low risk",
			modeStandard: "standard · default · medium risk",
			modeAutonomous: "autonomous · higher risk",
			modeUnrestricted: "unrestricted · no approvals · high risk",
			modeReadOnlyLine: "Read only: no clicking, typing or writing.",
			modeStandardLine: "Standard: reads run directly, writes ask every time.",
			modeAutonomousLine: "Autonomous: page interaction runs directly; scripts and installs still ask.",
			modeUnrestrictedLine: "Unrestricted: everything runs directly, including loosening login domains.",
			toolSurface: "Tool surface",
			toolSurfaceHint: "How many tools stay in context.",
			toolSurfaceHelp: "indexed (default): only browser_index / browser_call stay in context and the model looks things up on demand (about 325 tokens).\nflat: one tool per action; the always-on context is far larger (about 8.8k tokens).\nTools are registered at startup, so restart the profile after saving.",
			surfaceIndexed: "indexed · two entry tools (default)",
			surfaceFlat: "flat · one tool per action",
			opencliEnabled: "Enable OpenCLI",
			opencliEnabledHint: "Master switch for site adapters and the Chrome Browser Bridge.",
			reset: "Restore default",
			overridden: "Overridden",
			browserRuntime: "Runtime",
			browserRuntimeHint: "Playwright by default; Patchright is Chromium-only.",
			channel: "Browser channel",
			channelHint: "Which browser engine to use.",
			channelHelp: "chromium (default): Playwright's Chromium; when it has not been downloaded, the Google Chrome or Edge installed on this machine is used automatically, and only if there is none are you told to install one. chrome / msedge: always use that installed browser, and fail when it is missing. Other values (such as chrome-beta) are best confirmed in \"Advanced: text mode\" first. Patchright recommends chrome.",
			headless: "Headless",
			headlessHint: "Do not show a browser window.",
			headlessHelp: "On by default. Turn it off to watch the page, or when a site detects headless browsers; Patchright usually works best headed.",
			autoInstall: "Install Chromium when missing",
			autoInstallHint: "May trigger a large download; keep off day to day.",
			autoInstallHelp: "When on, a missing Playwright Chromium triggers playwright install chromium (about 150 MB) and the system Chrome is no longer used instead. Off by default: an installed Chrome / Edge is used directly, otherwise install explicitly with the runtime.install action.",
			browserAdvanced: "Advanced",
			browserAdvancedHint: "Only a few deployments change these.",
			executablePath: "Browser executable",
			executablePathHint: "Empty: Playwright Chromium, or the system Chrome / Edge when it is missing.",
			executablePathHelp: "Absolute path of a custom browser, for example Chrome for Testing. The channel setting still selects driver behavior.",
			cdpPort: "CDP debugging port",
			cdpPortHint: "Local remote-debugging port; empty is off.",
			cdpPortHelp: "1–65535. External tools can attach to this port to debug the browser. It listens locally, but other programs on the machine can then control the browser, so use it with care.",
			maxSessions: "Session limit",
			maxSessionsHint: "Sessions holding a page at once, 1–64.",
			maxSessionsHelp: "Default 8. Past it the least recently used session is closed. One browser process serves them all; this bounds pages (contexts).",
			args: "Launch arguments",
			argsHint: "Extra Chromium command-line arguments.",
			argsHelp: "One argument per entry, for example --disable-gpu. Add only arguments whose effects you understand; Enter adds, × removes.",
			argsPlaceholder: "--disable-gpu, Enter to add",
			snapshotDir: "Snapshot directory",
			snapshotDirHint: "Where screenshots go; empty is the default.",
			snapshotDirHelp: "Default $DSH_HOME/data/browser/snapshots.",
			verbose: "Verbose log",
			verboseHint: "Print startup and diagnostic details.",
			storageStatePath: "Global login-state file",
			storageStatePathHint: "Legacy entry; use a login profile instead.",
			storageStatePathHelp: "Path of a Playwright storageState JSON that applies to every site, with no domain limit. New setups should use the domain-scoped profiles in \"Sign-in and permissions\".",
			viewportMode: "Viewport size",
			viewportModeHint: "Window size of new pages.",
			viewportModeHelp: "window: the browser default (default). 720p: 1280×720. 1080p: 1920×1080. custom: enter a width and height (200–7680 × 200–4320).",
			viewportWindow: "window · browser default",
			viewport720: "720p · 1280×720",
			viewport1080: "1080p · 1920×1080",
			viewportCustom: "custom",
			viewportWidth: "Width",
			viewportWidthHint: "200–7680 px.",
			viewportHeight: "Height",
			viewportHeightHint: "200–4320 px.",
			userAgent: "User-Agent",
			userAgentHint: "The browser identity sites see.",
			userAgentHelp: "Changes the browser fingerprint sites see; empty keeps the browser's own. An agent changing it per call needs your approval (except in unrestricted).",
			uaDefault: "Browser default (default)",
			uaChromeMac: "Chrome · macOS",
			uaChromeWin: "Chrome · Windows",
			uaIphone: "Safari · iPhone",
			uaCustom: "Custom…",
			uaCustomPlaceholder: "The full User-Agent string",
			locale: "Locale",
			localeHint: "For example en-US, zh-CN.",
			localeHelp: "A BCP 47 language tag; it sets the page language preference and Accept-Language. Empty keeps the browser's own.",
			timezoneId: "Time zone",
			timezoneIdHint: "For example Asia/Shanghai.",
			timezoneIdHelp: "An IANA time zone name; it sets the dates and times pages show. Empty uses this machine's time zone.",
			proxyEnabled: "Use a proxy",
			proxyEnabledHint: "Send browser traffic through a proxy.",
			proxyEnabledHelp: "Off means a direct connection. A proxy changes the egress IP; an agent naming a proxy per call needs your approval (except in unrestricted). Accounts and passwords are not supported: never put credentials in the address.",
			proxyServer: "Proxy server",
			proxyServerHint: "For example http://127.0.0.1:7890.",
			proxyServerHelp: "http, https, socks5 and socks4 are supported; no accounts or passwords, and no path.",
			proxyBypass: "Bypass the proxy",
			proxyBypassHint: "These hosts connect directly.",
			proxyBypassHelp: "Comma-separated hosts such as example.com or .internal.test; needs a proxy server first.",
			proxyBypassPlaceholder: "example.com, Enter to add",
			downloadDir: "Download directory",
			downloadDirHint: "Absolute path; empty is the default.",
			downloadDirHelp: "Default $DSH_HOME/data/browser/downloads. Files are written only there; a name clash gets a -1, -2 suffix and nothing is overwritten.",
			downloadMaxBytes: "Largest single file",
			downloadMaxBytesHint: "A bigger download is stopped and removed.",
			downloadMaxBytesHelp: "Default 100 MiB, at most 10 GiB.",
			allowPrivateHosts: "Allow private hosts",
			allowPrivateHostsHint: "Lets the agent put localhost and LAN addresses in a login profile.",
			allowPrivateHostsHelp: "When on, an agent policy action may put localhost, .local/.internal names and loopback or private-network IPv4 addresses in a login profile's allowedDomains. Off by default; cloud metadata and link-local addresses are always refused.",
			riskNote: "Risk",
			authProfiles: "Login profiles",
			authProfilesHint: "Named login states limited to domains.",
			authProfilesHelp: "A profile is a Playwright storageState file plus the list of domains allowed to use it. An agent can pick it only on those domains. The state file holds cookies: never commit it.",
			authProfilesEmpty: "No login profiles yet.",
			authAdd: "Add profile",
			authEdit: "Edit profile",
			authNew: "New login profile",
			authDomainsCount: "{n} domain(s)",
			authPersistOn: "saves state",
			authPersistOff: "read-only state",
			authId: "Name",
			authIdHint: "Letters, digits, - and _, 1–40 characters; fixed once created.",
			authIdExists: "A profile with this name exists.",
			authIdInvalid: "Use letters, digits, - and _, starting with a letter or digit.",
			authDomains: "Allowed domains",
			authDomainsHint: "Enter adds; subdomains are included, the *. prefix is optional.",
			authDomainsEmpty: "At least one domain is needed, otherwise no site can use this profile.",
			authDomainInvalid: "Host names only: no scheme, path or spaces.",
			authDomainPrivate: "Private names only work for an agent once \"Allow private hosts\" is on; as your own configuration you may list them here.",
			authPersist: "Save login state",
			authPersistHint: "Write cookies back after the page closes.",
			authPersistHelp: "Off (default): the state file is read-only and must already exist. On: when a transient context closes, the latest cookies and localStorage are written back; the file may start out missing.",
			authPath: "State file",
			authPathHint: "Read-only.",
			authPathRule: "Rule: a new profile is stored as <login-state directory>/<name>.json; an existing profile keeps its path. The content is a Playwright storageState: never commit it.",
			authPathUnknown: "(the login-state directory is not loaded yet; try again shortly)",
			authRemove: "Delete this profile",
			authRemoveConfirm: "Confirm delete",
			authRemoveNote: "Deleting only changes the baseline configuration, and only once saved.",
			authOverlayOnly: "Created by an agent; not in the configuration file.",
			authOriginChanged: "overlay change",
			authOriginCreated: "overlay-created",
			authRevert: "Revert",
			defaultAuthProfile: "Default profile",
			defaultAuthProfileHint: "Used when none is named; crawl is always anonymous.",
			defaultAuthProfileNone: "(none)",
			defaultAuthProfileMissing: "(missing)",
			policyOverlay: "Policy overlay",
			policyOverlayHint: "What agents changed on top of the settings above.",
			policyOverlayHelp: "An agent may change restriction-type settings through runtime.* actions (a login profile's domains, creating or deleting profiles, usage limits) on top of the baseline configuration, and the overlay wins. Tightening never asks; loosening follows the automation mode, and under unrestricted the agent may loosen on its own, so review the change log now and then.",
			policyAuditOpen: "View change log",
			policyAuditTitle: "Policy overlay change log",
			policyOverlayActive: "Overlay active, revision {n}",
			policyOverlayIdle: "No overlay: everything comes from the baseline configuration.",
			policyClearAll: "Clear overlay / roll back to baseline",
			policyAuthDirLabel: "Login-state directory",
			policyUsageEffective: "Effective limits",
			policyRemovedLabel: "Baseline profiles removed by the overlay",
			usagePolicy: "Call buffer",
			usagePolicyHint: "Bounds concurrency, bursts and crawl budget to protect target sites.",
			usagePolicyHelp: "These numbers apply to all browser and crawl traffic, independent of approvals. On 429/503 responses traffic pauses by the backoff and cooldown values.",
			automationAssets: "Asset policy",
			automationAssetsHint: "Candidate thresholds, persistence, activation, counts and budgets.",
			automationAssetsHelp: "Controls when an agent's successful runs are suggested for summarizing into reusable assets, plus asset counts, the context budget and activation conditions.",
			limitsRange: "Range {min}–{max}",
			limitsDefault: "default {value}",
			advancedHint: "The text is a view: editing it edits the fields above, and the other way round. Lines starting with # are comments and ignored on save.",
			advancedCopy: "Copy as text",
			advancedCopied: "Copied",
			advancedNote: "Only the default parameters are listed here; switches, policies, prompts and login profiles are edited in their own groups."
		};
		//#endregion
		//#region src/client/locales-policy.ts
		/**
		* Labels and one-line hints for every key of `usagePolicy` and `automationAssets`, plus the words of the limits group.
		* A key added to `../policy-keys.ts` needs its entries here: the render test asks for every one.
		* @module dsh-browser/client/locales-policy
		*/
		const zhPolicy = {
			limitsUsageTitle: "调用缓冲",
			limitsUsageSub: "保护目标站点：限制并发、突发与爬取预算，遇到 429/503 自动退避。",
			limitsAssetsFold: "资产策略（高级）",
			limitsAssetsFoldHint: "何时建议总结、数量与上下文预算、激活条件",
			limitsRawFold: "高级：原始 JSON",
			limitsRawHint: "与上面的输入框是同一份数据；JSON 里只写与默认不同的键。",
			limitsRawUsage: "调用缓冲 JSON",
			limitsRawAssets: "资产策略 JSON",
			policyKeys: "可用键名：",
			limitsOverlayNote: "覆盖层生效：{value}（基线 {baseline}）",
			limitsUnitMs: "毫秒",
			limitsUnitDays: "天",
			limitsUnitTokens: "token",
			limitsUnitCount: "",
			limitsUnitRatio: "比例",
			limitsSectionCandidates: "候选与建议",
			limitsSectionLibrary: "资产库与上下文",
			limitsSectionActivation: "激活与测试",
			invalidNumber: "请填数字（整数键不能带小数）。",
			invalidChoice: "不是可选的值。",
			invalidRange: "超出范围，插件会悄悄截断到边界，所以这里不让保存。",
			pk_minDelayMs: "最小间隔",
			pk_minDelayMsHint: "同一主机两次请求之间至少等待。",
			pk_maxConcurrency: "最大并发",
			pk_maxConcurrencyHint: "同时进行的请求数。",
			pk_burst: "突发额度",
			pk_burstHint: "短时间内允许连续发出的请求数。",
			pk_maxPagesPerRun: "单次爬取页数",
			pk_maxPagesPerRunHint: "一次 crawl 最多访问的页面数。",
			pk_maxDepth: "爬取深度",
			pk_maxDepthHint: "从起点出发最多跟进的链接层数。",
			pk_retryLimit: "重试次数",
			pk_retryLimitHint: "遇到可重试错误时的最大重试数。",
			pk_backoffBaseMs: "退避基数",
			pk_backoffBaseMsHint: "重试等待的起始时长，逐次加倍。",
			pk_cooldownMs: "冷却时长",
			pk_cooldownMsHint: "收到 429/503 后暂停该主机的时长。",
			pk_persistenceMode: "持久化模式",
			pk_persistenceModeHint: "off 不记录；manual 仅手动；suggest 记录并建议（默认）；auto-draft 自动生成草稿。",
			pk_minSuccessfulRuns: "成功次数门槛",
			pk_minSuccessfulRunsHint: "同一操作成功多少次才建议总结。",
			pk_minDistinctSessions: "会话数门槛",
			pk_minDistinctSessionsHint: "成功分布在至少几个不同会话。",
			pk_successWindowDays: "统计窗口",
			pk_successWindowDaysHint: "只统计最近多少天内的成功。",
			pk_minSuccessRate: "最低成功率",
			pk_minSuccessRateHint: "0.5–1 的比例，如 0.8 即 80%。",
			pk_maxCandidates: "候选上限",
			pk_maxCandidatesHint: "同时保留的候选数量。",
			pk_candidateTtlDays: "候选保留天数",
			pk_candidateTtlDaysHint: "候选多久没再出现就丢弃。",
			pk_maxSuggestionsPerDay: "每日建议上限",
			pk_maxSuggestionsPerDayHint: "每天最多提示几次“是否总结”；0 为不提示。",
			pk_enabled: "启用资产库",
			pk_enabledHint: "关闭后不记录、不检索自动化资产。",
			pk_directory: "资产目录",
			pk_directoryHint: "绝对路径；留空用 $DSH_HOME/data/browser/automations。",
			pk_maxDrafts: "草稿上限",
			pk_maxDraftsHint: "同时保留的草稿数。",
			pk_maxActiveAssets: "激活资产上限",
			pk_maxActiveAssetsHint: "同时处于激活状态的资产数。",
			pk_retrievalTopK: "检索条数",
			pk_retrievalTopKHint: "每次最多向模型展示几条相关资产摘要。",
			pk_catalogTokenBudget: "目录 token 预算",
			pk_catalogTokenBudgetHint: "资产摘要占用模型上下文的上限。",
			pk_activationMode: "激活方式",
			pk_activationModeHint: "manual 必须手动激活（默认）；auto-tested 通过测试后自动激活。",
			pk_modelDevelopmentEnabled: "允许模型开发资产",
			pk_modelDevelopmentEnabledHint: "关闭后 agent 看不到 automation.develop，需重启生效。",
			pk_maxModelDraftWritesPerSession: "模型每会话写草稿次数",
			pk_maxModelDraftWritesPerSessionHint: "限制一个会话里模型保存草稿的次数。",
			pk_maxTestCredentials: "保留的测试凭据数",
			pk_maxTestCredentialsHint: "每个资产保留最近几次测试结果。",
			pk_minInputSetsForActivation: "激活所需输入组数",
			pk_minInputSetsForActivationHint: "带输入的资产至少要用几组不同输入测试通过才能激活。"
		};
		const enPolicy = {
			limitsUsageTitle: "Call buffer",
			limitsUsageSub: "Protects target sites: bounds concurrency, bursts and crawl budget, and backs off on 429/503.",
			limitsAssetsFold: "Asset policy (advanced)",
			limitsAssetsFoldHint: "when to suggest summarizing, counts and context budget, activation",
			limitsRawFold: "Advanced: raw JSON",
			limitsRawHint: "The same data as the inputs above; write only the keys that differ from the default.",
			limitsRawUsage: "Call buffer JSON",
			limitsRawAssets: "Asset policy JSON",
			policyKeys: "Keys:",
			limitsOverlayNote: "Overlay in force: {value} (baseline {baseline})",
			limitsUnitMs: "ms",
			limitsUnitDays: "days",
			limitsUnitTokens: "tokens",
			limitsUnitCount: "",
			limitsUnitRatio: "ratio",
			limitsSectionCandidates: "Candidates and suggestions",
			limitsSectionLibrary: "Library and context",
			limitsSectionActivation: "Activation and tests",
			invalidNumber: "Enter a number (whole-number keys take no decimals).",
			invalidChoice: "Not an allowed value.",
			invalidRange: "Out of range: the plugin would quietly clamp it, so saving is refused.",
			pk_minDelayMs: "Minimum gap",
			pk_minDelayMsHint: "Least wait between two requests to one host.",
			pk_maxConcurrency: "Max concurrency",
			pk_maxConcurrencyHint: "Requests in flight at once.",
			pk_burst: "Burst allowance",
			pk_burstHint: "Requests allowed back to back in a short window.",
			pk_maxPagesPerRun: "Pages per crawl",
			pk_maxPagesPerRunHint: "Most pages one crawl may visit.",
			pk_maxDepth: "Crawl depth",
			pk_maxDepthHint: "Most link levels followed from the start.",
			pk_retryLimit: "Retries",
			pk_retryLimitHint: "Most retries after a retryable error.",
			pk_backoffBaseMs: "Backoff base",
			pk_backoffBaseMsHint: "First retry wait; doubles each time.",
			pk_cooldownMs: "Cooldown",
			pk_cooldownMsHint: "How long a host pauses after a 429/503.",
			pk_persistenceMode: "Persistence mode",
			pk_persistenceModeHint: "off records nothing; manual by hand only; suggest records and suggests (default); auto-draft writes drafts itself.",
			pk_minSuccessfulRuns: "Successes needed",
			pk_minSuccessfulRunsHint: "Successful runs before summarizing is suggested.",
			pk_minDistinctSessions: "Sessions needed",
			pk_minDistinctSessionsHint: "The successes span at least this many sessions.",
			pk_successWindowDays: "Counting window",
			pk_successWindowDaysHint: "Only successes this recent count.",
			pk_minSuccessRate: "Minimum success rate",
			pk_minSuccessRateHint: "A ratio from 0.5 to 1; 0.8 is 80%.",
			pk_maxCandidates: "Candidate limit",
			pk_maxCandidatesHint: "Candidates kept at once.",
			pk_candidateTtlDays: "Candidate lifetime",
			pk_candidateTtlDaysHint: "Days without a repeat before a candidate is dropped.",
			pk_maxSuggestionsPerDay: "Suggestions per day",
			pk_maxSuggestionsPerDayHint: "At most this many \"summarize?\" prompts a day; 0 turns them off.",
			pk_enabled: "Enable the asset library",
			pk_enabledHint: "Off: nothing is recorded or retrieved.",
			pk_directory: "Asset directory",
			pk_directoryHint: "Absolute path; empty uses $DSH_HOME/data/browser/automations.",
			pk_maxDrafts: "Draft limit",
			pk_maxDraftsHint: "Drafts kept at once.",
			pk_maxActiveAssets: "Active asset limit",
			pk_maxActiveAssetsHint: "Assets active at once.",
			pk_retrievalTopK: "Retrieved entries",
			pk_retrievalTopKHint: "Related asset summaries shown to the model per lookup.",
			pk_catalogTokenBudget: "Catalog token budget",
			pk_catalogTokenBudgetHint: "Most model context the asset summaries may use.",
			pk_activationMode: "Activation",
			pk_activationModeHint: "manual needs a person to activate (default); auto-tested activates once tests pass.",
			pk_modelDevelopmentEnabled: "Let the model develop assets",
			pk_modelDevelopmentEnabledHint: "Off: the agent does not see automation.develop; restart to apply.",
			pk_maxModelDraftWritesPerSession: "Model draft saves per session",
			pk_maxModelDraftWritesPerSessionHint: "Limits how often the model saves a draft in one session.",
			pk_maxTestCredentials: "Test results kept",
			pk_maxTestCredentialsHint: "Recent test results kept per asset.",
			pk_minInputSetsForActivation: "Input sets needed to activate",
			pk_minInputSetsForActivationHint: "An asset with inputs must pass tests on at least this many different input sets."
		};
		//#endregion
		//#region src/client/locales-prompts.ts
		/**
		* Words of the prompts group: the list of texts and entries, the editing dialogs, and the export dialog.
		* @module dsh-browser/client/locales-prompts
		*/
		const zhPrompts = {
			lang: "zh",
			promptsStatusLine: "L0 常驻 ≈ {l0} / {l0Budget} tokens · 最大目录层 {layer} ≈ {tokens} / {layerBudget}",
			promptsStatusOverrides: "{n} 项覆盖生效",
			promptsStatusNone: "没有覆盖，全部使用默认文本",
			promptsStatusDiagnostics: "{n} 条诊断",
			promptsDiagnosticsFold: "诊断详情",
			promptsStatusUnavailable2: "暂时读不到插件状态（重启中？），稍后刷新。",
			promptsListTitle: "文本",
			promptsListHint: "模型读到的工具描述、指南与 skill 文字。点“编辑”看默认文本并改写。",
			promptsEntriesTitle: "分组 / 动作 / 错误提示条目",
			promptsEntriesHint: "只列出你改过的条目；其余沿用默认。",
			promptsEntriesEmpty: "没有改过的条目。",
			promptsEntryAdd: "新增条目",
			promptStateDefault: "默认",
			promptStateOverridden: "已覆盖",
			promptChars: "{n} 字符",
			promptEditTitle: "编辑：{name}",
			promptDefaultCol: "默认文本（只读）",
			promptMineCol: "我的覆盖",
			promptNoDefault: "（没有默认文本：留空表示不设置）",
			promptDefaultMissing: "（默认文本读取中或暂不可用）",
			promptEmptyIsDefault: "留空即使用默认文本。",
			promptStart: "以默认为起点",
			promptRestore: "恢复默认",
			promptSave: "保存",
			promptSameAsDefault: "与默认文本相同，等同于没有覆盖：不会保存，以后默认文本升级时会自动跟进。",
			promptKindGroups: "分组",
			promptKindActions: "动作",
			promptKindErrorHints: "错误提示",
			promptEntryNewTitle: "新增条目",
			promptEntryEditTitle: "编辑条目：{key}",
			promptEntryKind: "类型",
			promptEntryKindHint: "分组=分组列表里的一行；动作=动作目录与详情；错误提示=失败后附在结果里的提示。",
			promptEntryKey: "键",
			promptEntryKeyHint: "分组名、group.action（子动作、主题含第三段）或错误码；可从建议里选。",
			promptEntryKeyInvalid: "键只能含字母、数字、_、. 与 -。",
			promptEntryUnknown: "默认文本里没有这个键：运行时会忽略它并在诊断里提示。",
			promptEntrySummary: "摘要（summary）",
			promptEntryNotes: "补充说明（notes）",
			promptEntryText: "提示文字",
			promptEntryRemove: "删除覆盖",
			promptExportOpen: "导出默认文本",
			promptExportTitle: "默认文本",
			promptExportYaml: "带注释 YAML（推荐）",
			promptExportJson: "JSON",
			promptExportCopy: "复制",
			promptExportCopied: "已复制",
			promptExportHint: "YAML 在每段前注明模型何时读到、字数上限与生效方式；JSON 与上面的覆盖项结构完全一致。复制后删掉保持默认的部分，改写其余，粘贴到 profile 配置里本插件段的 prompts 下。",
			promptExportFailed: "暂时读不到默认文本，请稍后重试。",
			promptExportLoading: "读取中…"
		};
		const enPrompts = {
			lang: "en",
			promptsStatusLine: "L0 always-on ≈ {l0} / {l0Budget} tokens · largest catalog layer {layer} ≈ {tokens} / {layerBudget}",
			promptsStatusOverrides: "{n} override(s) in force",
			promptsStatusNone: "No overrides: every text is the default",
			promptsStatusDiagnostics: "{n} diagnostic(s)",
			promptsDiagnosticsFold: "Diagnostic details",
			promptsStatusUnavailable2: "The plugin status cannot be read right now (restarting?); refresh in a moment.",
			promptsListTitle: "Texts",
			promptsListHint: "Tool descriptions, guides and skill text the model reads. Edit shows the default beside your override.",
			promptsEntriesTitle: "Group / action / error-hint entries",
			promptsEntriesHint: "Only entries you changed are listed; the rest keep the default.",
			promptsEntriesEmpty: "No entries changed.",
			promptsEntryAdd: "Add entry",
			promptStateDefault: "default",
			promptStateOverridden: "overridden",
			promptChars: "{n} chars",
			promptEditTitle: "Edit: {name}",
			promptDefaultCol: "Default text (read-only)",
			promptMineCol: "Your override",
			promptNoDefault: "(No default text: empty means not set)",
			promptDefaultMissing: "(The default text is loading or unavailable)",
			promptEmptyIsDefault: "Empty uses the default text.",
			promptStart: "Start from default",
			promptRestore: "Restore default",
			promptSave: "Save",
			promptSameAsDefault: "Same as the default text, so it is no override: it is not saved and follows the default when that is improved.",
			promptKindGroups: "group",
			promptKindActions: "action",
			promptKindErrorHints: "error hint",
			promptEntryNewTitle: "Add an entry",
			promptEntryEditTitle: "Edit entry: {key}",
			promptEntryKind: "Kind",
			promptEntryKindHint: "group = one line of the group list; action = the catalog and detail of an action; error hint = text attached to a failed result.",
			promptEntryKey: "Key",
			promptEntryKeyHint: "A group name, group.action (a sub-action or topic adds a third part) or an error code; pick from the suggestions.",
			promptEntryKeyInvalid: "A key holds only letters, digits, _, . and -.",
			promptEntryUnknown: "The defaults have no such key: the plugin ignores it and says so in the diagnostics.",
			promptEntrySummary: "Summary",
			promptEntryNotes: "Notes",
			promptEntryText: "Hint text",
			promptEntryRemove: "Remove override",
			promptExportOpen: "Export default text",
			promptExportTitle: "Default text",
			promptExportYaml: "Commented YAML (recommended)",
			promptExportJson: "JSON",
			promptExportCopy: "Copy",
			promptExportCopied: "Copied",
			promptExportHint: "The YAML says before each section when the model reads it, its length cap and when a change applies; the JSON has exactly the structure of the overrides. Copy it, delete what stays default, reword the rest, and paste it under prompts in the plugin's section of the profile config.",
			promptExportFailed: "The default text cannot be read right now; try again shortly.",
			promptExportLoading: "Loading…"
		};
		//#endregion
		//#region src/client/locales.ts
		const zhBase = {
			title: "浏览器自动化",
			description: "运行时、工具自由度、OpenCLI 与防止过度调用的缓冲策略。",
			expand: "展开设置",
			collapse: "收起设置",
			unsaved: "未保存",
			readOnly: "当前配置只读。",
			freedomHint: "无审批模式只跳过人工确认，不会绕过调用缓冲和参数校验。",
			runtime: "浏览器运行时",
			runtimeHint: "默认 Playwright；遇到兼容性检测时可显式切换 Patchright。",
			usageHint: "限制并发、短时突发、爬取预算，并对 429/503 等响应退避。",
			advanced: "登录态与高级设置",
			advancedHint: "状态文件不要提交到仓库；AuthProfile 必须配置 allowedDomains。",
			enabled: "启用浏览器服务",
			enabledHint: "关闭后浏览器服务不可用。",
			automationMode: "自动化模式",
			automationModeHint: "read-only / standard / autonomous / unrestricted。",
			toolSurface: "工具面形态",
			toolSurfaceHint: "indexed（默认）只常驻 browser_index / browser_call 两个工具；flat 为每个动作注册独立工具，常驻上下文明显更大。保存后需重启 profile。",
			browserRuntime: "运行时提供器",
			browserRuntimeHint: "Patchright 仅支持 Chromium。",
			channel: "浏览器通道",
			channelHint: "chromium、chrome 或 msedge。Patchright 推荐 chrome。",
			cdpPort: "CDP 调试端口",
			cdpPortHint: "可选的本机远程调试端口（1–65535）；留空即关闭。",
			maxSessions: "浏览器会话上限",
			maxSessionsHint: "同时持有页面的 session 数（1–64，默认 8）；超出时关闭最久未使用的。所有 session 共用一个浏览器进程。",
			args: "Chromium 启动参数 JSON",
			argsHint: "可选的字符串数组，例如 [\"--disable-gpu\"]；仅添加你信任并理解其影响的参数。",
			configFileOnly: "结构较复杂，这里不提供表单：请在 profile 配置文件中本插件的配置段里编辑。",
			headless: "无头模式",
			headlessHint: "Patchright 兼容性最佳配置通常是关闭无头模式。",
			opencliEnabled: "启用 OpenCLI",
			opencliEnabledHint: "站点 adapter 和 Chrome Browser Bridge 总开关。",
			usagePolicy: "调用缓冲 JSON",
			usagePolicyHint: "并发、短时突发、爬取预算与退避；只写要改的键。",
			policyKeys: "可用键名：",
			automationAssets: "自动化资产策略 JSON",
			automationAssetsHint: "候选阈值、持久化模式、激活模式、数量与上下文预算、激活所需的输入组数；只写要改的键。",
			assetLibraryHint: "实验功能：候选先提示是否总结；草稿真实回放后再手动激活。源码仅在点选编辑时读取。",
			assetLoading: "正在读取本地自动化资产…",
			assetFailed: "自动化资产读取失败。",
			assetSuggestions: "建议总结",
			assetRuns: "次成功",
			assetSessions: "个会话",
			assetDismiss: "暂不总结",
			assetSummarize: "总结为草稿",
			assetScripts: "脚本与 recipe",
			assetScriptsHint: "模型只能检索已激活资产的有界摘要。",
			assetNewRecipe: "新建 recipe",
			assetNewScript: "新建油猴脚本",
			assetRefresh: "刷新",
			assetEmpty: "还没有资产。",
			assetEditor: "资产编辑器（JSON）",
			assetEditorHint: "选择资产或新建草稿。",
			assetSourceBoundary: "不要保存 cookie、token、密码、完整页面内容或聊天记录。",
			assetValidate: "静态校验",
			assetTest: "真实回放",
			assetTestUrl: "测试 URL（必须命中允许域名）",
			assetTestInputs: "测试输入 JSON（一个对象，或 2–5 个对象组成的数组，每组在全新上下文中回放）",
			assetActivate: "激活",
			assetArchive: "归档",
			assetSaveDraft: "保存草稿",
			assetSaveAndTest: "保存并测试",
			assetUnsaved: "有未保存的修改：测试与激活不会使用它们，直到保存。",
			assetLeaveTitle: "有未保存的修改，离开会丢失它们。",
			assetLeaveConfirm: "放弃修改并继续",
			assetLeaveKeep: "继续编辑",
			assetNoticeJson: "JSON 无效，请求未发出：",
			assetNoticeBackend: "后端错误：",
			assetNoticeValidation: "回放已执行，但业务断言未通过：",
			assetNoticeRefused: "已拦截：",
			assetRevision: "版本",
			assetHash: "内容哈希",
			assetLastTest: "最近测试",
			assetNoTest: "当前版本尚未通过测试，不能激活。",
			assetStaleTest: "最近一次测试针对旧版本",
			assetPassed: "通过",
			assetNotPassed: "未通过",
			assetFork: "创建修复草稿",
			assetDerivedFrom: "派生自",
			assetInputsDigest: "输入摘要",
			assetActivateNeedsSave: "有未保存的修改：先「保存并测试」。",
			assetEditorDirtyBadge: "未保存",
			assetConvert: "转换为 v2",
			assetConverted: "已由「{name}」转换为新的 v2 草稿，原资产未改动。",
			assetPending: "{n} 个步骤仍取第一个匹配（pendingDisambiguation）：先让定位唯一再测试。",
			assetInputSets: "最近一次测试的输入组",
			assetInputSet: "第",
			assetInputSetUnit: "组",
			assetSetsRan: "已运行",
			assetSuspect: "PARAMETERIZATION_SUSPECT：第 {pairs} 组输入不同，输出却完全相同，输入可能没有真正影响结果；测试仍算通过，请检查占位符是否传到了页面。",
			assetNeedsInputSets: "该资产声明了输入：激活要求当前版本的通过测试至少覆盖 {required} 组不同输入（当前 {covered} 组）。在“测试输入 JSON”里填 {required} 到 5 个对象的数组，再测试。",
			prompts: "提示文本",
			promptsHint: "覆盖模型看到的提示和建议文本；留空即使用内置默认值；“导出默认文本”可看到全部默认值。",
			promptsRestart: "两个工具的描述在注册时固定，保存后需重启 profile 才生效；其余文本在下一次调用时即生效。",
			promptsIndexDescription: "browser_index 工具描述",
			promptsIndexDescriptionHint: "常驻上下文，越短越好。上限 1500 字符；需重启生效。",
			promptsCallDescription: "browser_call 工具描述",
			promptsCallDescriptionHint: "合规声明会自动追加在末尾，无法删除。上限 1500 字符；需重启生效。",
			promptsRootGuide: "精简指南（无 skill 时）",
			promptsRootGuideHint: "无 skill 时替换 browser_index 根目录里的精简指南。上限 1500 字符。",
			promptsRootNote: "根目录附言",
			promptsRootNoteHint: "追加在 browser_index 根目录末尾，有 skill 时也显示；写部署方自己的建议。上限 800 字符。",
			promptsSkillEnabled: "注册 dsh-browser skill",
			promptsSkillEnabledHint: "关闭后不注册 skill，根目录改用精简指南。",
			promptsSkillDescription: "skill 描述",
			promptsSkillDescriptionHint: "替换技能列表里的描述。上限 1000 字符。",
			promptsSkillBodyFile: "skill 正文文件",
			promptsSkillBodyFileHint: "用该 Markdown 文件（绝对路径，≤ 20000 字符）替换 SKILL.md 正文；文件缺失或不可读时回退到内置正文。",
			promptsSkillAppend: "skill 正文追加",
			promptsSkillAppendHint: "追加到 skill 正文末尾。上限 4000 字符。",
			promptsDefaults: "默认文本（只读）",
			promptsDefaultsHint: "一份 JSON，结构与上面的覆盖项完全一致。复制后删掉保持默认的部分，改写其余部分，再放进配置；原样放回不会改变任何输出。",
			promptsTooLong: "超出长度上限。",
			promptsRefresh: "刷新",
			promptsLoading: "读取中…",
			autoInstall: "缺失时自动安装 Chromium",
			autoInstallHint: "可能触发较大下载，日常建议关闭并显式执行 runtime.install 动作。",
			storageStatePath: "全局 storageState 路径",
			storageStatePathHint: "旧版兼容入口；新配置优先使用限域 AuthProfile。",
			authProfiles: "AuthProfiles JSON",
			authProfilesHint: "命名登录态、allowedDomains 与 persistState。",
			defaultAuthProfile: "默认 AuthProfile",
			defaultAuthProfileHint: "未显式选择登录态时使用；crawl.crawl 始终匿名。",
			rulePacks: "RulePacks JSON",
			rulePacksHint: "域名匹配、哈希固定 init script 和有界步骤。",
			executablePath: "浏览器可执行文件",
			executablePathHint: "少数自定义部署才需要覆盖。",
			snapshotDir: "快照目录",
			snapshotDirHint: "留空使用 DSH_HOME 下的默认目录。",
			context: "浏览器上下文",
			contextHint: "每个 session 的浏览器上下文创建时的窗口、语言与出口设置；保存后需重启 profile。target.open 也可按次覆盖（代理与 UA 需审批）。",
			viewportMode: "视口模式",
			viewportModeHint: "window（默认，浏览器自带大小）、720p（1280×720）、1080p（1920×1080）或 custom。",
			viewportWidth: "自定义视口宽度",
			viewportWidthHint: "仅 viewportMode=custom 时生效，200–7680 像素。",
			viewportHeight: "自定义视口高度",
			viewportHeightHint: "仅 viewportMode=custom 时生效，200–4320 像素。",
			userAgent: "User-Agent",
			userAgentHint: "留空使用浏览器自带；会改变站点看到的浏览器指纹。",
			locale: "语言区域",
			localeHint: "BCP 47，例如 en-US、zh-CN；留空使用浏览器自带。",
			timezoneId: "时区",
			timezoneIdHint: "IANA 时区，例如 Asia/Shanghai；留空使用本机时区。",
			proxyServer: "代理服务器",
			proxyServerHint: "例如 http://127.0.0.1:7890 或 socks5://127.0.0.1:1080。不支持账号密码，不要把凭据写进这里；留空即直连。",
			proxyBypass: "代理绕过列表",
			proxyBypassHint: "逗号分隔的主机，例如 example.com,.internal.test；需要先配置代理服务器。",
			downloadDir: "下载目录",
			downloadDirHint: "必须是绝对路径；留空使用 DSH_HOME/data/browser/downloads。文件只会写入该目录，重名自动加 -1、-2 后缀，不覆盖。",
			downloadMaxBytes: "单个下载上限（字节）",
			downloadMaxBytesHint: "留空为 104857600（100 MiB）；超出会中止并删除半成品。",
			allowPrivateHosts: "允许内网域名",
			allowPrivateHostsHint: "开启后，agent 经策略动作可把 localhost、.local/.internal 域名和回环/内网 IPv4 写进 allowedDomains。默认关闭；云元数据与链路本地地址始终拒绝。",
			policyOverlay: "策略覆盖层",
			policyOverlayHint: "agent 可经 runtime.* 动作修改的“限制类”设置（authProfile 的域名/新建/删除、usagePolicy 限流项）叠加在上面的基线配置之上，覆盖层优先。收紧不询问；放宽按自动化模式处理，unrestricted 下 agent 可自行放宽，请定期查看这里的审计。",
			policyRevision: "版本",
			policyActive: "覆盖层生效中",
			policyInactive: "没有覆盖，全部取自基线配置",
			policyProfiles: "登录态 AuthProfile（生效值）",
			policyNoProfiles: "没有 AuthProfile。",
			policyOriginBaseline: "基线",
			policyOriginChanged: "来自覆盖层",
			policyOriginCreated: "覆盖层新建",
			policyBaselineWas: "基线为",
			policyAudit: "最近变更审计",
			policyNoAudit: "还没有变更。",
			policyTightened: "收紧",
			policyLoosened: "放宽",
			policyUnchanged: "无变化",
			policyUnavailable: "暂时读不到覆盖层状态，请稍后刷新。",
			policyUnrestrictedNote: "覆盖文件是插件管理的文件，不要手工编辑：被改动或无法解析时会被整体忽略（回退到基线）并在 runtime.status 的 runtimeWarnings 里提示。",
			propertiesHint: "运行时、窗口、语言、代理、目录与限额等“默认值”都在这里：每个新 context 从这些参数起步；agent 每次操作时复制它们，只改任务需要改的部分。",
			propertiesEditor: "默认参数（每行 key = value）",
			propertiesFormat: "格式：每行 `key = value`，值取第一个 = 之后的内容（可用一对双引号包裹）；# 开头为注释，注释行显示当前生效的值。去掉某行或把它注释掉即恢复默认；数组写成一行 JSON，例如 args = [\"--disable-gpu\"]。没有行内注释。",
			verbose: "详细日志",
			verboseHint: "输出启动和诊断信息。",
			reset: "恢复部署值",
			overridden: "已覆盖",
			invalidNumber: "请填写数字，留空表示使用默认值。",
			unavailable: "该插件当前未加载，暂时无法配置。",
			invalid: "值无效，请检查格式或范围。",
			invalidJson: "JSON 或数值范围无效。",
			restart: "保存后完整重启 profile，运行时和工具目录才会重新注册。",
			saved: "配置已同步。",
			pending: "有待保存的修改。",
			saveFailed: "保存失败，草稿已保留。",
			saving: "保存中…",
			save: "保存",
			discard: "放弃修改"
		};
		const enBase = {
			title: "Browser automation",
			description: "Runtime, tool freedom, OpenCLI, and overuse buffering policy.",
			expand: "Expand settings",
			collapse: "Collapse settings",
			unsaved: "Unsaved",
			readOnly: "Configuration is read-only.",
			freedomHint: "No-approval skips human confirmation only; buffering and validation remain active.",
			runtime: "Browser runtime",
			runtimeHint: "Playwright by default; explicitly select Patchright for compatibility-sensitive sites.",
			usageHint: "Bounds concurrency, bursts and crawl budgets, with backoff for 429/503 responses.",
			advanced: "Auth and advanced settings",
			advancedHint: "Never commit state files; AuthProfiles must declare allowedDomains.",
			enabled: "Enable browser service",
			enabledHint: "Disabling makes the browser service unavailable.",
			automationMode: "Automation mode",
			automationModeHint: "read-only / standard / autonomous / unrestricted.",
			toolSurface: "Tool surface",
			toolSurfaceHint: "indexed (default) keeps only browser_index / browser_call in context; flat registers one tool per action, which costs far more context. Restart the profile after saving.",
			browserRuntime: "Runtime provider",
			browserRuntimeHint: "Patchright is Chromium-only.",
			channel: "Browser channel",
			channelHint: "chromium, chrome, or msedge. Patchright recommends chrome.",
			cdpPort: "CDP debugging port",
			cdpPortHint: "Optional local remote-debugging port (1–65535); leave empty to disable.",
			maxSessions: "Browser session limit",
			maxSessionsHint: "Sessions that may hold a page at once (1–64, default 8); past it the least recently used one is closed. One browser process serves them all.",
			args: "Chromium launch arguments JSON",
			argsHint: "Optional array of strings, for example [\"--disable-gpu\"]; add only arguments whose effects you understand and trust.",
			configFileOnly: "Nested structure, so there is no form here: edit it in the plugin's section of the profile config file.",
			headless: "Headless mode",
			headlessHint: "Patchright compatibility is usually strongest in headed mode.",
			opencliEnabled: "Enable OpenCLI",
			opencliEnabledHint: "Master switch for site adapters and the Chrome Browser Bridge.",
			usagePolicy: "Usage buffer JSON",
			usagePolicyHint: "Concurrency, bursts, crawl budgets and backoff; write only the keys you change.",
			policyKeys: "Keys:",
			automationAssets: "Automation asset policy JSON",
			automationAssetsHint: "Candidate thresholds, persistence, activation, counts and context budgets, input sets needed to activate; write only the keys you change.",
			assetLibraryHint: "Experimental: candidates ask before summarization; drafts require runtime replay before manual activation. Source loads only when selected.",
			assetLoading: "Loading local automation assets…",
			assetFailed: "Failed to load automation assets.",
			assetSuggestions: "Summarization suggestions",
			assetRuns: "successful runs",
			assetSessions: "sessions",
			assetDismiss: "Not now",
			assetSummarize: "Summarize to draft",
			assetScripts: "Scripts and recipes",
			assetScriptsHint: "The model can retrieve only bounded summaries of active assets.",
			assetNewRecipe: "New recipe",
			assetNewScript: "New userscript",
			assetRefresh: "Refresh",
			assetEmpty: "No assets yet.",
			assetEditor: "Asset editor (JSON)",
			assetEditorHint: "Select an asset or create a draft.",
			assetSourceBoundary: "Do not store cookies, tokens, passwords, full page content, or conversation transcripts.",
			assetValidate: "Static validate",
			assetTest: "Runtime replay",
			assetTestUrl: "Test URL (must match an allowed domain)",
			assetTestInputs: "Test inputs JSON (one object, or an array of 2–5 objects, each replayed in a fresh context)",
			assetActivate: "Activate",
			assetArchive: "Archive",
			assetSaveDraft: "Save draft",
			assetSaveAndTest: "Save and test",
			assetUnsaved: "Unsaved edits: testing and activation do not use them until they are saved.",
			assetLeaveTitle: "You have unsaved edits; leaving discards them.",
			assetLeaveConfirm: "Discard edits and continue",
			assetLeaveKeep: "Keep editing",
			assetNoticeJson: "Invalid JSON, nothing was sent: ",
			assetNoticeBackend: "Backend error: ",
			assetNoticeValidation: "The replay ran, but the business check did not hold: ",
			assetNoticeRefused: "Blocked: ",
			assetRevision: "Revision",
			assetHash: "Content hash",
			assetLastTest: "Latest test",
			assetNoTest: "This revision has no passed test, so it cannot be activated.",
			assetStaleTest: "The latest test was of an older revision",
			assetPassed: "passed",
			assetNotPassed: "not passed",
			assetFork: "Create repair draft",
			assetDerivedFrom: "Derived from",
			assetInputsDigest: "inputs digest",
			assetActivateNeedsSave: "Unsaved edits: use \"Save and test\" first.",
			assetEditorDirtyBadge: "unsaved",
			assetConvert: "Convert to v2",
			assetConverted: "Converted \"{name}\" into a new v2 draft; the original is untouched.",
			assetPending: "{n} step(s) still take the first match (pendingDisambiguation): make their locators unique before testing.",
			assetInputSets: "Input sets of the latest test",
			assetInputSet: "Set",
			assetInputSetUnit: "",
			assetSetsRan: "ran",
			assetSuspect: "PARAMETERIZATION_SUSPECT: sets {pairs} had different inputs but identical outputs, so the input may not drive the result. The test still passed; check that the placeholder reaches the page.",
			assetNeedsInputSets: "This asset declares inputs: activation needs a passing test of this revision that covered at least {required} different input sets (it covered {covered}). Put an array of {required} to 5 objects in the test inputs, then test.",
			prompts: "Prompt text",
			promptsHint: "Override the guidance and advice text the model reads; leave a field empty for the built-in default. \"Export default text\" shows every default.",
			promptsRestart: "The two tool descriptions are fixed at registration, so they apply after the profile restarts; everything else applies on the next call.",
			promptsIndexDescription: "browser_index tool description",
			promptsIndexDescriptionHint: "Always in context, so keep it short. At most 1500 characters; needs a restart.",
			promptsCallDescription: "browser_call tool description",
			promptsCallDescriptionHint: "The compliance notice is always appended and cannot be removed. At most 1500 characters; needs a restart.",
			promptsRootGuide: "Compact guide (no skill)",
			promptsRootGuideHint: "Replaces the compact guide at the browser_index root when no skill is available. At most 1500 characters.",
			promptsRootNote: "Root note",
			promptsRootNoteHint: "Appended to the end of the browser_index root, also when the skill is available: your own advice. At most 800 characters.",
			promptsSkillEnabled: "Register the dsh-browser skill",
			promptsSkillEnabledHint: "Off: the skill is not registered and the root shows the compact guide instead.",
			promptsSkillDescription: "Skill description",
			promptsSkillDescriptionHint: "Replaces the description in the skill list. At most 1000 characters.",
			promptsSkillBodyFile: "Skill body file",
			promptsSkillBodyFileHint: "A Markdown file (absolute path, at most 20000 characters) that replaces the SKILL.md body; a missing or unreadable file falls back to the packaged body.",
			promptsSkillAppend: "Skill body addition",
			promptsSkillAppendHint: "Appended to the end of the skill body. At most 4000 characters.",
			promptsDefaults: "Default text (read-only)",
			promptsDefaultsHint: "One JSON in the exact structure of the overrides above. Copy it, delete what stays default, reword the rest, and put it in the configuration; pasted back unchanged it changes no output.",
			promptsTooLong: "Over the length limit.",
			promptsRefresh: "Refresh",
			promptsLoading: "Loading…",
			autoInstall: "Auto-install Chromium when missing",
			autoInstallHint: "May download a large binary; running the runtime.install action explicitly is safer for daily use.",
			storageStatePath: "Global storageState path",
			storageStatePathHint: "Legacy fallback; prefer domain-scoped AuthProfiles.",
			authProfiles: "AuthProfiles JSON",
			authProfilesHint: "Named states with allowedDomains and persistState.",
			defaultAuthProfile: "Default AuthProfile",
			defaultAuthProfileHint: "Used when no profile is selected; crawl.crawl is always anonymous.",
			rulePacks: "RulePacks JSON",
			rulePacksHint: "Domain match, hash-pinned init scripts, and bounded steps.",
			executablePath: "Browser executable",
			executablePathHint: "Override only for custom deployments.",
			snapshotDir: "Snapshot directory",
			snapshotDirHint: "Leave empty for the DSH_HOME default.",
			context: "Browser context",
			contextHint: "Window, language and egress settings each session's context is created with; restart the profile after saving. target.open can override them per call (proxy and user agent ask for approval).",
			viewportMode: "Viewport mode",
			viewportModeHint: "window (default, the browser's own size), 720p (1280x720), 1080p (1920x1080) or custom.",
			viewportWidth: "Custom viewport width",
			viewportWidthHint: "Used only with viewportMode=custom, 200-7680 pixels.",
			viewportHeight: "Custom viewport height",
			viewportHeightHint: "Used only with viewportMode=custom, 200-4320 pixels.",
			userAgent: "User agent",
			userAgentHint: "Leave empty for the browser's own; changes the browser fingerprint sites see.",
			locale: "Locale",
			localeHint: "BCP 47, for example en-US or zh-CN; leave empty for the browser's own.",
			timezoneId: "Time zone",
			timezoneIdHint: "IANA time zone such as Asia/Shanghai; leave empty for this machine's.",
			proxyServer: "Proxy server",
			proxyServerHint: "For example http://127.0.0.1:7890 or socks5://127.0.0.1:1080. Accounts and passwords are not supported, so keep credentials out of it; empty means direct.",
			proxyBypass: "Proxy bypass list",
			proxyBypassHint: "Comma-separated hosts such as example.com,.internal.test; needs a proxy server.",
			downloadDir: "Download directory",
			downloadDirHint: "An absolute path; empty uses DSH_HOME/data/browser/downloads. Files are written only there, a taken name gets -1, -2 and nothing is overwritten.",
			downloadMaxBytes: "Largest download (bytes)",
			downloadMaxBytesHint: "Empty means 104857600 (100 MiB); a bigger download is aborted and its partial file removed.",
			allowPrivateHosts: "Allow private hosts",
			allowPrivateHostsHint: "When on, an agent policy change may name localhost, .local/.internal names and loopback or private-network IPv4 addresses in allowedDomains. Off by default; cloud metadata and link-local addresses are always refused.",
			policyOverlay: "Policy overlay",
			policyOverlayHint: "Restriction settings an agent may change through the runtime.* actions (auth-profile domains, creating or removing profiles, usagePolicy limits) are layered over the baseline configuration above; the overlay wins. Tightening is not asked about; loosening follows the automation mode, and under unrestricted an agent may loosen on its own, so review the audit here.",
			policyRevision: "Revision",
			policyActive: "overlay active",
			policyInactive: "no overlay: everything comes from the baseline configuration",
			policyProfiles: "Auth profiles (effective)",
			policyNoProfiles: "No auth profiles.",
			policyOriginBaseline: "baseline",
			policyOriginChanged: "from overlay",
			policyOriginCreated: "created by overlay",
			policyBaselineWas: "baseline was",
			policyAudit: "Recent change audit",
			policyNoAudit: "No changes yet.",
			policyTightened: "tightened",
			policyLoosened: "loosened",
			policyUnchanged: "no change",
			policyUnavailable: "The overlay status is not available right now; refresh in a moment.",
			policyUnrestrictedNote: "The overlay file is managed by the plugin; do not edit it by hand. A file that was changed or cannot be parsed is ignored as a whole (the baseline applies) and reported in runtime.status runtimeWarnings.",
			propertiesHint: "Runtime, window, language, proxy, directories and limits are defaults, and they live here: every new context starts from these parameters, and an agent copies them for a task and changes only what the task needs.",
			propertiesEditor: "Default parameters (one key = value per line)",
			propertiesFormat: "Format: one `key = value` per line; the value is everything after the first = (one pair of double quotes may wrap it). A line starting with # is a comment and shows the value in force. Delete or comment a line to go back to the default. Arrays are one JSON line, for example args = [\"--disable-gpu\"]. There are no inline comments.",
			verbose: "Verbose logs",
			verboseHint: "Emit startup and diagnostic details.",
			reset: "Restore deployed",
			overridden: "Overridden",
			invalidNumber: "Enter a number, or leave blank to use the default.",
			unavailable: "This plugin is not loaded, so it cannot be configured right now.",
			invalid: "Invalid value. Check format and bounds.",
			invalidJson: "Invalid JSON or numeric bounds.",
			restart: "Fully restart the profile after saving so runtime and tool catalogs are re-registered.",
			saved: "Configuration is synchronized.",
			pending: "Changes are ready to save.",
			saveFailed: "Save failed; the draft was retained.",
			saving: "Saving…",
			save: "Save",
			discard: "Discard"
		};
		/** The card's dictionary: the base entries, with the settings redesign's entries laid over them (a key present in both takes the redesign's text). */
		const zh = {
			...zhBase,
			...zhUi,
			...zhPolicy,
			...zhPrompts
		};
		const en = {
			...enBase,
			...enUi,
			...enPolicy,
			...enPrompts
		};
		//#endregion
		//#region src/client/settings-namespace.ts
		/** The settings namespace: the loader entry id of the bundle patch row (`cordis.patch.yml`), which `ctx.configForms` addresses. */
		const SETTINGS_NAMESPACE = "browser";
		//#endregion
		//#region src/client/index.ts
		const name = "dsh-browser-client";
		const inject = [
			"slots",
			"locale",
			"connection",
			"configForms"
		];
		const NS = "dsh-browser.card";
		function apply(ctx) {
			ensureStyles();
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "dsh-browser: settings dictionaries");
			const rpc = ctx.connection.rpc;
			const assets = new AutomationAssetsController(rpc);
			const prompts = new PromptsStatusController(rpc);
			const controller = new BrowserSettingsController(ctx.configForms.get(SETTINGS_NAMESPACE), () => prompts.promptDefaults());
			const policy = new PolicyStatusController(ctx.connection.rpc);
			ctx.effect(() => () => controller.dispose(), "dsh-browser: settings controller");
			ctx.effect(() => () => prompts.dispose(), "dsh-browser: prompts status controller");
			ctx.effect(() => () => policy.dispose(), "dsh-browser: policy status controller");
			ctx.effect(() => () => assets.dispose(), "dsh-browser: automation assets controller");
			ctx.effect(() => ctx.configForms.whileServed([SETTINGS_NAMESPACE], () => ctx.slots.inject("plugins.bundle.config", () => ctx.slots.register({
				name: "plugins.bundle.config",
				key: "@anweat/dsh-browser",
				locale: NS,
				inject: () => {
					const settingsProps = controller.inject();
					const assetProps = assets.inject();
					const promptsProps = prompts.inject();
					const policyProps = policy.inject();
					return {
						...settingsProps,
						...assetProps,
						...promptsProps,
						...policyProps,
						hooks: {
							...settingsProps.hooks,
							...assetProps.hooks,
							...promptsProps.hooks,
							...policyProps.hooks
						}
					};
				}
			}, SettingsCard))), "dsh-browser: settings page");
		}
		//#endregion
		exports.NS = NS;
		exports.SETTINGS_NAMESPACE = SETTINGS_NAMESPACE;
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map