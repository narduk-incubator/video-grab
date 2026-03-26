import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { runCommand } from './command'

type WranglerRoute = string | { pattern?: string; custom_domain?: boolean }
type WranglerKvBinding = { binding?: string; id?: string; preview_id?: string }
type WranglerConfig = {
  name?: string
  routes?: WranglerRoute[]
  kv_namespaces?: WranglerKvBinding[]
}
type CloudflareApiError = { code: number; message: string }
type CloudflareApiResponse<T> = { success: boolean; result: T; errors: CloudflareApiError[] }
type KvNamespace = { id: string; title: string }
type KvNamespaceListResponse = CloudflareApiResponse<KvNamespace[]> & {
  result_info?: { total_count?: number; page?: number; per_page?: number; count?: number }
}

const CF_API_BASE = 'https://api.cloudflare.com/client/v4'
const PLACEHOLDER_KV_NAMESPACE_ID = '00000000000000000000000000000000'
const SHIP_DOPPLER_CONFIG = 'prd'

function run(
  command: string,
  args: string[] = [],
  cwd = process.cwd(),
  env: NodeJS.ProcessEnv | undefined = undefined,
) {
  console.log(`\n> ${command} ${args.join(' ')}`.trim())
  runCommand(command, args, { stdio: 'inherit', cwd, env })
}

function tokenizeCommand(command: string): string[] {
  const tokens = command.match(/"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|([^\s"']+)/g)
  if (!tokens) return []

  return tokens.map((token) => {
    if (token.startsWith('"') && token.endsWith('"')) {
      return token.slice(1, -1)
    }
    if (token.startsWith("'") && token.endsWith("'")) {
      return token.slice(1, -1)
    }
    return token
  })
}

function parseMigrateCommand(rawCommand: string): string[] {
  if (/[;&|`$<>]/.test(rawCommand)) {
    throw new Error(`Unsafe db:migrate script: ${rawCommand}`)
  }

  const tokens = tokenizeCommand(rawCommand)
  if (tokens.length === 0) {
    throw new Error('Empty db:migrate script.')
  }

  return tokens
}

function unwrapDopplerRun(tokens: string[]): string[] {
  if (tokens[0] !== 'doppler' || tokens[1] !== 'run') {
    return tokens
  }

  const separatorIndex = tokens.indexOf('--')
  if (separatorIndex === -1 || separatorIndex === tokens.length - 1) {
    return tokens
  }

  return unwrapDopplerRun(tokens.slice(separatorIndex + 1))
}

function normalizeShipMigrateCommand(tokens: string[]): string[] {
  const commandTokens = unwrapDopplerRun(tokens)
  if (commandTokens.length === 0) {
    throw new Error('db:migrate script resolved to an empty command.')
  }

  if (commandTokens[0] === 'pnpm') {
    return commandTokens
  }

  return ['pnpm', 'exec', ...commandTokens]
}

function getOutput(command: string, args: string[] = [], cwd = process.cwd()): string {
  return runCommand(command, args, {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function getRepoRoot(appDir: string): string {
  return resolve(appDir, '..', '..')
}

function getAppWranglerPath(appDir: string): string {
  return resolve(appDir, 'wrangler.json')
}

function getAppRootPackagePath(appDir: string): string {
  return resolve(getRepoRoot(appDir), 'package.json')
}

function readJsonFile<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null
  return JSON.parse(readFileSync(filePath, 'utf8')) as T
}

function getDopplerSecret(appDir: string, key: string): string {
  try {
    return getOutput(
      'doppler',
      ['secrets', 'get', key, '--config', SHIP_DOPPLER_CONFIG, '--plain'],
      getRepoRoot(appDir),
    )
  } catch {
    return ''
  }
}

function getCloudflareHeaders(apiToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiToken}`,
    'Content-Type': 'application/json',
  }
}

function formatCloudflareErrors(errors: CloudflareApiError[] | undefined): string {
  return (errors ?? []).map((error) => `${error.code}: ${error.message}`).join(', ')
}

function isInvalidKvNamespaceId(value: unknown): boolean {
  return (
    typeof value !== 'string' || value.trim().length === 0 || value === PLACEHOLDER_KV_NAMESPACE_ID
  )
}

function hasTrackedFileChanges(repoRoot: string, relativePath: string): boolean {
  try {
    runCommand('git', ['diff', '--quiet', '--', relativePath], { cwd: repoRoot })
    runCommand('git', ['diff', '--cached', '--quiet', '--', relativePath], { cwd: repoRoot })
    return false
  } catch {
    return true
  }
}

async function listAllKvNamespaces(accountId: string, apiToken: string): Promise<KvNamespace[]> {
  const namespaces: KvNamespace[] = []
  let page = 1
  const perPage = 100

  while (page <= 500) {
    const url = new URL(`${CF_API_BASE}/accounts/${accountId}/storage/kv/namespaces`)
    url.searchParams.set('page', String(page))
    url.searchParams.set('per_page', String(perPage))

    const response = await fetch(url, {
      headers: getCloudflareHeaders(apiToken),
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`Cloudflare KV list failed: ${response.status} ${text}`)
    }

    const data = (await response.json()) as KvNamespaceListResponse
    if (!data.success) {
      throw new Error(`Cloudflare KV list error: ${formatCloudflareErrors(data.errors)}`)
    }

    const batch = data.result ?? []
    namespaces.push(...batch)

    const total = data.result_info?.total_count
    if (
      batch.length === 0 ||
      batch.length < perPage ||
      (total !== undefined && namespaces.length >= total)
    ) {
      break
    }

    page += 1
  }

  return namespaces
}

async function createKvNamespace(
  accountId: string,
  apiToken: string,
  title: string,
): Promise<KvNamespace> {
  const response = await fetch(`${CF_API_BASE}/accounts/${accountId}/storage/kv/namespaces`, {
    method: 'POST',
    headers: getCloudflareHeaders(apiToken),
    body: JSON.stringify({ title }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Cloudflare KV create failed (${title}): ${response.status} ${text}`)
  }

  const data = (await response.json()) as CloudflareApiResponse<KvNamespace>
  if (!data.success) {
    throw new Error(`Cloudflare KV create error (${title}): ${formatCloudflareErrors(data.errors)}`)
  }

  return data.result
}

async function ensureKvNamespaces(
  accountId: string,
  apiToken: string,
  baseName: string,
): Promise<{ production: KvNamespace; preview: KvNamespace }> {
  const titles = [`${baseName}-kv`, `${baseName}-kv-preview`] as const
  const existing = new Map(
    (await listAllKvNamespaces(accountId, apiToken)).map((namespace) => [
      namespace.title,
      namespace,
    ]),
  )

  const ensureNamespace = async (title: string): Promise<KvNamespace> => {
    const current = existing.get(title)
    if (current) return current

    const created = await createKvNamespace(accountId, apiToken, title)
    existing.set(title, created)
    return created
  }

  return {
    production: await ensureNamespace(titles[0]),
    preview: await ensureNamespace(titles[1]),
  }
}

function resolveKvNamespaceBaseName(appDir: string, wrangler: WranglerConfig): string {
  if (appDir.endsWith('/apps/web') || appDir.endsWith('/packages/web')) {
    const pkg = readJsonFile<{ name?: string }>(getAppRootPackagePath(appDir))
    if (pkg?.name?.trim()) {
      return pkg.name.trim()
    }
  }

  if (wrangler.name?.trim()) {
    return wrangler.name.trim()
  }

  return getRepoRoot(appDir).split('/').pop() || 'web'
}

async function ensureWranglerKvBinding(appDir: string): Promise<void> {
  const wranglerPath = getAppWranglerPath(appDir)
  if (!existsSync(wranglerPath)) return

  const wrangler = readJsonFile<WranglerConfig>(wranglerPath)
  if (!wrangler) return

  const kvNamespaces = Array.isArray(wrangler.kv_namespaces) ? wrangler.kv_namespaces : []
  const kvBinding = kvNamespaces.find((namespace) => namespace?.binding === 'KV')
  const needsRepair =
    !kvBinding ||
    isInvalidKvNamespaceId(kvBinding.id) ||
    isInvalidKvNamespaceId(kvBinding.preview_id)

  if (!needsRepair) {
    return
  }

  const repoRoot = getRepoRoot(appDir)
  const relativeWranglerPath = relative(repoRoot, wranglerPath)
  if (hasTrackedFileChanges(repoRoot, relativeWranglerPath)) {
    throw new Error(
      `${relativeWranglerPath} needs KV repair, but it already has local changes. Repair or commit that file first.`,
    )
  }

  const accountId = getDopplerSecret(appDir, 'CLOUDFLARE_ACCOUNT_ID')
  const apiToken = getDopplerSecret(appDir, 'CLOUDFLARE_API_TOKEN')
  if (!accountId || !apiToken) {
    throw new Error(
      `Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN in Doppler for ${repoRoot}.`,
    )
  }

  const namespaceBaseName = resolveKvNamespaceBaseName(appDir, wrangler)
  const namespaces = await ensureKvNamespaces(accountId, apiToken, namespaceBaseName)

  if (kvBinding) {
    kvBinding.id = namespaces.production.id
    kvBinding.preview_id = namespaces.preview.id
  } else {
    wrangler.kv_namespaces = [
      ...kvNamespaces,
      {
        binding: 'KV',
        id: namespaces.production.id,
        preview_id: namespaces.preview.id,
      },
    ]
  }

  writeFileSync(wranglerPath, JSON.stringify(wrangler, null, 2) + '\n', 'utf8')
  console.log(
    `Repaired KV binding in ${relativeWranglerPath}: prod=${namespaces.production.id} preview=${namespaces.preview.id}`,
  )
}

function getUntrackedFiles(cwd: string): string[] {
  const output = getOutput('git', ['ls-files', '--others', '--exclude-standard'], cwd)
  if (!output) return []
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function isLocalhostUrl(value: string | null | undefined): boolean {
  if (!value) return false

  try {
    const hostname = new URL(value).hostname
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.localhost')
  } catch {
    return false
  }
}

function normalizeRoutePattern(pattern: string): string | null {
  const trimmed = pattern.trim()
  if (!trimmed) return null

  const withoutScheme = trimmed.replace(/^[a-z]+:\/\//i, '')
  const host = withoutScheme.split('/')[0]?.trim()
  if (!host || host.includes('*')) return null

  return `https://${host}`
}

function resolveCanonicalSiteUrl(appDir: string): string | null {
  const wranglerPath = getAppWranglerPath(appDir)
  if (!existsSync(wranglerPath)) return null

  try {
    const parsed = JSON.parse(readFileSync(wranglerPath, 'utf8')) as WranglerConfig
    const routes = Array.isArray(parsed.routes) ? parsed.routes : []

    for (const route of routes) {
      if (typeof route === 'string') {
        const normalized = normalizeRoutePattern(route)
        if (normalized) return normalized
        continue
      }

      if (!route?.pattern) continue
      if (route.custom_domain === false) continue

      const normalized = normalizeRoutePattern(route.pattern)
      if (normalized) return normalized
    }
  } catch (error) {
    console.warn(`⚠️ Failed to parse wrangler.json for ${appDir}: ${String(error)}`)
  }

  return null
}

function getDopplerSiteUrl(appDir: string): string {
  return getDopplerSecret(appDir, 'SITE_URL')
}

function resolveShipEnvironment(appDir: string): NodeJS.ProcessEnv | undefined {
  const canonicalSiteUrl = resolveCanonicalSiteUrl(appDir)
  const dopplerSiteUrl = getDopplerSiteUrl(appDir)

  if (!canonicalSiteUrl) {
    if (isLocalhostUrl(dopplerSiteUrl)) {
      console.warn(
        `⚠️ Doppler SITE_URL is localhost for ${appDir}, but no canonical route was found in wrangler.json.`,
      )
    }
    return undefined
  }

  if (dopplerSiteUrl && !isLocalhostUrl(dopplerSiteUrl)) {
    return undefined
  }

  const reason = dopplerSiteUrl ? `Doppler SITE_URL=${dopplerSiteUrl}` : 'Doppler SITE_URL is unset'
  console.log(`Using canonical site URL ${canonicalSiteUrl} for build/deploy because ${reason}.`)

  return {
    ...process.env,
    SITE_URL: canonicalSiteUrl,
    APP_URL: canonicalSiteUrl,
    NUXT_SITE_URL: canonicalSiteUrl,
    NUXT_PUBLIC_SITE_URL: canonicalSiteUrl,
    NUXT_PUBLIC_APP_URL: canonicalSiteUrl,
  }
}

async function shipApp(appTarget: string, options: { repairOnly: boolean }) {
  // Find target directory
  let appDir = resolve(process.cwd(), 'apps', appTarget)
  if (!existsSync(appDir)) {
    appDir = resolve(process.cwd(), 'packages', appTarget)
    if (!existsSync(appDir)) {
      console.error(`❌ Target directory for ${appTarget} does not exist in apps/ or packages/`)
      process.exit(1)
    }
  }

  await ensureWranglerKvBinding(appDir)

  if (options.repairOnly) {
    console.log(
      `\n🩹 Repair complete for ${appTarget}. Skipping build, push, migrations, and deploy.`,
    )
    return
  }

  const pkgPath = resolve(appDir, 'package.json')
  let hasMigrate = false
  let pkg
  if (existsSync(pkgPath)) {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
    if (pkg.scripts && pkg.scripts['db:migrate']) {
      hasMigrate = true
    }
  }
  const shipEnv = resolveShipEnvironment(appDir)

  // 1. Build Verification
  console.log(`\n🏗️ Building ${appTarget}...`)
  try {
    run(
      'doppler',
      ['run', '--config', SHIP_DOPPLER_CONFIG, '--', 'pnpm', 'run', 'build'],
      appDir,
      shipEnv,
    )
  } catch (error) {
    console.error(`\n❌ Build failed for ${appTarget}. Aborting ship to prevent broken commit.`)
    process.exit(1)
  }

  // 2. Git operations
  console.log(`\n📦 Checking git status...`)
  const untrackedFiles = getUntrackedFiles(appDir)
  if (untrackedFiles.length > 0) {
    console.log(`Ignoring untracked files during ship auto-commit: ${untrackedFiles.join(', ')}`)
  }

  run('git', ['add', '-u'], appDir)

  let hasChanges = false
  try {
    runCommand('git', ['diff', '--cached', '--quiet'], { cwd: appDir })
  } catch (e) {
    hasChanges = true
  }

  if (hasChanges) {
    const date = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
    run('git', ['commit', '-m', `chore: ship ${date}`], appDir)
  } else {
    console.log('No changes to commit.')
  }

  console.log(`\n🔄 Fetching remote...`)
  run('git', ['fetch'], appDir)
  try {
    runCommand('git', ['merge-base', '--is-ancestor', '@{u}', 'HEAD'], { cwd: appDir })
  } catch (e) {
    console.error(
      '\n❌ Remote has changes not in local branch. Run: git pull --rebase && pnpm ship\n',
    )
    process.exit(1)
  }

  console.log(`\n🚀 Pushing to remote...`)
  run('git', ['push'], appDir)

  // 3. Remote Migrations
  if (hasMigrate && pkg) {
    console.log(`\n🗄️ Running remote D1 migrations for ${appTarget}...`)
    const migrateCmd = pkg.scripts['db:migrate'].replaceAll('--local', '--remote')
    const migrateArgs = normalizeShipMigrateCommand(parseMigrateCommand(migrateCmd))
    run('doppler', ['run', '--config', SHIP_DOPPLER_CONFIG, '--', ...migrateArgs], appDir)
  }

  // 4. Deploy
  console.log(`\n☁️ Deploying ${appTarget} to Edge...`)
  try {
    run(
      'doppler',
      ['run', '--config', SHIP_DOPPLER_CONFIG, '--', 'pnpm', 'run', 'deploy'],
      appDir,
      shipEnv,
    )
  } catch (error) {
    console.error(`\n❌ Deploy failed for ${appTarget}.`)
    process.exit(1)
  }

  console.log(
    `\n📡 Control-plane fleet metadata is managed centrally; skipping ship-time registry mutation.`,
  )

  console.log(`\n🎉 Successfully shipped ${appTarget}!`)
}

async function main() {
  const args = process.argv.slice(2)
  const repairOnly = args.includes('--repair-only')
  const targetsArg = args.filter((arg) => !arg.startsWith('--'))[0] || 'web'

  let targets = [targetsArg]

  if (targetsArg.includes(',')) {
    targets = targetsArg.split(',').map((t) => t.trim())
  }

  for (const target of targets) {
    console.log(`\n======================================================`)
    console.log(`🚀 INITIATING SHIP SEQUENCE FOR: ${target}`)
    console.log(`======================================================\n`)
    await shipApp(target, { repairOnly })
  }
}

main()
