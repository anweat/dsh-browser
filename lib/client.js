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
			booleanField("verbose")
		];
		/** The JSON-shaped section fields: objects (policies, prompts) and the launch-argument array. */
		const JSON_FIELD_SPECS = [
			jsonField("usagePolicy", validUsagePolicy),
			jsonField("automationAssets", validAssetPolicy),
			jsonField("prompts", validPrompts),
			stringArrayField("args")
		];
		/**
		* Public config fields the card has no form for, on purpose: nested records (named login states, rule packs with
		* hash-pinned scripts) that are safer to edit in the profile config file. The card names each one and says so, instead
		* of leaving it out without a word. `rulePacks` is not `.volatile()` in the Host schema, so no form could write it.
		*/
		const CONFIG_FILE_ONLY_FIELDS = ["authProfiles", "rulePacks"];
		/** Section fields rendered as JSON code editors rather than single inputs. */
		const JSON_FIELDS = new Set(JSON_FIELD_SPECS.map((spec) => spec.field));
		/** Every field the card renders, in display order. */
		const ALL_FIELD_SPECS = [...FIELD_SPECS, ...JSON_FIELD_SPECS];
		var BrowserSettingsController = class {
			scope;
			form;
			store;
			/** What the person typed in the groups/actions/errorHints box, kept verbatim while it is not valid JSON yet. */
			extrasRaw;
			extrasInvalid = false;
			constructor(scope) {
				this.scope = scope;
				this.form = new _deepseek_ai_dsh_client_ui_primitives.SettingsFormModel(scope, [...ALL_FIELD_SPECS]);
				this.store = this.form.bind(() => this.project());
			}
			inject() {
				const actions = this.form.actions();
				return {
					hooks: { browserSettings: this.store },
					...actions,
					save: () => this.save(),
					discard: () => {
						this.extrasRaw = void 0;
						this.extrasInvalid = false;
						actions.discard();
					},
					editPromptText: (id, text) => this.editPromptText(id, text),
					setPromptSkillEnabled: (enabled) => this.setPromptSkillEnabled(enabled),
					editPromptExtras: (text) => this.editPromptExtras(text),
					resetPromptExtras: () => this.resetPromptExtras()
				};
			}
			async save() {
				if (this.extrasInvalid) return;
				await this.form.save();
				if (!this.form.shell().failed && this.extrasRaw !== void 0) {
					this.extrasRaw = void 0;
					this.refresh();
				}
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
			editPromptText(id, text) {
				const field = PROMPT_TEXT_FIELDS.find((entry) => entry.id === id);
				this.stagePrompts(setAt(this.promptsDraft(), field.path, text.trim() === "" ? void 0 : text));
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
						this.stagePrompts(withExtras(this.promptsDraft(), value));
						return;
					}
				} catch {}
				this.extrasInvalid = true;
				this.refresh();
			}
			/** Back to the plugin's own text for groups, actions and error hints. */
			resetPromptExtras() {
				this.extrasRaw = void 0;
				this.extrasInvalid = false;
				this.stagePrompts(withExtras(this.promptsDraft(), {}));
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
				return {
					...shell,
					invalid: shell.invalid || this.extrasInvalid,
					fields,
					jsonFields,
					prompts: this.projectPrompts(jsonFields.prompts)
				};
			}
			projectPrompts(field) {
				const draft = this.promptsDraft();
				const texts = {};
				for (const entry of PROMPT_TEXT_FIELDS) {
					const value = getAt(draft, entry.path);
					const text = typeof value === "string" ? value : "";
					texts[entry.id] = {
						text,
						invalid: text.length > entry.limit
					};
				}
				return {
					texts,
					skillEnabled: getAt(draft, ["skill", "enabled"]) !== false,
					extras: {
						text: this.extrasRaw ?? extrasText(draft),
						invalid: this.extrasInvalid
					},
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
		const CHANNEL$1 = "/dsh-browser-assets";
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
				const result = await this.rpc.call(CHANNEL$1, endpoint, payload);
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
		const CHANNEL = "/dsh-browser-assets";
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
			}
			inject() {
				return {
					hooks: { promptsStatus: this.store },
					refreshPromptsStatus: () => {
						this.refresh();
					},
					exportPromptDefaults: () => this.exportDefaults(),
					hidePromptDefaults: () => {
						const { defaults: _defaults, defaultsFailed: _failed, ...rest } = this.store.getSnapshot();
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
			/** Load the default prompt texts as JSON, for the read-only box under the section. */
			async exportDefaults() {
				try {
					const result = await this.rpc.call(CHANNEL, "promptsDefaults", {});
					if (!result.ok) throw new Error(result.error.message);
					const { defaultsFailed: _failed, ...rest } = this.store.getSnapshot();
					this.publish({
						...rest,
						defaults: result.value.json
					});
				} catch {
					this.publish({
						...this.store.getSnapshot(),
						defaultsFailed: true
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
					const result = await this.rpc.call(CHANNEL, "prompts", {});
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
		//#region src/client/styles.ts
		const styles = {
			card: "dsb-card",
			open: "dsb-open",
			header: "dsb-header",
			head: "dsb-head",
			titleRow: "dsb-title-row",
			name: "dsb-name",
			description: "dsb-description",
			badge: "dsb-badge",
			chevron: "dsb-chevron",
			chevronOpen: "dsb-chevron-open",
			body: "dsb-body",
			notice: "dsb-notice",
			section: "dsb-section",
			sectionHead: "dsb-section-head",
			grid: "dsb-grid",
			field: "dsb-field",
			invalid: "dsb-invalid",
			fieldHead: "dsb-field-head",
			label: "dsb-label",
			hint: "dsb-hint",
			input: "dsb-input",
			textarea: "dsb-textarea",
			code: "dsb-code",
			reset: "dsb-reset",
			toggle: "dsb-toggle",
			toggleLabel: "dsb-toggle-label",
			check: "dsb-check",
			advanced: "dsb-advanced",
			footer: "dsb-footer",
			status: "dsb-status",
			failed: "dsb-failed",
			actions: "dsb-actions",
			primary: "dsb-primary",
			secondary: "dsb-secondary",
			assetGroup: "dsb-asset-group",
			assetRow: "dsb-asset-row",
			assetToolbar: "dsb-asset-toolbar",
			assetLayout: "dsb-asset-layout",
			assetList: "dsb-asset-list",
			assetItem: "dsb-asset-item",
			assetSelected: "dsb-asset-selected",
			assetTest: "dsb-asset-test",
			assetTestForm: "dsb-asset-test-form",
			assetEditor: "dsb-asset-editor",
			invalidInput: "dsb-invalid-input"
		};
		function ensureStyles() {
			if (document.getElementById("dsh-browser-settings-styles")) return;
			const style = document.createElement("style");
			style.id = "dsh-browser-settings-styles";
			style.textContent = `
.dsb-card{list-style:none;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-3);transition:border-color .16s,background .16s}.dsb-card:hover{border-color:var(--dsw-alias-label-dimmed)}.dsb-open{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}
.dsb-header{width:100%;appearance:none;border:0;background:none;font:inherit;color:inherit;text-align:left;cursor:pointer;display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:12px}.dsb-header:focus-visible,.dsb-input:focus-visible,.dsb-reset:focus-visible,.dsb-primary:focus-visible,.dsb-secondary:focus-visible,.dsb-check:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.dsb-head{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}.dsb-title-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.dsb-name{font-size:15px;font-weight:600;color:var(--dsw-alias-label-primary)}.dsb-description,.dsb-hint,.dsb-section-head p{font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary);margin:0}.dsb-badge{font-size:11px;padding:2px 7px;border-radius:9px;color:var(--dsw-alias-brand-primary);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 12%,transparent)}
.dsb-chevron{flex:none;color:var(--dsw-alias-label-tertiary);transition:transform .16s}.dsb-chevron-open{transform:rotate(180deg)}.dsb-body{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding:4px 0 8px}.dsb-notice{margin:12px 0 0;padding:9px 11px;border-radius:8px;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-bg-layer-3)}
.dsb-section{padding:18px 0}.dsb-section+.dsb-section{border-top:1px solid var(--dsw-alias-border-l2)}.dsb-section-head{margin-bottom:14px}.dsb-section-head h3{margin:0;font-size:14px;color:var(--dsw-alias-label-primary)}.dsb-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px 16px}.dsb-field{display:flex;min-width:0;flex-direction:column;gap:6px}.dsb-field-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.dsb-label{font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary)}
.dsb-input{box-sizing:border-box;width:100%;min-width:0;height:34px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-3);font:inherit;font-size:13px;color:var(--dsw-alias-label-primary)}.dsb-input:focus-visible{outline:none;border-color:var(--dsw-alias-brand-primary)}.dsb-input:disabled{opacity:.55}.dsb-invalid .dsb-input{border-color:var(--dsw-alias-label-error)}.dsb-textarea{height:auto;padding:9px 10px;resize:vertical;line-height:1.45}.dsb-code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px}.dsb-reset{appearance:none;border:0;background:none;padding:0;color:var(--dsw-alias-brand-primary);font:inherit;font-size:11px;cursor:pointer}
.dsb-toggle{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding-top:2px}.dsb-toggle-label{display:flex;align-items:flex-start;gap:9px;cursor:pointer}.dsb-check{width:16px;height:16px;flex:none;margin:2px 0 0;accent-color:var(--dsw-alias-brand-primary)}.dsb-advanced{padding:16px 0;border-top:1px solid var(--dsw-alias-border-l2)}.dsb-advanced>summary{cursor:pointer;font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary)}
.dsb-footer{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 0 4px;border-top:1px solid var(--dsw-alias-border-l2)}.dsb-status,.dsb-failed{margin:0;font-size:12px}.dsb-status{color:var(--dsw-alias-label-tertiary)}.dsb-failed{color:var(--dsw-alias-label-error)}.dsb-actions{display:flex;gap:8px}.dsb-primary,.dsb-secondary{appearance:none;border-radius:8px;padding:6px 14px;font:inherit;font-size:13px;cursor:pointer}.dsb-primary{border:1px solid transparent;background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}.dsb-secondary{border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary)}.dsb-primary:disabled,.dsb-secondary:disabled,.dsb-reset:disabled{opacity:.4;cursor:default}
.dsb-asset-group{display:flex;flex-direction:column;gap:8px;margin-bottom:16px}.dsb-asset-group h4{margin:0;font-size:13px}.dsb-asset-row,.dsb-asset-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px;border:1px solid var(--dsw-alias-border-l2);border-radius:9px}.dsb-asset-row p,.dsb-asset-toolbar p{margin:3px 0 0;font-size:11px;color:var(--dsw-alias-label-tertiary)}.dsb-asset-toolbar{margin-bottom:10px;border:0;padding:0}.dsb-asset-layout{display:grid;grid-template-columns:minmax(180px,.7fr) minmax(0,1.3fr);gap:12px}.dsb-asset-list{display:flex;flex-direction:column;gap:6px;max-height:500px;overflow:auto}.dsb-asset-item{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;padding:9px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);text-align:left;cursor:pointer}.dsb-asset-item span:first-child{display:flex;min-width:0;flex-direction:column;gap:3px}.dsb-asset-item small,.dsb-asset-test{font-size:10px;color:var(--dsw-alias-label-tertiary)}.dsb-asset-selected{border-color:var(--dsw-alias-brand-primary);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 8%,var(--dsw-alias-bg-layer-3))}.dsb-asset-editor{display:flex;min-width:0;flex-direction:column;gap:8px}.dsb-asset-editor .dsb-actions{justify-content:flex-end;flex-wrap:wrap}.dsb-invalid-input{border-color:var(--dsw-alias-label-error)}
.dsb-asset-test-form{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px}.dsb-asset-test-form .dsb-textarea{min-height:64px}
@media(max-width:720px){.dsb-grid,.dsb-asset-layout{grid-template-columns:minmax(0,1fr)}.dsb-footer,.dsb-asset-row,.dsb-asset-toolbar{align-items:stretch;flex-direction:column}.dsb-actions{justify-content:flex-end}}@media(max-width:420px){.dsb-body{margin:0 12px}.dsb-actions{display:grid;grid-template-columns:1fr 1fr}.dsb-primary,.dsb-secondary{width:100%}}
`;
			document.head.append(style);
		}
		//#endregion
		//#region src/client/SettingsCard.tsx
		/**
		* The browser settings card, as the Plugins page renders it.
		*
		* The page owns the card frame — its title button, disclosure, and artwork come
		* from the slot registration — so this component renders only what goes inside:
		* the one-liner for `view: 'summary'`, and the form body for `view: 'page'`.
		* Drawing our own frame here produced a doubled card and an inner header button
		* that swallowed the platform's clicks.
		*
		* The form chrome is the shared `SettingsForm`/`SettingsValueField` pair from
		* `@deepseek-ai/dsh-client-ui-primitives`, the same components every official
		* settings page uses, so the card matches them without restating their markup.
		* @module dsh-browser/client/SettingsCard
		*/
		/** Fill `{name}` placeholders of a dictionary entry. */
		const fill = (text, values) => text.replace(/\{(\w+)\}/g, (_match, key) => String(values[key] ?? ""));
		/** The copy the shared form frame renders, from this page's dictionary. */
		function formLabels(t) {
			return {
				unavailable: t("unavailable"),
				readOnly: t("readOnly"),
				saveFailed: t("saveFailed"),
				save: t("save"),
				saving: t("saving")
			};
		}
		/**
		* Which fields each section shows, by field name, and which public fields it only names ("edit in the config file").
		* A public config field missing from here and from the prompt/usage sections would be silently absent from the card;
		* test/settings-card-render.test.ts renders the card and checks every Config field is a control or a note.
		*/
		const SECTION_LAYOUT = [
			{
				title: "freedom",
				hint: "freedomHint",
				fields: [
					"enabled",
					"automationMode",
					"toolSurface",
					"opencliEnabled"
				]
			},
			{
				title: "runtime",
				hint: "runtimeHint",
				fields: [
					"browserRuntime",
					"channel",
					"headless",
					"autoInstall",
					"executablePath",
					"cdpPort",
					"maxSessions",
					"args"
				]
			},
			{
				title: "advanced",
				hint: "advancedHint",
				fields: [
					"storageStatePath",
					"defaultAuthProfile",
					"snapshotDir",
					"verbose"
				],
				notes: CONFIG_FILE_ONLY_FIELDS
			}
		];
		/** The usage section's JSON boxes. */
		const USAGE_FIELDS = ["usagePolicy", "automationAssets"];
		/** The keys each JSON policy box accepts, generated from the code's own lists so the hint cannot leave one out. */
		const POLICY_KEY_LISTS = {
			usagePolicy: USAGE_POLICY_KEYS,
			automationAssets: ASSET_POLICY_KEYS
		};
		/** The single-input fields, where `state.fields` holds their state. */
		const SINGLE_INPUT_FIELDS = new Set(FIELD_SPECS.map((spec) => spec.field));
		function SettingsCard(props) {
			const { t } = props;
			const state = props.useBrowserSettings((snapshot) => snapshot);
			if (props.view === "summary") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: t("description") });
			const disabled = !state.writable;
			const numeric = /* @__PURE__ */ new Set(["cdpPort", "maxSessions"]);
			const field = (name) => {
				const fieldState = SINGLE_INPUT_FIELDS.has(name) ? state.fields[name] : state.jsonFields[name];
				const policyKeys = POLICY_KEY_LISTS[name];
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.SettingsValueField, {
					id: `plugin-config-dsh-browser-${name}`,
					label: t(name),
					hint: policyKeys ? `${t(`${name}Hint`)} ${t("policyKeys")} ${policyKeys.join(", ")}` : t(`${name}Hint`),
					overriddenLabel: t("overridden"),
					resetLabel: t("reset"),
					invalidLabel: t(JSON_FIELDS.has(name) ? "invalidJson" : "invalidNumber"),
					numeric: numeric.has(name),
					disabled,
					...fieldState,
					onEdit: (text) => props.edit(name, text),
					onReset: () => props.resetField(name)
				}, name);
			};
			/** A public field with no form: its name, what it is for, and where to edit it. */
			const configFileNote = (name) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
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
			}, name);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.SettingsForm, {
				labels: formLabels(t),
				state,
				onSave: props.save,
				onDiscard: props.discard,
				children: [
					SECTION_LAYOUT.map((section) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: styles.section,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: styles.sectionHead,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t(section.title) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t(section.hint) })]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: styles.grid,
							children: [section.fields.map((name) => field(name)), section.notes?.map((name) => configFileNote(name))]
						})]
					}, section.title)),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: styles.section,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: styles.sectionHead,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("usage") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("usageHint") })]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: styles.grid,
								children: USAGE_FIELDS.map((name) => field(name))
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: styles.notice,
								role: "note",
								children: t("restart")
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PromptsPanel, {
						...props,
						disabled
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(AutomationAssetsPanel, { ...props })
				]
			});
		}
		/** Label and hint keys of each text control, by field id. */
		const PROMPT_LABELS = {
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
		/**
		* The "prompt text" section: the text the model reads, overridable. The controls are views of one staged `prompts`
		* draft that saves with the rest of the form; the status block below shows what the running plugin reports about it.
		*/
		function PromptsPanel(props) {
			const { t, disabled } = props;
			const settings = props.useBrowserSettings((snapshot) => snapshot);
			const status = props.usePromptsStatus((snapshot) => snapshot);
			const { refreshPromptsStatus } = props;
			(0, react.useEffect)(() => {
				if (!settings.saving) refreshPromptsStatus();
			}, [settings.saving, refreshPromptsStatus]);
			const prompts = settings.prompts;
			const report = status.status;
			const text = (id) => {
				const spec = PROMPT_TEXT_FIELDS.find((entry) => entry.id === id);
				const state = prompts.texts[id];
				const labels = PROMPT_LABELS[id];
				const inputId = `plugin-config-dsh-browser-prompts-${id}`;
				const common = {
					id: inputId,
					className: `${styles.input} ${state.invalid ? styles.invalidInput : ""}`,
					value: state.text,
					disabled,
					"aria-invalid": state.invalid || void 0,
					onChange: (value) => props.editPromptText(id, value)
				};
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: styles.field,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: styles.fieldHead,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
								className: styles.label,
								htmlFor: inputId,
								children: t(labels.label)
							}), state.text ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: styles.reset,
								disabled,
								onClick: () => props.editPromptText(id, ""),
								children: t("promptsReset")
							}) : null]
						}),
						spec.multiline ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
							...common,
							className: `${common.className} ${styles.textarea}`,
							rows: id === "rootNote" ? 3 : 5,
							spellCheck: false,
							onChange: (event) => common.onChange(event.currentTarget.value)
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							...common,
							type: "text",
							onChange: (event) => common.onChange(event.currentTarget.value)
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
							className: state.invalid ? styles.failed : styles.hint,
							children: [state.invalid ? t("promptsTooLong") : t(labels.hint), spec.limit > 1024 || state.text ? ` (${state.text.length}/${spec.limit})` : ""]
						})
					]
				}, id);
			};
			const budgetLine = report ? `${t("promptsL0")}: ~${report.budget.l0Tokens} ${t("promptsTokens")} (${t("promptsBudget")} ${report.budget.l0Budget}) · ${t("promptsLargest")}: ${report.budget.largestLayer.name} ~${report.budget.largestLayer.tokens} (${t("promptsBudget")} ${report.budget.layerBudget})` : "";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: styles.section,
				"data-dsh-browser-prompts": true,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: styles.sectionHead,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("prompts") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("promptsHint") })]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: styles.grid,
						children: [
							text("indexDescription"),
							text("callDescription"),
							text("rootGuide"),
							text("rootNote")
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: styles.grid,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: styles.field,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: styles.toggleLabel,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "checkbox",
										className: styles.check,
										checked: prompts.skillEnabled,
										disabled,
										onChange: (event) => props.setPromptSkillEnabled(event.currentTarget.checked)
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: styles.label,
										children: t("promptsSkillEnabled")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: styles.hint,
										children: t("promptsSkillEnabledHint")
									})] })]
								})
							}),
							text("skillDescription"),
							text("skillBodyFile"),
							text("skillAppend")
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: styles.field,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: styles.fieldHead,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
									className: styles.label,
									htmlFor: "plugin-config-dsh-browser-prompts-extras",
									children: t("promptsExtras")
								}), prompts.extras.text ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: styles.reset,
									disabled,
									onClick: props.resetPromptExtras,
									children: t("promptsExtrasReset")
								}) : null]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
								id: "plugin-config-dsh-browser-prompts-extras",
								className: `${styles.input} ${styles.textarea} ${styles.code} ${prompts.extras.invalid ? styles.invalidInput : ""}`,
								rows: 10,
								spellCheck: false,
								disabled,
								"aria-invalid": prompts.extras.invalid || void 0,
								value: prompts.extras.text,
								onChange: (event) => props.editPromptExtras(event.currentTarget.value)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: prompts.extras.invalid ? styles.failed : styles.hint,
								role: prompts.extras.invalid ? "alert" : void 0,
								children: prompts.extras.invalid ? t("promptsExtrasInvalid") : t("promptsExtrasHint")
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: styles.notice,
						role: "status",
						"data-dsh-browser-prompts-status": true,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("promptsStatus") }),
							" ",
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: styles.reset,
								onClick: refreshPromptsStatus,
								children: t("promptsRefresh")
							}),
							status.loading && !report ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("promptsLoading") }) : null,
							status.failed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("promptsStatusUnavailable") }) : null,
							report ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									"data-dsh-browser-prompts-budget": true,
									children: budgetLine
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: report.overrides.length ? `${report.overrides.length} ${t("promptsOverrides")}: ${report.overrides.map((entry) => entry.length === void 0 ? entry.key : `${entry.key} (${entry.length})`).join(", ")}` : t("promptsNoOverrides") }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [
									t("promptsDiagnostics"),
									": ",
									report.diagnostics.length ? "" : t("promptsNoDiagnostics")
								] }),
								report.diagnostics.length ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
									"data-dsh-browser-prompts-diagnostics": true,
									children: report.diagnostics.map((entry, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: entry.message }, index))
								}) : null
							] }) : null
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: styles.field,
						"data-dsh-browser-prompts-export": true,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: styles.fieldHead,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: styles.label,
									children: t("promptsDefaults")
								}), status.defaults === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: styles.secondary,
									onClick: () => void props.exportPromptDefaults(),
									children: t("promptsExport")
								}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: styles.actions,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: styles.secondary,
										onClick: () => {
											navigator.clipboard?.writeText(status.defaults ?? "").catch(() => void 0);
										},
										children: t("promptsCopy")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: styles.secondary,
										onClick: props.hidePromptDefaults,
										children: t("promptsHideDefaults")
									})]
								})]
							}),
							status.defaults !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
								className: `${styles.input} ${styles.textarea} ${styles.code}`,
								rows: 12,
								readOnly: true,
								spellCheck: false,
								"aria-label": t("promptsDefaults"),
								value: status.defaults,
								onFocus: (event) => event.currentTarget.select(),
								"data-dsh-browser-prompts-defaults": true
							}) : null,
							status.defaultsFailed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: styles.failed,
								role: "alert",
								children: t("promptsDefaultsFailed")
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: styles.hint,
								children: t("promptsDefaultsHint")
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: styles.notice,
						role: "note",
						children: t("promptsRestart")
					})
				]
			});
		}
		function AutomationAssetsPanel(props) {
			const { t } = props;
			const state = props.useAutomationAssets((snapshot) => snapshot);
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
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: styles.section,
				"data-dsh-browser-assets": true,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: styles.sectionHead,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("assetLibrary") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("assetLibraryHint") })]
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
					candidates.length ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: styles.assetGroup,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", { children: t("assetSuggestions") }), candidates.map((candidate) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
							className: styles.assetRow,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: candidate.title }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [
								candidate.domain,
								" · ",
								candidate.successfulRuns,
								" ",
								t("assetRuns"),
								" · ",
								candidate.distinctSessions,
								" ",
								t("assetSessions")
							] })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: styles.actions,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: styles.secondary,
									disabled: state.busy,
									onClick: () => props.dismissAutomationCandidate(candidate.id),
									children: t("assetDismiss")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: styles.primary,
									disabled: state.busy,
									onClick: () => props.summarizeAutomationCandidate(candidate.id),
									children: t("assetSummarize")
								})]
							})]
						}, candidate.id))]
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: styles.assetToolbar,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("assetScripts") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: styles.hint,
							children: t("assetScriptsHint")
						})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: styles.actions,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: styles.secondary,
									onClick: () => props.requestNewAutomationAsset("recipe"),
									children: t("assetNewRecipe")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: styles.secondary,
									onClick: () => props.requestNewAutomationAsset("userscript"),
									children: t("assetNewScript")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: styles.secondary,
									onClick: props.requestRefreshAutomationAssets,
									children: t("assetRefresh")
								})
							]
						})]
					}),
					editor.confirm ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: styles.failed,
						role: "alertdialog",
						"aria-label": t("assetLeaveTitle"),
						"data-dsh-browser-leave": true,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("assetLeaveTitle") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: styles.actions,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: styles.secondary,
								onClick: props.cancelLeaveAutomationAsset,
								children: t("assetLeaveKeep")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: styles.primary,
								onClick: props.confirmLeaveAutomationAsset,
								children: t("assetLeaveConfirm")
							})]
						})]
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: styles.assetLayout,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: styles.assetList,
							children: assets.length ? assets.map((asset) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: `${styles.assetItem} ${selected?.id === asset.id ? styles.assetSelected : ""}`,
								onClick: () => props.requestSelectAutomationAsset(asset.id),
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: asset.name }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("small", { children: [
									asset.kind,
									" · ",
									asset.status,
									" · r",
									asset.revision
								] })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: styles.assetTest,
									children: asset.testStatus
								})]
							}, asset.id)) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: styles.hint,
								children: t("assetEmpty")
							})
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
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
									onChange: (event) => props.editAutomationAsset(event.currentTarget.value)
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
										onChange: (event) => props.setAssetTestUrl(event.currentTarget.value)
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
										className: `${styles.input} ${styles.textarea} ${styles.code}`,
										rows: 3,
										value: editor.testInputs,
										spellCheck: false,
										"aria-label": t("assetTestInputs"),
										onChange: (event) => props.setAssetTestInputs(event.currentTarget.value)
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
										selected ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: styles.secondary,
											disabled: state.busy || dirty,
											onClick: () => props.validateAutomationAsset(selected.id),
											children: t("assetValidate")
										}) : null,
										draft || !selected ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: styles.secondary,
											disabled: state.busy || !editor.testUrl.trim() || !editor.text,
											onClick: () => void props.saveAndTestAutomationAsset(),
											children: saveFirst ? t("assetSaveAndTest") : t("assetTest")
										}) : null,
										draft ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
											type: "button",
											className: styles.secondary,
											disabled: state.busy || dirty || !credentials.vouches || !!shortfall,
											title: dirty ? t("assetActivateNeedsSave") : shortfallText || void 0,
											onClick: () => void props.activateAutomationAsset(),
											children: [
												t("assetActivate"),
												" r",
												selected.revision
											]
										}) : null,
										convertible ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: styles.secondary,
											disabled: state.busy,
											onClick: () => props.requestConvertAutomationAsset(selected.id),
											children: t("assetConvert")
										}) : null,
										selected && selected.status !== "draft" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: styles.secondary,
											disabled: state.busy,
											onClick: () => props.requestForkAutomationAsset(selected.id),
											children: t("assetFork")
										}) : null,
										selected && selected.status !== "archived" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: styles.secondary,
											disabled: state.busy,
											onClick: () => props.setAutomationAssetStatus(selected.id, "archived"),
											children: t("assetArchive")
										}) : null,
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: styles.primary,
											disabled: state.busy || !editor.text || selected?.status === "active",
											onClick: () => void props.saveEditedAutomationAsset(),
											children: t("assetSaveDraft")
										})
									]
								})
							]
						})]
					})
				]
			});
		}
		//#endregion
		//#region src/client/locales.ts
		const zh = {
			title: "浏览器自动化",
			description: "运行时、工具自由度、OpenCLI 与防止过度调用的缓冲策略。",
			expand: "展开设置",
			collapse: "收起设置",
			unsaved: "未保存",
			readOnly: "当前配置只读。",
			freedom: "自动化自由度",
			freedomHint: "无审批模式只跳过人工确认，不会绕过调用缓冲和参数校验。",
			runtime: "浏览器运行时",
			runtimeHint: "默认 Playwright；遇到兼容性检测时可显式切换 Patchright。",
			usage: "使用策略缓冲",
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
			assetLibrary: "可复用自动化资产（实验性）",
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
			assetInvalid: "JSON、测试 URL 或输入无效。",
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
			promptsExtras: "分组 / 动作 / 错误提示覆盖 JSON",
			promptsExtrasHint: "{\"groups\":{\"act\":{\"summary\":\"…\"}},\"actions\":{\"act.click\":{\"summary\":\"…\",\"notes\":\"…\"}},\"errorHints\":{\"DEADLINE\":\"…\"}}。动作名可含子动作（automation.develop.save）和详情页（observe.read.controls）。",
			promptsDefaults: "默认文本（只读）",
			promptsExport: "导出默认文本",
			promptsCopy: "复制",
			promptsHideDefaults: "收起",
			promptsDefaultsHint: "一份 JSON，结构与上面的覆盖项完全一致。复制后删掉保持默认的部分，改写其余部分，再放进配置；原样放回不会改变任何输出。",
			promptsDefaultsFailed: "暂时读不到默认文本（保存后插件会重启，稍后再试）。",
			promptsExtrasReset: "恢复默认",
			promptsReset: "恢复默认",
			promptsExtrasInvalid: "JSON 无效，或键名、类型、长度超出限制。",
			promptsTooLong: "超出长度上限。",
			promptsStatus: "当前生效情况",
			promptsL0: "L0 常驻工具估算",
			promptsTokens: "tokens",
			promptsBudget: "预算",
			promptsOverrides: "项覆盖生效",
			promptsNoOverrides: "没有覆盖，全部使用内置默认值。",
			promptsDiagnostics: "诊断",
			promptsNoDiagnostics: "无诊断。",
			promptsStatusUnavailable: "暂时读不到插件状态（保存后插件会重启，稍后刷新）。",
			promptsRefresh: "刷新",
			promptsLoading: "读取中…",
			promptsLargest: "最大的目录层",
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
			invalidSave: "存在无效字段。",
			saveFailed: "保存失败，草稿已保留。",
			saving: "保存中…",
			save: "保存",
			discard: "放弃修改"
		};
		const en = {
			title: "Browser automation",
			description: "Runtime, tool freedom, OpenCLI, and overuse buffering policy.",
			expand: "Expand settings",
			collapse: "Collapse settings",
			unsaved: "Unsaved",
			readOnly: "Configuration is read-only.",
			freedom: "Automation freedom",
			freedomHint: "No-approval skips human confirmation only; buffering and validation remain active.",
			runtime: "Browser runtime",
			runtimeHint: "Playwright by default; explicitly select Patchright for compatibility-sensitive sites.",
			usage: "Usage buffer",
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
			assetLibrary: "Reusable automation assets (Experimental)",
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
			assetInvalid: "Invalid JSON, test URL, or inputs.",
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
			promptsExtras: "Group / action / error hint overrides (JSON)",
			promptsExtrasHint: "{\"groups\":{\"act\":{\"summary\":\"…\"}},\"actions\":{\"act.click\":{\"summary\":\"…\",\"notes\":\"…\"}},\"errorHints\":{\"DEADLINE\":\"…\"}}. Action keys may name a sub-action (automation.develop.save) or a detail page (observe.read.controls).",
			promptsDefaults: "Default text (read-only)",
			promptsExport: "Export default text",
			promptsCopy: "Copy",
			promptsHideDefaults: "Hide",
			promptsDefaultsHint: "One JSON in the exact structure of the overrides above. Copy it, delete what stays default, reword the rest, and put it in the configuration; pasted back unchanged it changes no output.",
			promptsDefaultsFailed: "The default text is not available right now (the plugin restarts after a save; try again in a moment).",
			promptsExtrasReset: "Restore defaults",
			promptsReset: "Restore default",
			promptsExtrasInvalid: "Invalid JSON, or a key, type or length outside the limits.",
			promptsTooLong: "Over the length limit.",
			promptsStatus: "Currently in effect",
			promptsL0: "Always-on L0 tools (estimate)",
			promptsTokens: "tokens",
			promptsBudget: "budget",
			promptsOverrides: "overrides in effect",
			promptsNoOverrides: "No overrides: everything uses the built-in defaults.",
			promptsDiagnostics: "Diagnostics",
			promptsNoDiagnostics: "No diagnostics.",
			promptsStatusUnavailable: "The plugin status is not available right now (the plugin restarts after a save; refresh in a moment).",
			promptsRefresh: "Refresh",
			promptsLoading: "Loading…",
			promptsLargest: "Largest catalog layer",
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
			invalidSave: "Some fields are invalid.",
			saveFailed: "Save failed; the draft was retained.",
			saving: "Saving…",
			save: "Save",
			discard: "Discard"
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
			const controller = new BrowserSettingsController(ctx.configForms.get(SETTINGS_NAMESPACE));
			const assets = new AutomationAssetsController(ctx.connection.rpc);
			const prompts = new PromptsStatusController(ctx.connection.rpc);
			ctx.effect(() => () => controller.dispose(), "dsh-browser: settings controller");
			ctx.effect(() => () => prompts.dispose(), "dsh-browser: prompts status controller");
			ctx.effect(() => () => assets.dispose(), "dsh-browser: automation assets controller");
			ctx.effect(() => ctx.configForms.whileServed([SETTINGS_NAMESPACE], () => ctx.slots.inject("plugins.bundle.config", () => ctx.slots.register({
				name: "plugins.bundle.config",
				key: "@anweat/dsh-browser",
				locale: NS,
				inject: () => {
					const settingsProps = controller.inject();
					const assetProps = assets.inject();
					const promptsProps = prompts.inject();
					return {
						...settingsProps,
						...assetProps,
						...promptsProps,
						hooks: {
							...settingsProps.hooks,
							...assetProps.hooks,
							...promptsProps.hooks
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