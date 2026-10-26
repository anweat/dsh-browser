// Import this first: it makes `@deepseek-ai/dsh-client-ui-primitives` resolve to the shared stub (test/e2e/ui/primitives-stub.ts)
// in a plain Node test run, where the real package's client-only dependency chain does not belong.
import { registerHooks } from 'node:module'
import { pathToFileURL } from 'node:url'

const stub = pathToFileURL(new URL('../e2e/ui/primitives-stub.ts', import.meta.url).pathname).href
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@deepseek-ai/dsh-client-ui-primitives') return { url: stub, shortCircuit: true }
    return nextResolve(specifier, context)
  },
})
