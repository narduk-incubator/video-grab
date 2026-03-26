#!/usr/bin/env node

const { execFileSync } = require('node:child_process')
const { chmodSync, existsSync, readdirSync, statSync } = require('node:fs')
const path = require('node:path')

const root = process.cwd()
const hooksDir = path.join(root, '.githooks')

function ensureExecutableHooks() {
  if (!existsSync(hooksDir)) return
  for (const entry of readdirSync(hooksDir)) {
    const fullPath = path.join(hooksDir, entry)
    if (!statSync(fullPath).isFile()) continue
    chmodSync(fullPath, 0o755)
  }
}

if (!existsSync(hooksDir)) {
  process.exit(0)
}

try {
  execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
} catch {
  process.exit(0)
}

let current = ''
try {
  current = execFileSync('git', ['config', '--get', 'core.hooksPath'], {
    cwd: root,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
} catch {
  current = ''
}

const normalized = current.replace(/\/+$/, '').replace(/^\.\//, '')
if (normalized === '.githooks') {
  ensureExecutableHooks()
  process.exit(0)
}

try {
  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  ensureExecutableHooks()
  console.log('✅ Git hooks installed at .githooks')
} catch (error) {
  console.warn('⚠️ Could not set git core.hooksPath to .githooks')
  if (error && typeof error === 'object' && 'message' in error) {
    console.warn(String(error.message))
  }
}
