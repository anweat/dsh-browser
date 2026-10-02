/** A scripted stand-in for a Playwright page, shared by the recipe unit tests. */

export type Behavior = Record<string, Partial<Record<string, (...args: any[]) => unknown>>>

/** A page whose locators run scripted behaviour per selector and record every call. */
export function fakePage(behavior: Behavior = {}) {
  const log: string[] = []
  const locatorFor = (key: string): any => {
    const locator: any = { first: () => locator, locator: () => locator }
    for (const method of ['click', 'fill', 'pressSequentially', 'press', 'selectOption', 'check', 'uncheck', 'hover', 'waitFor', 'innerText', 'innerHTML', 'getAttribute', 'evaluateAll']) {
      locator[method] = async (...args: unknown[]) => {
        log.push(`${method}:${key}`)
        const scripted = behavior[key]?.[method]
        if (scripted) return scripted(...args)
        return method === 'innerText' || method === 'innerHTML' ? 'text' : method === 'evaluateAll' ? [] : undefined
      }
    }
    return locator
  }
  const page = {
    locator: (selector: string) => locatorFor(selector),
    getByText: (text: string) => locatorFor('text=' + text),
    waitForLoadState: async () => { log.push('waitForLoadState') },
    waitForTimeout: async () => { log.push('waitForTimeout') },
    keyboard: { press: async (key: string) => { log.push('keyboard:' + key) } },
    mouse: { wheel: async () => { log.push('wheel') } },
  }
  return { page, log }
}
