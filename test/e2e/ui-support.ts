/**
 * What the card's Chromium tests share: bundling an entry with the rolldown tsdown ships (the Host's primitives replaced
 * by the stub), starting a page with the RPC bridge, and reading what the fake settings scope was asked to write.
 */
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

/** Bundle one UI entry for the browser; a reason string instead of code when rolldown is not installed. */
export async function bundleEntry(entryFile: string): Promise<{ code: string } | { skip: string }> {
  let rolldown: typeof import('rolldown')
  try {
    const fromTsdown = createRequire(require.resolve('tsdown/package.json'))
    rolldown = await import(fromTsdown.resolve('rolldown'))
  } catch (error) { return { skip: `rolldown (a dependency of tsdown) is not installed: ${String(error)}` } }
  const entry = new URL(`./ui/${entryFile}`, import.meta.url).pathname
  const stub = new URL('./ui/primitives-stub.ts', import.meta.url).pathname
  const bundle = await rolldown.rolldown({
    input: entry, platform: 'browser', logLevel: 'silent',
    resolve: { alias: { '@deepseek-ai/dsh-client-ui-primitives': stub } },
    transform: { define: { 'process.env.NODE_ENV': '"development"' }, jsx: { runtime: 'automatic' } },
  } as never)
  const { output } = await bundle.generate({ format: 'iife' })
  await bundle.close()
  return { code: output[0]!.code }
}
