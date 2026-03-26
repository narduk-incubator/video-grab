import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runCommand } from './command'

/**
 * VALIDATE.TS — Nuxt v4 Template Setup Validation Script
 * ----------------------------------------------------------------
 * Confirms that the necessary infrastructure and configurations have been successfully
 * provisioned for the current project.
 *
 * Usage:
 *   pnpm run validate
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.resolve(__dirname, '..')

// Construct the template name from parts so string replacement can never corrupt it.
const TEMPLATE_NAME = ['narduk', 'nuxt', 'template'].join('-')

/** Wrangler KV placeholder shipped in template `apps/web/wrangler.json` (not valid for deploy). */
const PLACEHOLDER_KV_NAMESPACE_ID = '00000000000000000000000000000000'

// --- Helper Functions ---
function checkCommand(
  command: string,
  args: string[],
  successMessage: string,
  errorMessage: string,
) {
  try {
    runCommand(command, args, { encoding: 'utf-8', stdio: 'pipe' })
    console.log(`  ✅ ${successMessage}`)
    return true
  } catch (error: any) {
    console.error(`  ❌ ${errorMessage}: ${error.stderr || error.message}`)
    return false
  }
}

async function getPrimaryWebDatabaseName(): Promise<string | null> {
  try {
    const webWranglerPath = path.join(ROOT_DIR, 'apps', 'web', 'wrangler.json')
    const webWranglerContent = await fs.readFile(webWranglerPath, 'utf-8')
    const webWrangler = JSON.parse(webWranglerContent) as {
      d1_databases?: Array<{ database_name?: string }>
    }

    return webWrangler.d1_databases?.[0]?.database_name || null
  } catch {
    return null
  }
}

async function main() {
  const packageJsonPath = path.join(ROOT_DIR, 'package.json')
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'))
  const APP_NAME = packageJson.name

  let allGood = true
  if (!APP_NAME || APP_NAME.includes(TEMPLATE_NAME)) {
    console.error(
      `  ❌ Project name is still '${APP_NAME}'. Has the project been provisioned or renamed?`,
    )
    allGood = false
  }

  console.log(`\n🔍 Validating Setup for: ${APP_NAME}`)

  // 1. Check D1 Databases (reads database_name from each app's wrangler.json)
  console.log('\nStep 1/6: Validating D1 Databases...')
  try {
    const appsDir = path.join(ROOT_DIR, 'apps')
    const entries = await fs.readdir(appsDir, { withFileTypes: true })
    const appDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name)
    let checkedAny = false

    for (const appDir of appDirs) {
      const wranglerPath = path.join(appsDir, appDir, 'wrangler.json')
      try {
        const wranglerContent = await fs.readFile(wranglerPath, 'utf-8')
        const parsedWrangler = JSON.parse(wranglerContent)
        if (parsedWrangler.d1_databases && parsedWrangler.d1_databases.length > 0) {
          const dbName = parsedWrangler.d1_databases[0].database_name
          if (dbName) {
            checkedAny = true
            allGood =
              checkCommand(
                'pnpm',
                ['exec', 'wrangler', 'd1', 'info', dbName],
                `Database ${dbName} exists (apps/${appDir}).`,
                `Database ${dbName} not found (apps/${appDir})`,
              ) && allGood
          }
        }
      } catch {
        // App doesn't have a wrangler.json — skip
      }
    }
    if (!checkedAny) {
      console.log('  ⏭ No apps with D1 databases to validate.')
    }
  } catch (e: any) {
    console.error(`  ❌ Failed to scan apps directory: ${e.message}`)
    allGood = false
  }

  // 2. Check wrangler.json database_id values
  console.log('\nStep 2/6: Validating wrangler.json database IDs...')
  try {
    const appsDir = path.join(ROOT_DIR, 'apps')
    const entries = await fs.readdir(appsDir, { withFileTypes: true })
    const appDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name)
    let foundAny = false

    for (const appDir of appDirs) {
      const wranglerPath = path.join(appsDir, appDir, 'wrangler.json')
      try {
        const wranglerContent = await fs.readFile(wranglerPath, 'utf-8')
        const parsedWrangler = JSON.parse(wranglerContent)
        foundAny = true

        if (parsedWrangler.d1_databases && parsedWrangler.d1_databases.length > 0) {
          const dbId = parsedWrangler.d1_databases[0].database_id
          if (dbId && dbId.length > 0 && dbId !== 'REPLACE_VIA_PNPM_SETUP') {
            console.log(`  ✅ apps/${appDir}/wrangler.json — database_id: ${dbId}`)
          } else {
            console.error(`  ❌ apps/${appDir}/wrangler.json — database_id missing or placeholder.`)
            allGood = false
          }
        }

        const isTemplateCheckout = APP_NAME.includes(TEMPLATE_NAME)
        const kvList = parsedWrangler.kv_namespaces
        if (!isTemplateCheckout && Array.isArray(kvList)) {
          const kvBinding = kvList.find(
            (n: { binding?: string }) => n && typeof n === 'object' && n.binding === 'KV',
          ) as { id?: string; preview_id?: string } | undefined
          if (kvBinding) {
            const badKvId = (v: unknown) =>
              typeof v !== 'string' ||
              v.length === 0 ||
              v === PLACEHOLDER_KV_NAMESPACE_ID
            if (badKvId(kvBinding.id) || badKvId(kvBinding.preview_id)) {
              console.error(
                `  ❌ apps/${appDir}/wrangler.json — KV binding "KV" id/preview_id missing or template placeholder (control plane must hydrate).`,
              )
              allGood = false
            } else {
              console.log(`  ✅ apps/${appDir}/wrangler.json — KV id and preview_id set`)
            }
          }
        }
        // Apps without d1_databases are valid (e.g. marketing, og-image) — skip silently
      } catch {
        // App doesn't have a wrangler.json — skip
      }
    }

    if (!foundAny) {
      console.error('  ❌ No wrangler.json files found in apps/*/')
      allGood = false
    }
  } catch (e: any) {
    console.error(`  ❌ Failed to scan apps directory: ${e.message}`)
    allGood = false
  }

  // 3. Doppler
  console.log('\nStep 3/6: Validating Doppler Configuration...')
  let dopplerOk = true
  dopplerOk = checkCommand(
    'doppler',
    ['projects', 'get', APP_NAME],
    `Doppler project ${APP_NAME} exists.`,
    `Doppler project ${APP_NAME} not found`,
  )
  if (!dopplerOk) allGood = false

  if (dopplerOk) {
    try {
      const output = runCommand(
        'doppler',
        ['secrets', '--project', APP_NAME, '--config', 'prd', '--only-names', '--plain'],
        { encoding: 'utf-8', stdio: 'pipe' },
      )
      const existing = new Set(output.trim().split('\n').filter(Boolean))
      const requiredSecrets = [
        'CLOUDFLARE_API_TOKEN',
        'CLOUDFLARE_ACCOUNT_ID',
        'APP_NAME',
        'SITE_URL',
        'NUXT_SESSION_PASSWORD',
      ]

      const missing = requiredSecrets.filter((s) => !existing.has(s))
      if (missing.length === 0) {
        console.log(`  ✅ Core Doppler secrets are present.`)
      } else {
        console.error(`  ❌ Missing Doppler secrets: ${missing.join(', ')}`)
        allGood = false
      }

      try {
        const agentAdminApiKey = runCommand(
          'doppler',
          [
            'secrets',
            'get',
            'AGENT_ADMIN_API_KEY',
            '--project',
            APP_NAME,
            '--config',
            'prd',
            '--plain',
          ],
          { encoding: 'utf-8', stdio: 'pipe' },
        ).trim()

        if (agentAdminApiKey.startsWith('nk_')) {
          console.log(`  ✅ AGENT_ADMIN_API_KEY present for agent/admin automation.`)
        } else {
          console.warn(
            '  ⚠️ AGENT_ADMIN_API_KEY is present but does not look like a layer API key (expected raw nk_... token).',
          )
          console.warn(
            '     Mint it via /api/auth/api-keys as an admin, then store the returned rawKey in Doppler.',
          )
          console.warn(
            '     Fleet apps can also be repaired from the template repo with `pnpm run backfill:agent-admin-keys -- --projects=<app-name> --force`.',
          )
        }
      } catch {
        console.warn('  ⚠️ Recommended Doppler secret missing: AGENT_ADMIN_API_KEY')
        console.warn(
          '     Mint it once via /api/auth/api-keys as an admin and store the raw nk_... token in Doppler.',
        )
        console.warn(
          '     Fleet apps can also be backfilled from the template repo with `pnpm run backfill:agent-admin-keys -- --projects=<app-name>`.',
        )
      }
    } catch {
      console.error('  ❌ Failed to fetch Doppler secrets.')
      allGood = false
    }
  }

  // 3b. Verify hub-and-spoke references resolve correctly
  console.log('\nStep 3b/6: Validating Doppler Hub References...')
  if (!dopplerOk) {
    console.log('  ⏭ Skipping (Doppler project not found).')
  } else {
    const hubChecks: Array<{ key: string; hub: string; config: string }> = [
      { key: 'CLOUDFLARE_API_TOKEN', hub: TEMPLATE_NAME, config: 'prd' },
      { key: 'CLOUDFLARE_ACCOUNT_ID', hub: TEMPLATE_NAME, config: 'prd' },
      { key: 'GITHUB_TOKEN_PACKAGES_READ', hub: TEMPLATE_NAME, config: 'prd' },
      { key: 'POSTHOG_PUBLIC_KEY', hub: TEMPLATE_NAME, config: 'prd' },
    ]

    for (const { key, hub, config } of hubChecks) {
      try {
        const hubJson = runCommand(
          'doppler',
          ['secrets', 'get', key, '--project', hub, '--config', config, '--json'],
          { encoding: 'utf-8', stdio: 'pipe' },
        )
        const hubValue = JSON.parse(hubJson)[key]?.computed || ''

        const spokeJson = runCommand(
          'doppler',
          ['secrets', 'get', key, '--project', APP_NAME, '--config', 'prd', '--json'],
          { encoding: 'utf-8', stdio: 'pipe' },
        )
        const spokeValue = JSON.parse(spokeJson)[key]?.computed || ''

        if (!spokeValue) {
          console.error(`  ❌ ${key} — not set in ${APP_NAME}/prd`)
          allGood = false
        } else if (spokeValue === hubValue) {
          console.log(`  ✅ ${key} — matches hub (${hub})`)
        } else {
          console.error(
            `  ❌ ${key} — STALE: does not match hub (${hub}). Run sync-template to fix.`,
          )
          allGood = false
        }
      } catch {
        console.warn(`  ⚠️ ${key} — could not verify (hub or spoke unavailable)`)
      }
    }
  }

  // 4. GitHub Secret
  console.log('\nStep 4/6: Validating GitHub Secrets...')

  // Check if gh CLI is available before attempting to list secrets
  let ghAvailable = false
  try {
    runCommand('gh', ['--version'], { encoding: 'utf-8', stdio: 'pipe' })
    ghAvailable = true
  } catch {
    /* gh not installed */
  }

  if (!ghAvailable) {
    console.log('  ⏭ GitHub CLI (gh) not installed — skipping secret validation.')
    console.log('     Install: https://cli.github.com/ then run `gh auth login`.')
  } else {
    let targetRepoFlag = ''
    try {
      const remotesOutput = runCommand('git', ['remote', '-v'], {
        encoding: 'utf-8',
        stdio: 'pipe',
      })
      const remotes = remotesOutput.split('\n').filter(Boolean)
      const targetRemoteLine = remotes.find(
        (line) => !line.includes(TEMPLATE_NAME) && line.includes('(push)'),
      )
      if (targetRemoteLine) {
        let url = targetRemoteLine.split(/\s+/)[1]
        url = url
          .replace(/^(https?:\/\/|git@)/, '')
          .replace(/^github\.com[:/]/, '')
          .replace(/\.git$/, '')
        if (url) {
          targetRepoFlag = url
          console.log(`  🎯 Checking secrets for repository: ${url}`)
        }
      }
    } catch {
      // Ignore error
    }

    try {
      const ghOutput = runCommand(
        'gh',
        ['secret', 'list', ...(targetRepoFlag ? ['--repo', targetRepoFlag] : [])],
        { encoding: 'utf-8', stdio: 'pipe' },
      )
      if (ghOutput.includes('DOPPLER_TOKEN')) {
        console.log(`  ✅ DOPPLER_TOKEN is set in GitHub repository.`)
      } else {
        console.error('  ❌ DOPPLER_TOKEN is missing from GitHub repository.')
        allGood = false
      }
    } catch (error: any) {
      const stderr = error.stderr || error.message || ''
      if (stderr.includes('not logged') || stderr.includes('auth login')) {
        console.log('  ⏭ GitHub CLI not authenticated — skipping secret validation.')
        console.log('     Run `gh auth login` and re-run validate.')
      } else {
        console.error(`  ❌ Failed to list GitHub secrets: ${stderr}`)
        allGood = false
      }
    }
  }

  // 5. Package.json health (critical deps + script database names)
  console.log('\nStep 5/6: Validating apps/web/package.json...')
  try {
    const webPkgPath = path.join(ROOT_DIR, 'apps', 'web', 'package.json')
    const webPkgContent = await fs.readFile(webPkgPath, 'utf-8')
    const webPkg = JSON.parse(webPkgContent)

    const requiredDeps = ['drizzle-orm', 'zod', '@iconify-json/lucide']
    const requiredDevDeps = ['@cloudflare/workers-types']

    for (const dep of requiredDeps) {
      if (webPkg.dependencies?.[dep]) {
        console.log(`  ✅ ${dep} in dependencies`)
      } else {
        console.error(
          `  ❌ ${dep} missing from dependencies (typecheck or Nuxt Icon SSR will fail)`,
        )
        allGood = false
      }
    }
    for (const dep of requiredDevDeps) {
      if (webPkg.devDependencies?.[dep]) {
        console.log(`  ✅ ${dep} in devDependencies`)
      } else {
        console.error(`  ❌ ${dep} missing from devDependencies`)
        allGood = false
      }
    }

    const templateDatabaseName = `${TEMPLATE_NAME}-db`
    const webDatabaseName = await getPrimaryWebDatabaseName()
    if (!webDatabaseName) {
      console.error('  ❌ Unable to resolve apps/web database_name from wrangler.json')
      allGood = false
    } else if (webDatabaseName === templateDatabaseName) {
      console.error(
        `  ❌ apps/web/wrangler.json still references template database '${templateDatabaseName}' — run setup with --repair`,
      )
      allGood = false
    } else {
      console.log(`  ✅ apps/web/wrangler.json references app database (${webDatabaseName})`)
    }

    for (const scriptName of ['db:migrate', 'db:seed', 'db:reset'] as const) {
      const script = webPkg.scripts?.[scriptName] || ''
      if (!script) {
        console.error(`  ❌ ${scriptName} script missing from apps/web/package.json`)
        allGood = false
        continue
      }

      if (!webDatabaseName) continue

      if (!script.includes(webDatabaseName)) {
        const reason =
          webDatabaseName !== templateDatabaseName && script.includes(templateDatabaseName)
            ? `still references template database '${templateDatabaseName}'`
            : `does not reference apps/web database '${webDatabaseName}'`
        console.error(`  ❌ ${scriptName} ${reason} — run setup with --repair`)
        allGood = false
      } else {
        console.log(`  ✅ ${scriptName} references apps/web database (${webDatabaseName})`)
      }
    }

    const migrateScript = webPkg.scripts?.['db:migrate'] || ''
    if (!migrateScript.includes('@narduk-enterprises/narduk-nuxt-template-layer/drizzle')) {
      console.error('  ❌ db:migrate is missing the shared layer migration directory')
      allGood = false
    } else {
      console.log('  ✅ db:migrate includes shared layer migrations')
    }

    if (!migrateScript.includes('--dir drizzle')) {
      console.error('  ❌ db:migrate is missing the app migration directory')
      allGood = false
    } else {
      console.log('  ✅ db:migrate includes app-owned migrations')
    }

    const predevScript = webPkg.scripts?.['predev'] || ''
    if (!predevScript) {
      console.log(
        webPkg.scripts?.['dev']?.includes('db:ready')
          ? '  ⏭ web:predev not set; db:ready runs from dev script.'
          : '  ⏭ web:predev not set; verify dev starts with db:migrate/db:ready.',
      )
    } else if (predevScript.includes('--file=') || predevScript.includes('--file ')) {
      console.error(
        `  ❌ web:predev uses a raw SQL file (e.g. migrations.sql) instead of db:migrate`,
      )
      allGood = false
    } else if (
      predevScript.includes('wrangler d1 execute') &&
      !predevScript.includes('db:migrate') &&
      !predevScript.includes('db:ready')
    ) {
      console.error('  ❌ web:predev must use db:migrate/db:ready, not direct wrangler d1 execute.')
      allGood = false
    } else {
      console.log('  ✅ web:predev uses db:migrate/db:ready flow')
    }
  } catch (e: any) {
    console.error(`  ❌ Failed to read apps/web/package.json: ${e.message}`)
    allGood = false
  }

  console.log('\n--- Validation Result ---')
  if (allGood) {
    console.log('🎉 All infrastructure checks passed successfully! Your project is ready.')
  } else {
    console.error(
      '⚠️ Some checks failed. Please review the errors above and fix the issues, or re-run provisioning / fix config.',
    )
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
