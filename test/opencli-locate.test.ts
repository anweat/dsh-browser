import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { locateOpencli, type OpencliSearchEnv } from '../src/deps.ts'

/** A fake `@jackwener/opencli` package directory under `parent/node_modules`. */
function fakePackage(parent: string, name = '@jackwener/opencli'): string {
  const dir = path.join(parent, 'node_modules', name)
  fs.mkdirSync(path.join(dir, 'dist', 'src'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, version: '1.8.8', bin: { opencli: 'dist/src/main.js' } }))
  fs.writeFileSync(path.join(dir, 'dist', 'src', 'main.js'), '#!/usr/bin/env node\n')
  return dir
}

const search = (overrides: Partial<OpencliSearchEnv> = {}): OpencliSearchEnv => ({
  platform: 'linux', env: {}, home: '/nonexistent-home', pluginPackageJsons: () => [], npmGlobalRoot: () => undefined, ...overrides,
})

test('OpenCLI is found where it was installed, in a fixed order, and not found when nowhere', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-opencli-'))
  try {
    assert.equal(locateOpencli(search()), undefined)

    const own = fakePackage(path.join(root, 'profile'))
    const globalPkg = fakePackage(path.join(root, 'npm-global-root'))
    // global root points at <root>/npm-global-root/node_modules
    const globalRoot = path.join(root, 'npm-global-root', 'node_modules')
    const viaNpm = locateOpencli(search({ npmGlobalRoot: () => globalRoot }))
    assert.deepEqual([viaNpm?.source, viaNpm?.packageDir], ['global-npm', globalPkg])

    // The plugin's own copy (a profile that approved the build script) wins over a global one.
    const plugin = locateOpencli(search({ pluginPackageJsons: () => [path.join(own, 'package.json')], npmGlobalRoot: () => globalRoot }))
    assert.deepEqual([plugin?.source, plugin?.entry], ['plugin', path.join(own, 'dist', 'src', 'main.js')])

    // A launcher on PATH (a symlink into the package on Unix) is resolved to its package.
    const bin = path.join(root, 'bin')
    fs.mkdirSync(bin)
    fs.symlinkSync(path.join(globalPkg, 'dist', 'src', 'main.js'), path.join(bin, 'opencli'))
    const viaPath = locateOpencli(search({ env: { PATH: `/nowhere:${bin}` } }))
    assert.deepEqual([viaPath?.source, viaPath?.packageDir], ['path', fs.realpathSync(globalPkg)])
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

test('a desktop app without a shell PATH still finds a Node-version-manager install, newest version first', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-opencli-home-'))
  try {
    const older = path.join(home, '.local', 'share', 'fnm', 'node-versions', 'v22.1.0', 'installation', 'lib')
    const newer = path.join(home, '.local', 'share', 'fnm', 'node-versions', 'v24.2.0', 'installation', 'lib')
    fakePackage(older)
    const expected = fakePackage(newer)
    const found = locateOpencli(search({ home }))
    assert.deepEqual([found?.source, found?.packageDir], ['common-prefix', expected])
  } finally { fs.rmSync(home, { recursive: true, force: true }) }
})

test('DSH_BROWSER_OPENCLI names the package, its main.js or the launcher, and a wrong value is not silently replaced', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-opencli-env-'))
  try {
    const pkg = fakePackage(root)
    const entry = path.join(pkg, 'dist', 'src', 'main.js')
    fakePackage(path.join(root, 'g'))
    const globalRoot = path.join(root, 'g', 'node_modules')
    for (const value of [pkg, entry]) {
      const found = locateOpencli(search({ env: { DSH_BROWSER_OPENCLI: value }, npmGlobalRoot: () => globalRoot }))
      assert.deepEqual([found?.source, found?.entry], ['env', fs.realpathSync(entry)], value)
    }
    // Explicit but wrong: report "not found" rather than quietly using the global copy the user did not ask for.
    assert.equal(locateOpencli(search({ env: { DSH_BROWSER_OPENCLI: path.join(root, 'missing.js') }, npmGlobalRoot: () => globalRoot })), undefined)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

test('a package.json with another name is not mistaken for OpenCLI', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-opencli-name-'))
  try {
    const imposter = fakePackage(root, 'not-opencli')
    assert.equal(locateOpencli(search({ pluginPackageJsons: () => [path.join(imposter, 'package.json')] })), undefined)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})
