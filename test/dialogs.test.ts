import test from 'node:test'
import assert from 'node:assert/strict'
import { installDialogGuard } from '../src/dialogs.ts'

/**
 * Minimal playwright-shaped doubles: only the surface `installDialogGuard` touches
 * (`browser.contexts()`, `browser.on('context')`, `context.on('dialog')`, and the dialog's
 * `type()` / `accept()` / `dismiss()`).
 */
function fakeContext() {
  const handlers: Array<(dialog: any) => void> = []
  return {
    handlers,
    on(event: string, handler: (dialog: any) => void) {
      if (event === 'dialog') handlers.push(handler)
      return this
    },
    emitDialog(dialog: any) {
      for (const handler of handlers) handler(dialog)
    },
  }
}

function fakeBrowser(existing: any[] = []) {
  const contextListeners: Array<(context: any) => void> = []
  const live = [...existing]
  return {
    contexts: () => [...live],
    on(event: string, listener: (context: any) => void) {
      if (event === 'context') contextListeners.push(listener)
      return this
    },
    openContext() {
      const context = fakeContext()
      live.push(context)
      for (const listener of contextListeners) listener(context)
      return context
    },
    emitContext(context: any) {
      for (const listener of contextListeners) listener(context)
    },
  }
}

function fakeDialog(type: string, impl: { accept?: () => Promise<void>; dismiss?: () => Promise<void> } = {}) {
  const calls: string[] = []
  return {
    calls,
    type: () => type,
    accept: () => {
      calls.push('accept')
      return impl.accept ? impl.accept() : Promise.resolve()
    },
    dismiss: () => {
      calls.push('dismiss')
      return impl.dismiss ? impl.dismiss() : Promise.resolve()
    },
  }
}

/** Let the rejected-promise bookkeeping of the current tick run to completion. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
}

/**
 * Run `emit` while watching for unhandled rejections. Adding a listener also suppresses
 * Node's own fatal path, so a regression is reported as a failed assertion instead of
 * taking the test runner down with it.
 */
async function collectRejections(emit: () => void): Promise<unknown[]> {
  const seen: unknown[] = []
  const listener = (error: unknown) => { seen.push(error) }
  process.on('unhandledRejection', listener)
  try {
    emit()
    await flush()
  } finally {
    process.off('unhandledRejection', listener)
  }
  return seen
}

test('contexts that already exist are guarded, and later contexts are picked up', () => {
  const browser = fakeBrowser()
  const existing = browser.openContext()
  installDialogGuard(browser)

  assert.equal(existing.handlers.length, 1)
  const later = browser.openContext()
  assert.equal(later.handlers.length, 1)
})

test('beforeunload is accepted so the navigation can proceed; other dialogs are dismissed', () => {
  const browser = fakeBrowser()
  const context = browser.openContext()
  installDialogGuard(browser)

  const beforeunload = fakeDialog('beforeunload')
  context.emitDialog(beforeunload)
  assert.deepEqual(beforeunload.calls, ['accept'])

  for (const type of ['alert', 'confirm', 'prompt']) {
    const dialog = fakeDialog(type)
    context.emitDialog(dialog)
    assert.deepEqual(dialog.calls, ['dismiss'], `${type} should be dismissed`)
  }
})

test('a dialog already closed in the browser never leaks an unhandled rejection', async () => {
  const browser = fakeBrowser()
  const context = browser.openContext()
  installDialogGuard(browser)

  const rejections = await collectRejections(() => {
    context.emitDialog(fakeDialog('alert', {
      dismiss: () => Promise.reject(new Error('Protocol error (Page.handleJavaScriptDialog): No dialog is showing')),
    }))
  })

  assert.deepEqual(rejections, [])
})

test('a failing beforeunload accept is swallowed too', async () => {
  const browser = fakeBrowser()
  const context = browser.openContext()
  installDialogGuard(browser)

  const rejections = await collectRejections(() => {
    context.emitDialog(fakeDialog('beforeunload', {
      accept: () => Promise.reject(new Error('Protocol error (Page.handleJavaScriptDialog): No dialog is showing')),
    }))
  })

  assert.deepEqual(rejections, [])
})

test('a dialog that throws synchronously is swallowed', async () => {
  const browser = fakeBrowser()
  const context = browser.openContext()
  installDialogGuard(browser)

  const rejections = await collectRejections(() => {
    context.emitDialog({
      type() { throw new Error('dialog already disposed') },
      accept: () => Promise.resolve(),
      dismiss: () => Promise.resolve(),
    })
  })

  assert.deepEqual(rejections, [])
})

test('the same context is guarded once, however it is discovered', () => {
  const context = fakeContext()
  const browser = fakeBrowser([context])
  installDialogGuard(browser)
  browser.emitContext(context)

  // A second listener would dismiss twice, which Playwright rejects outright.
  assert.equal(context.handlers.length, 1)
})

test('re-installing the guard is idempotent', () => {
  const browser = fakeBrowser()
  const context = browser.openContext()
  installDialogGuard(browser)
  installDialogGuard(browser)

  assert.equal(context.handlers.length, 1)
})

test('partial doubles are tolerated instead of throwing', () => {
  assert.doesNotThrow(() => installDialogGuard(undefined))
  assert.doesNotThrow(() => installDialogGuard(null))
  assert.doesNotThrow(() => installDialogGuard({}))
  // A context without `on` (or a broken one) must not take the caller down either.
  assert.doesNotThrow(() => installDialogGuard({ contexts: () => [{}], on: undefined }))
})
