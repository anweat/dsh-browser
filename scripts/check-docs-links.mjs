#!/usr/bin/env node
/**
 * Documentation checks (no dependencies):
 *  1. every relative Markdown link, and its #anchor, points at something that exists;
 *  2. every absolute link into this repository's master branch
 *     (https://github.com/anweat/dsh-browser/blob|tree/master/<path>) points at a path that exists;
 *  3. README.md and README.en.md have the same number of second-level headings.
 *
 * Anchors follow GitHub's slug rules (lower case, punctuation dropped, spaces to hyphens, -1 / -2 for repeats).
 * Links inside fenced code blocks and inline code are ignored. node_modules, lib and .git are not scanned.
 * Usage: node scripts/check-docs-links.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REPO_PREFIX = /^https:\/\/github\.com\/anweat\/dsh-browser\/(?:blob|tree)\/master\/([^#?]*)/
const SKIP_DIRS = new Set(['node_modules', 'lib', '.git', 'dist'])

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (entry.name.endsWith('.md')) out.push(full)
  }
  return out
}

/** Lines of a Markdown file outside fenced code blocks, with their 1-based numbers. */
function proseLines(text) {
  const lines = []
  let fence = null
  text.split('\n').forEach((line, index) => {
    const marker = /^\s*(```+|~~~+)/.exec(line)
    if (marker) {
      if (fence === null) fence = marker[1][0]
      else if (marker[1][0] === fence) fence = null
      return
    }
    if (fence === null) lines.push({ line, number: index + 1 })
  })
  return lines
}

const stripInlineCode = line => line.replace(/`[^`]*`/g, match => ' '.repeat(match.length))

function slugify(heading) {
  return heading
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*_~]/g, match => (match === '_' ? '_' : ''))
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, '')
    .replace(/ /g, '-')
}

const anchorCache = new Map()
function anchorsOf(file) {
  if (anchorCache.has(file)) return anchorCache.get(file)
  const seen = new Map()
  const anchors = new Set()
  for (const { line } of proseLines(fs.readFileSync(file, 'utf8'))) {
    const match = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line)
    if (!match) continue
    const base = slugify(match[2])
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    anchors.add(count === 0 ? base : `${base}-${count}`)
  }
  anchorCache.set(file, anchors)
  return anchors
}

const problems = []
const rel = file => path.relative(root, file)

for (const file of walk(root)) {
  for (const { line, number } of proseLines(fs.readFileSync(file, 'utf8'))) {
    for (const match of stripInlineCode(line).matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const target = match[1]
      const where = `${rel(file)}:${number}`
      const repo = REPO_PREFIX.exec(target)
      if (repo) {
        const repoPath = decodeURIComponent(repo[1]).replace(/\/$/, '')
        if (repoPath && !fs.existsSync(path.join(root, repoPath))) problems.push(`${where}: ${target} -> ${repoPath} does not exist in the repository`)
        continue
      }
      if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue
      const [pathPart, anchor] = target.split('#')
      const resolved = pathPart === '' ? file : path.resolve(path.dirname(file), decodeURIComponent(pathPart))
      if (!fs.existsSync(resolved)) { problems.push(`${where}: ${target} -> ${rel(resolved)} does not exist`); continue }
      if (anchor !== undefined && anchor !== '' && resolved.endsWith('.md') && fs.statSync(resolved).isFile()) {
        if (!anchorsOf(resolved).has(decodeURIComponent(anchor).toLowerCase())) problems.push(`${where}: ${target} -> no heading "#${anchor}" in ${rel(resolved)}`)
      }
    }
  }
}

function h2Count(name) {
  const file = path.join(root, name)
  if (!fs.existsSync(file)) { problems.push(`${name} is missing`); return -1 }
  return proseLines(fs.readFileSync(file, 'utf8')).filter(({ line }) => /^## /.test(line)).length
}
const zh = h2Count('README.md')
const en = h2Count('README.en.md')
if (zh >= 0 && en >= 0 && zh !== en) problems.push(`README.md has ${zh} second-level headings but README.en.md has ${en}`)

if (problems.length > 0) {
  console.error(`documentation check failed (${problems.length}):\n` + problems.map(problem => '  ' + problem).join('\n'))
  process.exit(1)
}
console.log(`documentation check passed (${walk(root).length} Markdown files, ${zh} second-level headings in each README)`)
