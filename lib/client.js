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
			secondary: "dsb-secondary"
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
@media(max-width:720px){.dsb-grid{grid-template-columns:minmax(0,1fr)}.dsb-footer{align-items:stretch;flex-direction:column}.dsb-actions{justify-content:flex-end}}@media(max-width:420px){.dsb-body{margin:0 12px}.dsb-actions{display:grid;grid-template-columns:1fr 1fr}.dsb-primary,.dsb-secondary{width:100%}}
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
								json("usagePolicy", "usagePolicy", "usagePolicyHint", 10),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: styles.notice,
									role: "note",
									children: t("restart")
								})
							]
						}),
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
			ctx.effect(() => () => controller.dispose(), "dsh-browser: settings controller");
			ctx.slots.inject("settings.plugin.item", () => ctx.slots.register({
				name: "settings.plugin.item",
				key: SETTINGS_NAMESPACE,
				locale: NS,
				inject: () => controller.inject()
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