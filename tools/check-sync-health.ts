#!/usr/bin/env -S pnpm exec tsx

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { REFERENCE_BASELINE_FILES } from './sync-manifest'

interface CheckResult {
  status: 'pass' | 'fail' | 'warn'
  summary: string
  detail?: string
}

interface PackageJson {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  pnpm?: {
    overrides?: Record<string, string>
  }
  overrides?: Record<string, string>
}

interface FleetSyncManifest {
  repos?: unknown
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootArg = process.argv
  .slice(2)
  .find((arg) => arg.startsWith('--root='))
  ?.slice('--root='.length)
const ROOT_DIR = rootArg ? rootArg : join(__dirname, '..')
const ROOT_PACKAGE_PATH = join(ROOT_DIR, 'package.json')
const LAYER_PACKAGE_PATH = join(ROOT_DIR, 'layers', 'narduk-nuxt-layer', 'package.json')
const APP_NUXT_CONFIG_PATH = join(ROOT_DIR, 'apps', 'web', 'nuxt.config.ts')
const PUBLIC_DIR = join(ROOT_DIR, 'apps', 'web', 'public')
const LOCKFILE_PATH = join(ROOT_DIR, 'pnpm-lock.yaml')
const PNPM_VIRTUAL_STORE_DIR = join(ROOT_DIR, 'node_modules', '.pnpm')
const TEMPLATE_REPO_DIR_HINTS = [
  process.env.TEMPLATE_REPO_DIR,
  ROOT_DIR,
  join(ROOT_DIR, '..', '..', 'narduk-nuxt-template'),
  join(ROOT_DIR, '..', 'narduk-nuxt-template'),
]
const CONTROL_PLANE_REPO_DIR_HINTS = [
  process.env.CONTROL_PLANE_REPO_DIR,
  ROOT_DIR,
  join(ROOT_DIR, '..', 'template-apps', 'control-plane'),
  join(ROOT_DIR, '..', '..', 'template-apps', 'control-plane'),
]

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

function firstExistingPath(candidates: Array<string | undefined>): string | null {
  for (const candidate of candidates) {
    if (!candidate) continue
    if (existsSync(candidate)) return candidate
  }
  return null
}

function parseVersionParts(input: string | null | undefined): [number, number, number] | null {
  if (!input) return null
  const match = input.match(/(\d+)\.(\d+)\.(\d+)/)
  if (!match) return null
  return [
    Number.parseInt(match[1] ?? '0', 10),
    Number.parseInt(match[2] ?? '0', 10),
    Number.parseInt(match[3] ?? '0', 10),
  ]
}

function isOlderVersion(
  actual: string | null | undefined,
  minimum: string | null | undefined,
): boolean {
  const left = parseVersionParts(actual)
  const right = parseVersionParts(minimum)
  if (!left || !right) return false

  for (let index = 0; index < 3; index += 1) {
    if (left[index] < right[index]) return true
    if (left[index] > right[index]) return false
  }

  return false
}

function getDeclaredVersion(pkg: PackageJson, name: string): string | null {
  return pkg.dependencies?.[name] || pkg.devDependencies?.[name] || null
}

function getExpectedNuxtOgImageVersion(pkg: PackageJson): string | null {
  return pkg.pnpm?.overrides?.['nuxt-og-image'] || pkg.overrides?.['nuxt-og-image'] || null
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function listVirtualStoreVersions(packageName: string): string[] {
  if (!existsSync(PNPM_VIRTUAL_STORE_DIR)) return []

  const prefix = `${packageName}@`
  return [
    ...new Set(
      readdirSync(PNPM_VIRTUAL_STORE_DIR)
        .filter((entry) => entry.startsWith(prefix))
        .map((entry) => entry.slice(prefix.length).split('_')[0] ?? '')
        .filter(Boolean),
    ),
  ].sort()
}

function listLockfileVersions(packageName: string): string[] {
  if (!existsSync(LOCKFILE_PATH)) return []

  const content = readFileSync(LOCKFILE_PATH, 'utf8')
  const pattern = new RegExp(`${escapeRegExp(packageName)}@([^:(\\s]+)`, 'g')
  const versions = new Set<string>()

  for (const match of content.matchAll(pattern)) {
    const version = match[1]?.trim()
    if (version) versions.add(version)
  }

  return [...versions].sort()
}

function findDsStore(dir: string, base = dir): string[] {
  if (!existsSync(dir)) return []
  const matches: string[] = []

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      matches.push(...findDsStore(full, base))
      continue
    }

    if (entry.name === '.DS_Store') {
      matches.push(full.slice(base.length + 1))
    }
  }

  return matches
}

function checkFontsCompatibility(rootPkg: PackageJson, layerPkg: PackageJson | null): CheckResult {
  const declared = getDeclaredVersion(rootPkg, '@nuxt/fonts')
  if (!declared) {
    return {
      status: 'pass',
      summary: 'root package does not pin @nuxt/fonts',
    }
  }

  const layerDeclared =
    layerPkg?.overrides?.['@nuxt/fonts'] ||
    layerPkg?.dependencies?.['@nuxt/fonts'] ||
    layerPkg?.devDependencies?.['@nuxt/fonts'] ||
    '0.13.0'

  if (isOlderVersion(declared, layerDeclared)) {
    return {
      status: 'fail',
      summary: `@nuxt/fonts ${declared} is older than layer baseline ${layerDeclared}`,
      detail: 'Update the root package to match or exceed the layer version.',
    }
  }

  return {
    status: 'pass',
    summary: `@nuxt/fonts ${declared} meets layer baseline ${layerDeclared}`,
  }
}

function checkNuxtOgImageInstall(rootPkg: PackageJson): CheckResult {
  const expected = getExpectedNuxtOgImageVersion(rootPkg)
  if (!expected) {
    return {
      status: 'warn',
      summary: 'no nuxt-og-image override declared',
    }
  }

  const installedVersions = listVirtualStoreVersions('nuxt-og-image')
  if (installedVersions.length === 0) {
    return {
      status: 'warn',
      summary: 'nuxt-og-image not present in the pnpm virtual store',
      detail: 'Run `pnpm install --frozen-lockfile` before shipping.',
    }
  }

  if (!installedVersions.includes(expected)) {
    return {
      status: 'fail',
      summary: `installed nuxt-og-image versions ${installedVersions.join(', ')} do not include expected ${expected}`,
      detail:
        'The install state is stale or corrupted. Reinstall dependencies and verify the pnpm virtual store.',
    }
  }

  return {
    status: 'pass',
    summary: `nuxt-og-image ${expected} is present in the pnpm virtual store`,
  }
}

function checkOgImageConfig(): CheckResult {
  if (!existsSync(APP_NUXT_CONFIG_PATH)) {
    return {
      status: 'warn',
      summary: 'apps/web/nuxt.config.ts not found',
    }
  }

  const content = readFileSync(APP_NUXT_CONFIG_PATH, 'utf8')
  const hasObsoleteDefaultsComponent =
    /ogImage\s*:\s*\{[\s\S]*?defaults\s*:\s*\{[\s\S]*?component\s*:/m.test(content)

  if (hasObsoleteDefaultsComponent) {
    return {
      status: 'fail',
      summary: 'obsolete ogImage.defaults.component config detected',
      detail:
        'Move OG image component selection to defineOgImage() / useSeo() instead of nuxt.config.ts.',
    }
  }

  return {
    status: 'pass',
    summary: 'ogImage config shape is current',
  }
}

function checkPublicJunk(): CheckResult {
  const junk = findDsStore(PUBLIC_DIR)
  if (junk.length === 0) {
    return {
      status: 'pass',
      summary: 'no .DS_Store files in public assets',
    }
  }

  return {
    status: 'fail',
    summary: `${junk.length} junk asset(s) found`,
    detail: junk.map((file) => `apps/web/public/${file}`).join('\n'),
  }
}

function checkReferenceBaselines(): CheckResult {
  const missing = REFERENCE_BASELINE_FILES.filter(
    (relativePath) => !existsSync(join(ROOT_DIR, relativePath)),
  )
  if (missing.length === 0) {
    return {
      status: 'pass',
      summary: 'reference baselines present for local-only docs/config',
    }
  }

  return {
    status: 'warn',
    summary: `${missing.length} reference baseline(s) missing`,
    detail: missing.join('\n'),
  }
}

function checkLockfileState(rootPkg: PackageJson): CheckResult {
  const expected = getExpectedNuxtOgImageVersion(rootPkg)
  if (!expected) {
    return {
      status: 'warn',
      summary: 'no nuxt-og-image override declared',
    }
  }

  const lockedVersions = listLockfileVersions('nuxt-og-image')
  if (lockedVersions.length === 0) {
    return {
      status: 'warn',
      summary: 'nuxt-og-image not present in pnpm-lock.yaml',
      detail: 'Run `pnpm install --frozen-lockfile` to refresh the lockfile state.',
    }
  }

  if (!lockedVersions.includes(expected)) {
    return {
      status: 'fail',
      summary: `pnpm-lock.yaml versions ${lockedVersions.join(', ')} do not include expected ${expected}`,
      detail: 'The lockfile is out of sync with the declared override.',
    }
  }

  return {
    status: 'pass',
    summary: `pnpm-lock.yaml includes nuxt-og-image ${expected}`,
  }
}

async function checkFleetManifestParity(): Promise<CheckResult> {
  const manifestPath = firstExistingPath(
    TEMPLATE_REPO_DIR_HINTS.map((dir) =>
      dir ? join(dir, 'config', 'fleet-sync-repos.json') : undefined,
    ),
  )
  if (!manifestPath) {
    return {
      status: 'pass',
      summary: 'fleet manifest parity not applicable in this checkout',
    }
  }

  const managedReposPath = firstExistingPath(
    CONTROL_PLANE_REPO_DIR_HINTS.map((dir) =>
      dir ? join(dir, 'apps', 'web', 'server', 'data', 'managed-repos.ts') : undefined,
    ),
  )
  if (!managedReposPath) {
    return {
      status: 'warn',
      summary: 'fleet manifest present but no local control-plane clone found',
      detail:
        'Set CONTROL_PLANE_REPO_DIR to validate config/fleet-sync-repos.json against managed-repos.ts.',
    }
  }

  const manifest = readJson<FleetSyncManifest>(manifestPath)
  if (
    !manifest ||
    !Array.isArray(manifest.repos) ||
    manifest.repos.some((repo) => typeof repo !== 'string')
  ) {
    return {
      status: 'fail',
      summary: 'fleet sync manifest is invalid',
      detail: manifestPath,
    }
  }

  const managedReposModule = (await import(pathToFileURL(managedReposPath).href)) as {
    getSyncManagedRepos?: () => Array<{ name: string }>
  }
  if (typeof managedReposModule.getSyncManagedRepos !== 'function') {
    return {
      status: 'fail',
      summary: 'managed-repos module does not export getSyncManagedRepos()',
      detail: managedReposPath,
    }
  }

  const expectedRepos = managedReposModule
    .getSyncManagedRepos()
    .map((repo) => repo.name)
    .sort((left, right) => left.localeCompare(right))
  const actualRepos = [...new Set(manifest.repos)].sort((left, right) => left.localeCompare(right))
  const missing = expectedRepos.filter((repo) => !actualRepos.includes(repo))
  const extra = actualRepos.filter((repo) => !expectedRepos.includes(repo))

  if (missing.length === 0 && extra.length === 0) {
    return {
      status: 'pass',
      summary: `fleet sync manifest matches ${expectedRepos.length} sync-managed repo(s)`,
    }
  }

  return {
    status: 'fail',
    summary: `fleet sync manifest drift detected (${missing.length} missing, ${extra.length} extra)`,
    detail: [
      missing.length > 0 ? `missing: ${missing.join(', ')}` : null,
      extra.length > 0 ? `extra: ${extra.join(', ')}` : null,
      `manifest: ${manifestPath}`,
      `source: ${managedReposPath}`,
    ]
      .filter(Boolean)
      .join('\n'),
  }
}

async function main() {
  const rootPkg = readJson<PackageJson>(ROOT_PACKAGE_PATH)
  if (!rootPkg) {
    console.error('Missing package.json')
    process.exit(1)
  }

  const layerPkg = readJson<PackageJson>(LAYER_PACKAGE_PATH)
  const checks: Array<[string, CheckResult]> = [
    ['fonts', checkFontsCompatibility(rootPkg, layerPkg)],
    ['nuxt-og-image install', checkNuxtOgImageInstall(rootPkg)],
    ['pnpm lockfile', checkLockfileState(rootPkg)],
    ['og-image config', checkOgImageConfig()],
    ['public junk', checkPublicJunk()],
    ['reference baselines', checkReferenceBaselines()],
    ['fleet manifest parity', await checkFleetManifestParity()],
  ]

  console.log('\nSync Health Check')
  console.log('════════════════════════════════════════════════════')

  let failed = 0
  for (const [name, result] of checks) {
    const icon = result.status === 'pass' ? '✅' : result.status === 'warn' ? '⚠️ ' : '❌'
    console.log(` ${icon} ${name}: ${result.summary}`)
    if (result.detail) {
      for (const line of result.detail.split('\n')) {
        console.log(`    ${line}`)
      }
    }
    if (result.status === 'fail') failed += 1
  }

  console.log('════════════════════════════════════════════════════')
  if (failed === 0) {
    console.log(' ✅ Sync health is clean.')
    process.exit(0)
  }

  console.log(` ❌ ${failed} sync health check(s) failed`)
  process.exit(1)
}

void main()
