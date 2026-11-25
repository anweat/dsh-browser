/** OpenCLI 3.x is not supported yet (1.8 and 2.x are, see opencli-two.test.ts): it is named clearly, from its package.json, and no process is spawned to find out. */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { BrowserService } from '../src/browser-service.ts'
import { resolveConfig } from '../src/config.ts'
import { opencliSupport, opencliVersionUnsupported } from '../src/deps.ts'
import { renderRoot } from '../src/actions/index-view.ts'

/** A fake OpenCLI package whose entry leaves a marker file when it is run. */
function fakeOpencli(version: string | undefined) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-opencli-guard-'))
  const marker = path.join(dir, 'was-run')
  fs.writeFileSync(path.join(dir, 'main.js'), `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'run'); console.log('[]')\n`)
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: '@jackwener/opencli', ...version ? { version } : {}, bin: { opencli: 'main.js' } }))
  return { dir, marker }
}

async function withOpencli<T>(version: string | undefined, body: (fake: ReturnType<typeof fakeOpencli>, service: BrowserService) => Promise<T>): Promise<T> {
  const fake = fakeOpencli(version)
  const previous = process.env.DSH_BROWSER_OPENCLI
  process.env.DSH_BROWSER_OPENCLI = fake.dir
  try {
    return await body(fake, new BrowserService(resolveConfig({ enabled: true, opencliEnabled: true, autoInstall: false } as never)))
  } finally {
    if (previous === undefined) delete process.env.DSH_BROWSER_OPENCLI
    else process.env.DSH_BROWSER_OPENCLI = previous
  }
}

test('major 2 and above is unsupported, 1.x and an unreadable version are not judged', () => {
  for (const version of ['3.0.0', 'v3.1.0', '10.2.1', '3.0.0-beta.1']) assert.equal(opencliVersionUnsupported(version), true, version)
  for (const version of ['1.8.0', '1.8.8', '1.99.0', '2.0.0', '2.0.3', 'v2.1.0', undefined, 'unknown', '']) assert.equal(opencliVersionUnsupported(version), false, String(version))
})

test('OpenCLI 3.x: opencliAvailable is false, opencli() and opencli.status say why, and nothing is spawned', async () => {
  await withOpencli('3.0.3', async (fake, service) => {
    const support = opencliSupport()
    assert.equal(support.state, 'unsupported')
    assert.equal(service.opencliAvailable(), false)
    const result = await service.opencli(['--version'])
    assert.equal(result.code, -1)
    assert.match(result.stderr, /OpenCLI 3\.0\.3 is installed, but dsh-browser supports OpenCLI >=1\.8\.0 <3 only/)
    assert.match(result.stderr, /npm i -g @jackwener\/opencli@2/)
    const doctor = await service.opencliDoctor()
    assert.equal(doctor.code, -1)
    assert.match(doctor.stderr, /3\.0\.3/)
    assert.equal(fs.existsSync(fake.marker), false, 'no process was started')
  })
})

test('OpenCLI 3.x: opencliCatalog says it instead of "must be an array", and status reports the version without calling it missing', async () => {
  await withOpencli('3.0.3', async (fake, service) => {
    await assert.rejects(() => service.opencliCatalog({ query: 'x' }), /OpenCLI 3\.0\.3 is installed.*npm i -g @jackwener\/opencli@2/)
    const status = await service.status()
    assert.equal(status.opencliInstalled, true)
    assert.equal(status.opencliVersion, '3.0.3')
    assert.match(status.opencliUnsupported!, /3\.0\.3/)
    assert.equal(status.opencliInstallHint, undefined, 'it is installed: not the "install it" hint')
    assert.ok(status.runtimeWarnings.some(warning => /OpenCLI 3\.0\.3/.test(warning)))
    assert.equal(fs.existsSync(fake.marker), false)
    const root = renderRoot({ mode: 'unrestricted', options: { modelDevelopmentEnabled: true }, enabled: true, skillAvailable: false, runtime: { opencliEnabled: true, opencliInstalled: true, opencliVersion: '3.0.3' } })
    assert.match(root, /OpenCLI 3\.0\.3 is installed but not supported yet/)
  })
})

test('a supported OpenCLI stays available and reports its version; a disabled OpenCLI raises no warning', async () => {
  await withOpencli('1.8.8', async (_fake, service) => {
    assert.equal(opencliSupport().state, 'ok')
    assert.equal(service.opencliAvailable(), true)
    const status = await service.status()
    assert.equal(status.opencliVersion, '1.8.8')
    assert.equal(status.opencliUnsupported, undefined)
    assert.equal(status.runtimeWarnings.some(warning => /OpenCLI/.test(warning)), false)
  })
  await withOpencli(undefined, async (_fake, service) => {
    assert.equal(service.opencliAvailable(), true, 'an unreadable version is not judged')
  })
  const fake = fakeOpencli('3.0.3')
  const previous = process.env.DSH_BROWSER_OPENCLI
  process.env.DSH_BROWSER_OPENCLI = fake.dir
  try {
    const service = new BrowserService(resolveConfig({ enabled: true, opencliEnabled: false, autoInstall: false } as never))
    assert.equal((await service.status()).runtimeWarnings.some(warning => /OpenCLI/.test(warning)), false)
  } finally {
    if (previous === undefined) delete process.env.DSH_BROWSER_OPENCLI
    else process.env.DSH_BROWSER_OPENCLI = previous
  }
})
