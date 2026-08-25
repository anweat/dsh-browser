window.__ModuleLoader__.load({
	id: "@anweat/dsh-browser",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/form.ts
		const textField = (field) => ({
			field,
			format: (value) => typeof value === "string" ? value : "",
			parse(text) {
				return text.trim() === "" ? { kind: "clear" } : {
					kind: "set",
					value: text.trim()
				};
			}
		});
		const booleanField = (field) => ({
			field,
			format: (value) => value === true ? "true" : "false",
			parse: (text) => text === "true" || text === "false" ? {
				kind: "set",
				value: text === "true"
			} : void 0
		});
		const enumField = (field, values) => ({
			field,
			format: (value) => typeof value === "string" ? value : values[0] ?? "",
			parse: (text) => values.includes(text) ? {
				kind: "set",
				value: text
			} : void 0
		});
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
		const POLICY_BOUNDS = {
			minDelayMs: [0, 6e4],
			maxConcurrency: [1, 8],
			burst: [1, 20],
			maxPagesPerRun: [1, 100],
			maxDepth: [0, 5],
			retryLimit: [0, 5],
			backoffBaseMs: [1, 6e4],
			cooldownMs: [100, 3e5]
		};
		const ASSET_POLICY_KEYS = /* @__PURE__ */ new Set([
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
			"maxModelDraftWritesPerSession"
		]);
		function validAssetPolicy(value) {
			if (Object.keys(value).some((key) => !ASSET_POLICY_KEYS.has(key))) return false;
			if (value.enabled !== void 0 && typeof value.enabled !== "boolean") return false;
			if (value.directory !== void 0 && typeof value.directory !== "string") return false;
			if (value.modelDevelopmentEnabled !== void 0 && typeof value.modelDevelopmentEnabled !== "boolean") return false;
			if (value.persistenceMode !== void 0 && ![
				"off",
				"manual",
				"suggest",
				"auto-draft"
			].includes(String(value.persistenceMode))) return false;
			if (value.activationMode !== void 0 && !["manual", "auto-tested"].includes(String(value.activationMode))) return false;
			return Object.entries(value).every(([key, entry]) => {
				if (![
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
					"maxModelDraftWritesPerSession"
				].includes(key)) return true;
				return typeof entry === "number" && Number.isFinite(entry) && entry >= 0;
			});
		}
		function validUsagePolicy(value) {
			if (Object.keys(value).some((key) => !(key in POLICY_BOUNDS))) return false;
			return Object.entries(POLICY_BOUNDS).every(([key, [min, max]]) => {
				const entry = value[key];
				return entry === void 0 || typeof entry === "number" && Number.isInteger(entry) && entry >= min && entry <= max;
			});
		}
		const FIELD_SPECS = [
			booleanField("enabled"),
			enumField("automationMode", [
				"read-only",
				"standard",
				"autonomous",
				"unrestricted"
			]),
			enumField("browserRuntime", ["playwright", "patchright"]),
			textField("channel"),
			booleanField("headless"),
			booleanField("opencliEnabled"),
			jsonField("usagePolicy", validUsagePolicy),
			jsonField("automationAssets", validAssetPolicy),
			booleanField("autoInstall"),
			textField("storageStatePath"),
			jsonField("authProfiles"),
			textField("defaultAuthProfile"),
			jsonField("rulePacks"),
			textField("executablePath"),
			textField("snapshotDir"),
			booleanField("verbose")
		];
		const SPEC_BY_FIELD = new Map(FIELD_SPECS.map((spec) => [spec.field, spec]));
		function stable(value) {
			if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
			if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`).join(",")}}`;
			return JSON.stringify(value);
		}
		function same(left, right) {
			return stable(left) === stable(right);
		}
		function createLocalStore(initial) {
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
		var BrowserSettingsController = class {
			scope;
			staged = /* @__PURE__ */ new Map();
			store;
			unsubscribe;
			saving = false;
			failed = false;
			constructor(scope) {
				this.scope = scope;
				this.store = createLocalStore(this.project());
				this.unsubscribe = scope.subscribe(() => {
					this.publish();
				});
			}
			inject() {
				return {
					hooks: { browserSettings: this.store },
					edit: (field, text) => {
						this.edit(field, text);
					},
					resetField: (field) => {
						this.resetField(field);
					},
					save: () => {
						this.save();
					},
					discard: () => {
						this.discard();
					}
				};
			}
			snapshot() {
				return this.store.getSnapshot();
			}
			edit(field, text) {
				this.staged.set(field, {
					text,
					clear: false
				});
				this.failed = false;
				this.publish();
			}
			resetField(field) {
				const spec = this.spec(field);
				this.staged.set(field, {
					text: spec.format(this.baseValue(field)),
					clear: true
				});
				this.failed = false;
				this.publish();
			}
			discard() {
				this.staged.clear();
				this.failed = false;
				this.publish();
			}
			async save() {
				const plan = this.plan();
				if (this.saving || plan.some((item) => item.write === void 0) || plan.length === 0) return;
				this.saving = true;
				this.failed = false;
				this.publish();
				let landed = true;
				try {
					for (const item of plan) {
						if (!item.write) {
							landed = false;
							break;
						}
						if (item.write.kind === "clear") {
							await this.scope.unset(item.field);
							landed = !this.stored(item.field) && landed;
						} else {
							await this.scope.set(item.field, item.write.value);
							landed = same(this.userLayer()?.[item.field], item.write.value) && landed;
						}
					}
				} catch {
					landed = false;
				}
				if (landed) this.staged.clear();
				this.saving = false;
				this.failed = !landed;
				this.publish();
			}
			dispose() {
				this.unsubscribe();
			}
			project() {
				const fields = {};
				for (const spec of FIELD_SPECS) fields[spec.field] = this.field(spec.field);
				const plan = this.plan();
				return {
					available: this.scope.getSnapshot().status === "ready",
					writable: this.scope.getSnapshot().writable,
					dirty: plan.length > 0,
					invalid: plan.some((item) => item.write === void 0),
					saving: this.saving,
					failed: this.failed,
					fields
				};
			}
			field(field) {
				const spec = this.spec(field);
				const draft = this.staged.get(field);
				if (!draft) return {
					text: spec.format(this.sectionValue(field)),
					overridden: this.stored(field),
					invalid: false
				};
				const write = draft.clear ? { kind: "clear" } : spec.parse(draft.text);
				return {
					text: draft.text,
					overridden: write?.kind === "set",
					invalid: write === void 0
				};
			}
			plan() {
				const writes = [];
				for (const [field, draft] of this.staged) {
					const spec = this.spec(field);
					if (draft.clear) {
						if (this.stored(field)) writes.push({
							field,
							write: { kind: "clear" }
						});
						continue;
					}
					if (draft.text === spec.format(this.sectionValue(field))) continue;
					writes.push({
						field,
						write: spec.parse(draft.text)
					});
				}
				return writes;
			}
			spec(field) {
				const spec = SPEC_BY_FIELD.get(field);
				if (!spec) throw new Error(`unknown browser settings field: ${field}`);
				return spec;
			}
			sectionValue(field) {
				return this.scope.getSnapshot().value?.[field];
			}
			baseValue(field) {
				return this.scope.getSnapshot().base?.[field];
			}
			userLayer() {
				return this.scope.getSnapshot().user;
			}
			stored(field) {
				const user = this.userLayer();
				return user !== void 0 && Object.hasOwn(user, field);
			}
			publish() {
				this.store.set(this.project());
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
		function FieldShell(props) {
			const id = `dsh-browser-${props.field}`;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: `${styles.field} ${props.state.invalid ? styles.invalid : ""}`,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: styles.fieldHead,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
							className: styles.label,
							htmlFor: id,
							children: props.label
						}), props.state.overridden ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: styles.reset,
							disabled: props.disabled,
							onClick: () => props.onReset(props.field),
							children: props.resetLabel
						}) : null]
					}),
					props.children,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: styles.hint,
						children: props.hint
					})
				]
			});
		}
		function SettingsCard(props) {
			const { t } = props;
			const state = props.useBrowserSettings((snapshot) => snapshot);
			const [open, setOpen] = (0, react.useState)(false);
			if (!state.available) return null;
			const disabled = !state.writable || state.saving;
			const text = (field, label, hint) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldShell, {
				field,
				state: state.fields[field],
				label: t(label),
				hint: state.fields[field].invalid ? t("invalid") : t(hint),
				disabled,
				resetLabel: t("reset"),
				onReset: props.resetField,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
					id: `dsh-browser-${field}`,
					className: styles.input,
					value: state.fields[field].text,
					disabled,
					"aria-invalid": state.fields[field].invalid || void 0,
					onChange: (event) => props.edit(field, event.currentTarget.value)
				})
			});
			const select = (field, label, hint, options) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldShell, {
				field,
				state: state.fields[field],
				label: t(label),
				hint: state.fields[field].invalid ? t("invalid") : t(hint),
				disabled,
				resetLabel: t("reset"),
				onReset: props.resetField,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
					id: `dsh-browser-${field}`,
					className: styles.input,
					value: state.fields[field].text,
					disabled,
					onChange: (event) => props.edit(field, event.currentTarget.value),
					children: options.map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
						value: option,
						children: option
					}, option))
				})
			});
			const json = (field, label, hint, rows = 7) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldShell, {
				field,
				state: state.fields[field],
				label: t(label),
				hint: state.fields[field].invalid ? t("invalidJson") : t(hint),
				disabled,
				resetLabel: t("reset"),
				onReset: props.resetField,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
					id: `dsh-browser-${field}`,
					className: `${styles.input} ${styles.textarea} ${styles.code}`,
					rows,
					value: state.fields[field].text,
					disabled,
					spellCheck: false,
					"aria-invalid": state.fields[field].invalid || void 0,
					onChange: (event) => props.edit(field, event.currentTarget.value)
				})
			});
			const toggle = (field, label, hint) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: styles.toggle,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
					className: styles.toggleLabel,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						className: styles.check,
						type: "checkbox",
						checked: state.fields[field].text === "true",
						disabled,
						onChange: (event) => props.edit(field, String(event.currentTarget.checked))
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: styles.label,
						children: t(label)
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: styles.hint,
						children: t(hint)
					})] })]
				}), state.fields[field].overridden ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: styles.reset,
					disabled,
					onClick: () => props.resetField(field),
					children: t("reset")
				}) : null]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: `${styles.card} ${open ? styles.open : ""}`,
				"data-dsh-browser-settings": true,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: styles.header,
					"aria-expanded": open,
					"aria-label": `${t(open ? "collapse" : "expand")}: ${t("title")}`,
					onClick: () => setOpen(!open),
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: styles.head,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: styles.titleRow,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: styles.name,
								children: t("title")
							}), state.dirty ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: styles.badge,
								children: t("unsaved")
							}) : null]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: styles.description,
							children: t("description")
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
						className: `${styles.chevron} ${open ? styles.chevronOpen : ""}`,
						viewBox: "0 0 14 14",
						width: "14",
						height: "14",
						"aria-hidden": "true",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
							d: "M3.5 5.5 7 9l3.5-3.5",
							fill: "none",
							stroke: "currentColor",
							strokeWidth: "1.5"
						})
					})]
				}), open ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: styles.body,
					children: [
						!state.writable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: styles.notice,
							role: "status",
							children: t("readOnly")
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
							className: styles.section,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: styles.sectionHead,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("freedom") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("freedomHint") })]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: styles.grid,
								children: [
									toggle("enabled", "enabled", "enabledHint"),
									select("automationMode", "automationMode", "automationModeHint", [
										"read-only",
										"standard",
										"autonomous",
										"unrestricted"
									]),
									toggle("opencliEnabled", "opencliEnabled", "opencliEnabledHint")
								]
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
							className: styles.section,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: styles.sectionHead,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("runtime") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("runtimeHint") })]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: styles.grid,
								children: [
									select("browserRuntime", "browserRuntime", "browserRuntimeHint", ["playwright", "patchright"]),
									text("channel", "channel", "channelHint"),
									toggle("headless", "headless", "headlessHint"),
									toggle("autoInstall", "autoInstall", "autoInstallHint"),
									text("executablePath", "executablePath", "executablePathHint")
								]
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
							className: styles.section,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: styles.sectionHead,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("usage") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("usageHint") })]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: styles.grid,
									children: [json("usagePolicy", "usagePolicy", "usagePolicyHint", 10), json("automationAssets", "automationAssets", "automationAssetsHint", 14)]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: styles.notice,
									role: "note",
									children: t("restart")
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(AutomationAssetsPanel, { ...props }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
							className: styles.advanced,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: t("advanced") }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: styles.hint,
									children: t("advancedHint")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: styles.grid,
									children: [
										text("storageStatePath", "storageStatePath", "storageStatePathHint"),
										text("defaultAuthProfile", "defaultAuthProfile", "defaultAuthProfileHint"),
										json("authProfiles", "authProfiles", "authProfilesHint"),
										json("rulePacks", "rulePacks", "rulePacksHint"),
										text("snapshotDir", "snapshotDir", "snapshotDirHint"),
										toggle("verbose", "verbose", "verboseHint")
									]
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: styles.footer,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: state.failed ? styles.failed : styles.status,
								role: "status",
								"aria-live": "polite",
								children: t(state.failed ? "saveFailed" : state.invalid ? "invalidSave" : state.dirty ? "pending" : "saved")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: styles.actions,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: styles.secondary,
									disabled: !state.dirty || state.saving,
									onClick: props.discard,
									children: t("discard")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: styles.primary,
									disabled: !state.dirty || state.invalid || state.saving || !state.writable,
									onClick: props.save,
									children: t(state.saving ? "saving" : "save")
								})]
							})]
						})
					]
				}) : null]
			});
		}
		function AutomationAssetsPanel(props) {
			const { t } = props;
			const state = props.useAutomationAssets((snapshot) => snapshot);
			const [draft, setDraft] = (0, react.useState)("");
			const [draftError, setDraftError] = (0, react.useState)(false);
			const [testUrl, setTestUrl] = (0, react.useState)("");
			const [testInputs, setTestInputs] = (0, react.useState)("{}");
			const selected = state.selected;
			(0, react.useEffect)(() => {
				if (selected) setDraft(JSON.stringify(selected, null, 2));
			}, [selected?.id, selected?.revision]);
			const newAsset = (kind) => {
				props.selectAutomationAsset(void 0);
				setDraft(JSON.stringify(kind === "recipe" ? {
					kind,
					name: "New recipe",
					description: "",
					domains: [],
					tags: [],
					inputNames: [],
					recipe: [{
						type: "extract",
						selector: "main",
						mode: "text",
						limit: 20
					}]
				} : {
					kind,
					name: "New userscript",
					description: "",
					domains: [],
					tags: [],
					inputNames: [],
					source: "// ==UserScript==\n// @name New userscript\n// @match https://example.com/*\n// @grant none\n// ==/UserScript==\nreturn { title: document.title }"
				}, null, 2));
				setDraftError(false);
			};
			const save = async () => {
				try {
					const value = JSON.parse(draft);
					if (selected?.id) value.id = selected.id;
					await props.saveAutomationAsset(value);
					setDraftError(false);
				} catch {
					setDraftError(true);
				}
			};
			const runTest = async () => {
				if (!selected || !testUrl.trim()) {
					setDraftError(true);
					return;
				}
				try {
					const inputs = JSON.parse(testInputs);
					await props.testAutomationAsset(selected.id, testUrl.trim(), inputs);
					setDraftError(false);
				} catch {
					setDraftError(true);
				}
			};
			const candidates = state.snapshot?.candidates.filter((candidate) => candidate.suggestedAt && !candidate.dismissedAt) ?? [];
			const assets = state.snapshot?.assets ?? [];
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
									onClick: () => newAsset("recipe"),
									children: t("assetNewRecipe")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: styles.secondary,
									onClick: () => newAsset("userscript"),
									children: t("assetNewScript")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: styles.secondary,
									onClick: props.refreshAutomationAssets,
									children: t("assetRefresh")
								})
							]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: styles.assetLayout,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: styles.assetList,
							children: assets.length ? assets.map((asset) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: `${styles.assetItem} ${selected?.id === asset.id ? styles.assetSelected : ""}`,
								onClick: () => props.selectAutomationAsset(asset.id),
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
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
									className: styles.label,
									htmlFor: "dsh-browser-asset-editor",
									children: t("assetEditor")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
									id: "dsh-browser-asset-editor",
									className: `${styles.input} ${styles.textarea} ${styles.code} ${draftError ? styles.invalidInput : ""}`,
									rows: 18,
									value: draft,
									spellCheck: false,
									placeholder: t("assetEditorHint"),
									onChange: (event) => {
										setDraft(event.currentTarget.value);
										setDraftError(false);
									}
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: styles.hint,
									children: draftError ? t("assetInvalid") : t("assetSourceBoundary")
								}),
								selected?.status === "draft" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: styles.assetTestForm,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										className: styles.input,
										value: testUrl,
										placeholder: t("assetTestUrl"),
										onChange: (event) => setTestUrl(event.currentTarget.value)
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
										className: `${styles.input} ${styles.textarea} ${styles.code}`,
										rows: 3,
										value: testInputs,
										spellCheck: false,
										"aria-label": t("assetTestInputs"),
										onChange: (event) => setTestInputs(event.currentTarget.value)
									})]
								}) : null,
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: styles.actions,
									children: [
										selected ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: styles.secondary,
											disabled: state.busy,
											onClick: () => props.validateAutomationAsset(selected.id),
											children: t("assetValidate")
										}) : null,
										selected?.status === "draft" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: styles.secondary,
											disabled: state.busy || !testUrl.trim(),
											onClick: () => void runTest(),
											children: t("assetTest")
										}) : null,
										selected?.status === "draft" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: styles.secondary,
											disabled: state.busy || selected.testStatus !== "passed",
											onClick: () => props.setAutomationAssetStatus(selected.id, "active"),
											children: t("assetActivate")
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
											disabled: state.busy || !draft || selected?.status === "active",
											onClick: () => void save(),
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
			browserRuntime: "运行时提供器",
			browserRuntimeHint: "Patchright 仅支持 Chromium。",
			channel: "浏览器通道",
			channelHint: "chromium、chrome 或 msedge。Patchright 推荐 chrome。",
			headless: "无头模式",
			headlessHint: "Patchright 兼容性最佳配置通常是关闭无头模式。",
			opencliEnabled: "启用 OpenCLI",
			opencliEnabledHint: "站点 adapter 和 Chrome Browser Bridge 总开关。",
			usagePolicy: "调用缓冲 JSON",
			usagePolicyHint: "minDelayMs、maxConcurrency、burst、maxPagesPerRun、maxDepth、retryLimit、backoffBaseMs、cooldownMs。",
			automationAssets: "自动化资产策略 JSON",
			automationAssetsHint: "候选阈值、持久化模式、激活模式、数量与上下文预算。",
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
			assetTestInputs: "测试输入 JSON",
			assetActivate: "激活",
			assetArchive: "归档",
			assetSaveDraft: "保存草稿",
			autoInstall: "缺失时自动安装 Chromium",
			autoInstallHint: "可能触发较大下载，日常建议关闭并显式调用 browser_install。",
			storageStatePath: "全局 storageState 路径",
			storageStatePathHint: "旧版兼容入口；新配置优先使用限域 AuthProfile。",
			authProfiles: "AuthProfiles JSON",
			authProfilesHint: "命名登录态、allowedDomains 与 persistState。",
			defaultAuthProfile: "默认 AuthProfile",
			defaultAuthProfileHint: "未显式选择登录态时使用；browser_crawl 始终匿名。",
			rulePacks: "RulePacks JSON",
			rulePacksHint: "域名匹配、哈希固定 init script 和有界步骤。",
			executablePath: "浏览器可执行文件",
			executablePathHint: "少数自定义部署才需要覆盖。",
			snapshotDir: "快照目录",
			snapshotDirHint: "留空使用 DSH_HOME 下的默认目录。",
			verbose: "详细日志",
			verboseHint: "输出启动和诊断信息。",
			reset: "恢复部署值",
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
			browserRuntime: "Runtime provider",
			browserRuntimeHint: "Patchright is Chromium-only.",
			channel: "Browser channel",
			channelHint: "chromium, chrome, or msedge. Patchright recommends chrome.",
			headless: "Headless mode",
			headlessHint: "Patchright compatibility is usually strongest in headed mode.",
			opencliEnabled: "Enable OpenCLI",
			opencliEnabledHint: "Master switch for site adapters and the Chrome Browser Bridge.",
			usagePolicy: "Usage buffer JSON",
			usagePolicyHint: "minDelayMs, maxConcurrency, burst, maxPagesPerRun, maxDepth, retryLimit, backoffBaseMs, cooldownMs.",
			automationAssets: "Automation asset policy JSON",
			automationAssetsHint: "Candidate thresholds, persistence, activation, count, and context budgets.",
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
			assetTestInputs: "Test inputs JSON",
			assetActivate: "Activate",
			assetArchive: "Archive",
			assetSaveDraft: "Save draft",
			autoInstall: "Auto-install Chromium when missing",
			autoInstallHint: "May download a large binary; explicit browser_install is safer for daily use.",
			storageStatePath: "Global storageState path",
			storageStatePathHint: "Legacy fallback; prefer domain-scoped AuthProfiles.",
			authProfiles: "AuthProfiles JSON",
			authProfilesHint: "Named states with allowedDomains and persistState.",
			defaultAuthProfile: "Default AuthProfile",
			defaultAuthProfileHint: "Used when no profile is selected; browser_crawl is always anonymous.",
			rulePacks: "RulePacks JSON",
			rulePacksHint: "Domain match, hash-pinned init scripts, and bounded steps.",
			executablePath: "Browser executable",
			executablePathHint: "Override only for custom deployments.",
			snapshotDir: "Snapshot directory",
			snapshotDirHint: "Leave empty for the DSH_HOME default.",
			verbose: "Verbose logs",
			verboseHint: "Emit startup and diagnostic details.",
			reset: "Restore deployed",
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
		/** Settings namespace used by both the Host registry and the card slot key. */
		const SETTINGS_NAMESPACE = "browser";
		//#endregion
		//#region src/client/automation-assets-client.ts
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
		var AutomationAssetsController = class {
			rpc;
			store = localStore({
				loading: true,
				busy: false,
				failed: false
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
					testAutomationAsset: (id, url, inputs) => this.mutate("test", {
						id,
						url,
						inputs
					}),
					setAutomationAssetStatus: (id, status) => this.mutate("status", {
						id,
						status
					})
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
			async select(id) {
				if (!id) {
					this.publish({
						...this.store.getSnapshot(),
						selected: void 0
					});
					return;
				}
				try {
					const selected = await this.call("get", { id });
					this.publish({
						...this.store.getSnapshot(),
						selected: selected ?? void 0,
						failed: false,
						error: void 0
					});
				} catch (error) {
					this.fail(error);
				}
			}
			async mutate(endpoint, payload) {
				this.publish({
					...this.store.getSnapshot(),
					busy: true,
					failed: false,
					error: void 0
				});
				try {
					const value = await this.call(endpoint, payload);
					const selected = value && typeof value === "object" && "id" in value ? value : this.store.getSnapshot().selected;
					const snapshot = await this.call("snapshot", {});
					this.publish({
						loading: false,
						busy: false,
						failed: false,
						snapshot,
						...selected ? { selected } : {}
					});
				} catch (error) {
					this.fail(error);
				}
			}
			async call(endpoint, payload) {
				const result = await this.rpc.call("/dsh-browser-assets", endpoint, payload);
				if (!result.ok) throw new Error(result.error.message);
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
		//#region src/client/index.ts
		const name = "dsh-browser-client";
		const inject = [
			"slots",
			"locale",
			"connection",
			"settingsScope"
		];
		const NS = "dsh-browser.card";
		function apply(ctx) {
			ensureStyles();
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "dsh-browser: settings dictionaries");
			const controller = new BrowserSettingsController(ctx.settingsScope.bind({ namespace: SETTINGS_NAMESPACE }));
			const assets = new AutomationAssetsController(ctx.connection.rpc);
			ctx.effect(() => () => controller.dispose(), "dsh-browser: settings controller");
			ctx.effect(() => () => assets.dispose(), "dsh-browser: automation assets controller");
			ctx.slots.inject("settings.plugin.item", () => ctx.slots.register({
				name: "settings.plugin.item",
				key: SETTINGS_NAMESPACE,
				locale: NS,
				inject: () => {
					const settingsProps = controller.inject();
					const assetProps = assets.inject();
					return {
						...settingsProps,
						...assetProps,
						hooks: {
							...settingsProps.hooks,
							...assetProps.hooks
						}
					};
				}
			}, SettingsCard));
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