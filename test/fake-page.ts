/** A scripted stand-in for a Playwright page, shared by the recipe unit tests. */

export type Behavior = Record<string, Partial<Record<string, (...args: any[]) => unknown>>>

/**
 * A page whose locators run scripted behaviour per key and record every call.
 *
 * Keys: a CSS selector for `page.locator(css)`, `text=<text>` for getByText,
 * `role=<role>` / `role=<role>:<name>` for getByRole, `label=`, `testid=` for the
 * other getBy* methods. `log` holds `<method>:<key>` for each action; `trace`
 * also holds the locator-shaping calls (`first`, `nth`) so a test can tell a
 * `.first()` from a strict locator.
 */
export function fakePage(behavior: Behavior = {}) {
  const log: string[] = []
  const trace: string[] = []
  const locatorFor = (key: string): any => {
    const locator: any = {
      first: () => { trace.push(`first:${key}`); return locator },
      nth: (index: number) => { trace.push(`nth:${key}:${index}`); return locator },
      locator: (selector: string) => { trace.push(`locator:${key}>${selector}`); return locator },
    }
    for (const method of ['click', 'fill', 'clear', 'pressSequentially', 'press', 'selectOption', 'check', 'uncheck', 'hover', 'waitFor', 'innerText', 'innerHTML', 'getAttribute', 'evaluateAll', 'count']) {
      locator[method] = async (...args: unknown[]) => {
        log.push(`${method}:${key}`)
        trace.push(`${method}:${key}`)
        const scripted = behavior[key]?.[method]
        if (scripted) return scripted(...args)
        return method === 'innerText' || method === 'innerHTML' ? 'text' : method === 'evaluateAll' ? [] : method === 'count' ? 1 : undefined
      }
    }
    return locator
  }
  const root = (prefix: string): any => ({
    locator: (selector: string) => locatorFor(prefix + selector),
    getByText: (text: string) => locatorFor(prefix + 'text=' + text),
    getByRole: (role: string, options?: { name?: string }) => locatorFor(`${prefix}role=${role}${options?.name !== undefined ? ':' + options.name : ''}`),
    getByLabel: (text: string) => locatorFor(prefix + 'label=' + text),
    getByTestId: (id: string) => locatorFor(prefix + 'testid=' + id),
    frameLocator: (selector: string) => root(prefix + 'frame(' + selector + ')>'),
  })
  let current = 'https://example.com/start'
  const page = {
    ...root(''),
    url: () => current,
    goto: async (url: string) => { log.push('goto:' + url); current = url },
    waitForURL: async (predicate: unknown) => {
      log.push('waitForURL')
      const scripted = behavior.page?.waitForURL
      if (scripted) return scripted(predicate)
      if (typeof predicate === 'function' && !(predicate as (url: URL) => boolean)(new URL(current))) throw Object.assign(new Error('page.waitForURL: Timeout 5000ms exceeded.'), { name: 'TimeoutError' })
    },
    waitForLoadState: async () => { log.push('waitForLoadState') },
    waitForTimeout: async () => { log.push('waitForTimeout') },
    keyboard: { press: async (key: string) => { log.push('keyboard:' + key) } },
    mouse: { wheel: async () => { log.push('wheel') } },
  }
  return { page, log, trace }
}
