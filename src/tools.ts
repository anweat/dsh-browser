/**
 * Model-facing browser tools for dsh-browser: an interactive, multi-step
 * browser over a persistent page (open/click/type/scroll/read/screenshot/close)
 * plus status and chromium-install helpers.
 * @module dsh-browser/tools
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ResolvedConfig } from './config.ts'
import type { BrowserService, InteractiveState } from './browser-service.ts'

function renderState(v: InteractiveState): { type: 'text'; text: string }[] {
  const parts: string[] = []
  if (v.title) parts.push('Title: ' + v.title)
  parts.push(v.url)
  parts.push(v.text)
  if (v.screenshotPath) parts.push('Screenshot: ' + v.screenshotPath)
  return [{ type: 'text', text: parts.join('\n\n') }]
}

export function registerTools(ctx: Context, config: ResolvedConfig, service: BrowserService): void {
  ctx.tools.register(defineTool({
    name: 'browser_open',
    description: 'Open a URL in the persistent browser page and return the rendered title, readable text, and a full-page screenshot path. Use this to start a multi-step browsing session.',
    parameters: {
      url: { type: 'string', required: true, description: 'The HTTP(S) URL to open.' },
      waitMs: { type: 'number', description: 'Extra settle time in ms after load.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          url: { type: 'string', required: true },
          title: { type: 'string' },
          text: { type: 'string', required: true },
          screenshotPath: { type: 'string' },
        },
      },
      render: (_args, value) => renderState(value as InteractiveState),
    },
    timeoutMs: 60_000,
    isConcurrencySafe: () => false,
    async execute(args) {
      return service.open(args.url, args.waitMs !== undefined ? { waitMs: args.waitMs } : {})
    },
  }))

  ctx.tools.register(defineTool({
    name: 'browser_click',
    description: 'Click a CSS selector on the current browser page, then return the updated page state. Use after browser_open to follow links or press buttons.',
    parameters: {
      selector: { type: 'string', required: true, description: 'CSS selector of the element to click.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          url: { type: 'string', required: true },
          title: { type: 'string' },
          text: { type: 'string', required: true },
          screenshotPath: { type: 'string' },
        },
      },
      render: (_args, value) => renderState(value as InteractiveState),
    },
    timeoutMs: 30_000,
    isConcurrencySafe: () => false,
    async execute(args) {
      return service.click(args.selector)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'browser_type',
    description: 'Type text into an input/textarea (CSS selector) on the current browser page, then return the page state. Use to fill search boxes and forms.',
    parameters: {
      selector: { type: 'string', required: true, description: 'CSS selector of the input/textarea to fill.' },
      text: { type: 'string', required: true, description: 'Text to type.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          url: { type: 'string', required: true },
          title: { type: 'string' },
          text: { type: 'string', required: true },
          screenshotPath: { type: 'string' },
        },
      },
      render: (_args, value) => renderState(value as InteractiveState),
    },
    timeoutMs: 30_000,
    isConcurrencySafe: () => false,
    async execute(args) {
      return service.type(args.selector, args.text)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'browser_scroll',
    description: 'Scroll the current browser page vertically by deltaY pixels (positive = down) to trigger lazy loading, then return the page state.',
    parameters: {
      deltaY: { type: 'number', description: 'Pixels to scroll; positive scrolls down. Default 2000.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          url: { type: 'string', required: true },
          title: { type: 'string' },
          text: { type: 'string', required: true },
          screenshotPath: { type: 'string' },
        },
      },
      render: (_args, value) => renderState(value as InteractiveState),
    },
    timeoutMs: 20_000,
    isConcurrencySafe: () => false,
    async execute(args) {
      return service.scroll(args.deltaY ?? 2000)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'browser_read',
    description: 'Read the current browser page state (URL, title, readable text) without taking a screenshot.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          url: { type: 'string', required: true },
          title: { type: 'string' },
          text: { type: 'string', required: true },
          screenshotPath: { type: 'string' },
        },
      },
      render: (_args, value) => renderState(value as InteractiveState),
    },
    timeoutMs: 20_000,
    isConcurrencySafe: () => false,
    async execute() {
      return service.read()
    },
  }))

  ctx.tools.register(defineTool({
    name: 'browser_screenshot',
    description: 'Capture a full-page screenshot of the current browser page and return the file path.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: 'Screenshot: ' + (value as { path: string }).path }],
    },
    timeoutMs: 30_000,
    isConcurrencySafe: () => false,
    async execute() {
      return service.screenshot()
    },
  }))

  ctx.tools.register(defineTool({
    name: 'browser_close',
    description: 'Close the current browser page (and its context). The next browser_open starts a fresh page.',
    parameters: {},
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { closed: { type: 'boolean', required: true } } },
      render: () => [{ type: 'text', text: 'Browser page closed.' }],
    },
    timeoutMs: 15_000,
    async execute() {
      await service.closePage()
      return { closed: true }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'browser_status',
    description: 'Report the browser runtime status: enabled, channel, headless, whether chromium is installed, whether the bundled OpenCLI is enabled, and the active page URL.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          enabled: { type: 'boolean', required: true },
          channel: { type: 'string', required: true },
          headless: { type: 'boolean', required: true },
          opencliEnabled: { type: 'boolean', required: true },
          chromiumInstalled: { type: 'boolean', required: true },
          activeUrl: { type: 'string' },
        },
      },
      render: (_args, value) => {
        const v = value as { enabled: boolean; channel: string; headless: boolean; opencliEnabled: boolean; chromiumInstalled: boolean; activeUrl?: string }
        return [{ type: 'text', text: [
          'browser: ' + (v.enabled ? 'enabled' : 'disabled'),
          'channel: ' + v.channel + (v.headless ? ' (headless)' : ' (headed)'),
          'chromium installed: ' + v.chromiumInstalled,
          'opencli (bundled): ' + (v.opencliEnabled ? 'enabled' : 'disabled'),
          ...(v.activeUrl ? ['active page: ' + v.activeUrl] : []),
        ].join('\n') }]
      },
    },
    timeoutMs: 15_000,
    isConcurrencySafe: () => true,
    async execute() {
      return service.status()
    },
  }))

  ctx.tools.register(defineTool({
    name: 'browser_install',
    description: 'Install the bundled Playwright chromium browser (downloads to the Playwright cache). Run this once if browser_status reports chromium not installed.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          code: { type: 'number', required: true },
          stdout: { type: 'string' },
          stderr: { type: 'string' },
          timedOut: { type: 'boolean', required: true },
        },
      },
      render: (_args, value) => {
        const v = value as { code: number; stdout: string; stderr: string; timedOut: boolean }
        return [{ type: 'text', text: 'install exit=' + v.code + (v.timedOut ? ' (timeout)' : '') + '\n' + ((v.stderr || v.stdout) ?? '').slice(0, 2000) }]
      },
    },
    timeoutMs: 600_000,
    isConcurrencySafe: () => false,
    async execute() {
      const r = await service.installChromium()
      return { code: r.code, stdout: r.stdout, stderr: r.stderr, timedOut: r.timedOut }
    },
  }))
}
