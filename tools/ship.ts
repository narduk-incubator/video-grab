import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runCommand } from './command'

type WranglerRoute = string | { pattern?: string; custom_domain?: boolean }

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

function getOutput(command: string, args: string[] = [], cwd = process.cwd()): string {
  return runCommand(command, args, {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
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
  const wranglerPath = resolve(appDir, 'wrangler.json')
  if (!existsSync(wranglerPath)) return null

  try {
    const parsed = JSON.parse(readFileSync(wranglerPath, 'utf8')) as {
      routes?: WranglerRoute[]
    }
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
  const envOutput = getOutput('doppler', ['run', '--', 'printenv'], appDir)

  for (const line of envOutput.split('\n')) {
    if (line.startsWith('SITE_URL=')) {
      return line.slice('SITE_URL='.length).trim()
    }
  }

  return ''
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

async function shipApp(appTarget: string) {
  // Find target directory
  let appDir = resolve(process.cwd(), 'apps', appTarget)
  if (!existsSync(appDir)) {
    appDir = resolve(process.cwd(), 'packages', appTarget)
    if (!existsSync(appDir)) {
      console.error(`❌ Target directory for ${appTarget} does not exist in apps/ or packages/`)
      process.exit(1)
    }
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
    run('doppler', ['run', '--', 'pnpm', 'run', 'build'], appDir, shipEnv)
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
    const migrateArgs = parseMigrateCommand(migrateCmd)
    run('doppler', ['run', '--', ...migrateArgs], appDir)
  }

  // 4. Deploy
  console.log(`\n☁️ Deploying ${appTarget} to Edge...`)
  try {
    run('doppler', ['run', '--', 'pnpm', 'run', 'deploy'], appDir, shipEnv)
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
  const targetArg = args[0] || 'web' // default to web target

  let targets = [targetArg]

  if (targetArg.includes(',')) {
    targets = targetArg.split(',').map((t) => t.trim())
  }

  for (const target of targets) {
    console.log(`\n======================================================`)
    console.log(`🚀 INITIATING SHIP SEQUENCE FOR: ${target}`)
    console.log(`======================================================\n`)
    await shipApp(target)
  }
}

main()
