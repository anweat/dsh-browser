import type { UserConfig } from 'tsdown'

const PLUGIN_ID = '@anweat/dsh-browser'
const CLIENT_EXTERNALS = ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis', '@deepseek-ai/dsh-client-store', '@deepseek-ai/dsh-client-ui-slots'] as const

export default {
  name: `${PLUGIN_ID}/client`, entry: { client: 'src/client/index.ts' }, outDir: 'lib', format: 'cjs', platform: 'browser', dts: false, sourcemap: true, clean: false,
  deps: { neverBundle: [...CLIENT_EXTERNALS], alwaysBundle: (id: string) => CLIENT_EXTERNALS.includes(id as (typeof CLIENT_EXTERNALS)[number]) ? undefined : true },
  define: { 'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'), 'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'), 'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }) },
  plugins: [{
    name: 'dsh-browser-client-bundle-purity',
    resolveId(source: string) { if (!source.startsWith('@deepseek-ai/')) return null; if (CLIENT_EXTERNALS.includes(source as (typeof CLIENT_EXTERNALS)[number])) return null; throw new Error(`client bundle purity: "${source}" is unavailable`) },
    generateBundle(_options, bundle) { for (const output of Object.values(bundle)) { if (output.type !== 'asset' || !output.fileName.endsWith('.map')) continue; const map = JSON.parse(typeof output.source === 'string' ? output.source : Buffer.from(output.source).toString('utf8')) as Record<string, unknown>; delete map.sourcesContent; output.source = JSON.stringify(map) } },
  }],
  outputOptions: { entryFileNames: 'client.js', banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`, footer: 'return module.exports; } });', intro: 'var module = { exports: {} }; var exports = module.exports;', codeSplitting: false },
} satisfies UserConfig
