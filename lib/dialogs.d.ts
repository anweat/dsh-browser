/**
 * Native-dialog guard for every browser and context this plugin drives.
 *
 * Playwright's own default, when nothing listens for `dialog`, is to close the dialog:
 * `beforeunload` is accepted, everything else is dismissed (server `Dialog._close()`).
 * This plugin wants that same default — dialogs are not surfaced to the agent, and a
 * stuck `alert()` would block the page for the whole snapshot timeout.
 *
 * In playwright-core 1.63.0 that default is unsafe. `DialogManager.dialogDidOpen` runs
 * `dialog._close().then(() => {})` with no rejection handler, while
 * `DialogManager.dialogWasClosedInBrowser` never marks the dialog handled. So when the
 * dialog disappears in the browser first — the user clicks it, or the page navigates or
 * closes — the close still reaches Chromium, `Page.handleJavaScriptDialog` answers
 * `No dialog is showing`, and the rejection escapes to the host process. dsh-app-boot
 * installs a fail-loud `unhandledRejection` handler, so that one leak prints
 * `fatal load failure` and exits the entire DSH process (upstream fix is
 * microsoft/playwright#42828, not in any 1.63.x release).
 *
 * Holding a `dialog` listener of our own removes the hazard without changing behaviour:
 * a client-side subscription makes the context dispatcher report `hasHandlers = true`,
 * so Playwright's unhandled auto-close branch is skipped entirely and this listener owns
 * the dismissal — with its own rejection handled. The dispatch flip was reproduced against
 * the installed playwright-core 1.63.0, and `test/dialogs.test.ts` pins the swallow.
 *
 * @module dsh-browser/dialogs
 */
/**
 * Register the dialog guard on a browser and every context it owns.
 *
 * Attach this as soon as a browser is available — both the launched and the
 * CDP-connected path — because the guard only helps while it is in place before a dialog
 * opens, and a dialog can open on any page of any context at any time.
 *
 * @param browser - a playwright/patchright `Browser`, launched or CDP-connected. A
 *   partial double is accepted so callers and tests can pass a stub.
 */
export declare function installDialogGuard(browser: any): void;
