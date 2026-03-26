import { existsSync, readdirSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'

export const VERBATIM_SYNC_FILES = [
  'doppler.template.yaml',
  'config/fleet-sync-repos.json',
  'config/fleet-app-dir-overrides.json',
  '.githooks/pre-commit',
  '.githooks/post-checkout',
  '.githooks/post-merge',
  'tools/install-git-hooks.cjs',
  'tools/command.ts',
  'tools/gsc-verify.ts',
  'tools/update-layer.ts',
  'tools/validate.ts',

  'tools/check-guardrails.ts',
  'tools/sync-template.ts',
  'tools/sync-core.ts',
  'tools/sync-manifest.ts',
  'tools/check-drift-ci.ts',
  'tools/check-sync-health.ts',
  'tools/generate-favicons.ts',
  'tools/tail.ts',
  'tools/ship.ts',
  'tools/db-migrate.sh',
  'tools/check-setup.cjs',
  'scripts/dev-kill.sh',
  'scripts/cleanup-node-leaks.sh',
  'turbo.json',
  'pnpm-workspace.yaml',
  'renovate.json',
  '.github/copilot-instructions.md',
  '.github/prompts/ui-ux-pro-max/PROMPT.md',
  '.cursor/rules/user-global-skills.mdc',
  'apps/web/.nuxtrc',
  'apps/web/.npmrc',
  'apps/web/eslint.config.mjs',
  'prettier.config.mjs',
  '.prettierignore',
  '.editorconfig',
] as const

export const BOOTSTRAP_SYNC_FILES = ['guardrail-exceptions.json'] as const

// `.template-reference` is reserved for baselines that are intentionally
// allowed to diverge in downstream apps while still keeping a template copy to
// diff against locally.
export const REFERENCE_BASELINE_FILES = [
  '.template-reference/README.md',
  '.template-reference/AGENTS.md',
  '.template-reference/apps/web/AGENTS.md',
  '.template-reference/tools/AGENTS.md',
  '.template-reference/CONTRIBUTING.md',
  '.template-reference/playwright.config.ts',
] as const

export const RECURSIVE_SYNC_DIRECTORIES = [
  'packages/eslint-config',
  'tools/guardrails',
  '.agents/workflows',
  'layers/narduk-nuxt-layer',
] as const

export const STALE_SYNC_PATHS = [
  '.agents/.DS_Store',
  '.github/workflows/publish-layer.yml',
  '.github/workflows/deploy-showcase.yml',
  '.github/workflows/deploy.yml',
  '.github/workflows/version-bump.yml',
  '.github/workflows/template-sync-bot.yml',
  '.github/workflows/sync-fleet.yml',
  'tools/migrate-to-monorepo.ts',
  'tools/check-setup.js',
  '.cursor/.DS_Store',
  '.cursor/rules/nuxt-v4-template.mdc',
  '.env',
  '.env.local',
  '.env.example',
  '.template-reference/.DS_Store',
  '.template-reference/build-visibility.md',
  '.template-reference/ui-ux-pro-max',
  'layers/narduk-nuxt-layer/coverage',
  'layers/narduk-nuxt-layer/app/utils/format.ts',
  'layers/narduk-nuxt-layer/app/utils/safeLinkTarget.ts',
  'layers/narduk-nuxt-layer/eslint.overrides.mjs',
] as const

export const GENERATED_SYNC_FILES = ['.github/workflows/ci.yml'] as const

export const FLEET_ROOT_SCRIPT_PATCHES: Readonly<Record<string, string>> = {
  postinstall:
    "node -e \"if(!require('fs').existsSync('.setup-complete'))console.log('\\n⚠️  New apps: provision via the control plane (see AGENTS.md). Generated starters get .setup-complete from provisioning.\\n')\"",
  dev: 'pnpm --filter web dev',
  'build:plugins': 'pnpm --filter @narduk/eslint-config build',
  prelint: 'pnpm run build:plugins',
  predev: 'node tools/check-setup.cjs',
  prebuild: 'node tools/check-setup.cjs',
  preship:
    'node tools/check-setup.cjs && pnpm install --frozen-lockfile && pnpm audit --audit-level=critical && pnpm exec tsx tools/check-drift-ci.ts && pnpm exec tsx tools/check-sync-health.ts && pnpm run quality:check',
  ship: 'pnpm exec tsx tools/ship.ts',
  validate: 'pnpm exec tsx tools/validate.ts',
  'sync-template': 'pnpm exec tsx tools/sync-template.ts .',
  'update-layer': 'pnpm exec tsx tools/update-layer.ts',
  'check:sync-health': 'pnpm exec tsx tools/check-sync-health.ts',
  'hooks:install': 'node tools/install-git-hooks.cjs',
  'guardrails:repo': 'pnpm exec tsx tools/check-guardrails.ts',
  clean:
    "find . -type d \\( -name node_modules -o -name .nuxt -o -name .output -o -name .nitro -o -name .wrangler -o -name .turbo -o -name .data -o -name dist \\) -not -path './.git/*' -prune -exec rm -rf {} +",
  'clean:install': 'pnpm run clean && pnpm install && pnpm --filter web run db:ready',
  'db:migrate': 'pnpm --filter web run db:migrate',
  'dev:kill': 'sh scripts/dev-kill.sh',
  'cleanup:node-leaks': 'sh scripts/cleanup-node-leaks.sh',
  'test:e2e': 'playwright test',
  'test:e2e:web': 'pnpm --filter web test:e2e',
  'generate:favicons': 'pnpm exec tsx tools/generate-favicons.ts',
  quality: 'pnpm run quality:fix && pnpm run quality:check',
  'quality:check': "pnpm run guardrails:repo && turbo run quality --filter='./apps/*'",
  'quality:fix': 'turbo run lint --force -- --fix && pnpm run format',
  check: 'pnpm run quality:check',
  format: 'prettier --write "**/*.{ts,mts,vue,js,mjs,json,yaml,yml,css,md}"',
  'format:check': 'prettier --check "**/*.{ts,mts,vue,js,mjs,json,yaml,yml,css,md}"',
}

export const FLEET_WEB_SCRIPT_PATCHES: Readonly<Record<string, string>> = {
  predev: 'pnpm run db:ready',
  dev: '(doppler run -- nuxt dev || nuxt dev)',
  lint: 'eslint . --max-warnings 0',
  quality: "echo 'Turbo dependsOn handles lint + typecheck + format:check'",
}

const TRANSIENT_DIRECTORY_PATTERN =
  /(^|\/)(node_modules|coverage|dist|\.turbo|\.nuxt|\.output|\.nitro|\.wrangler|\.data|__pycache__)(\/|$)/

export function isIgnoredManagedPath(fullPath: string): boolean {
  return TRANSIENT_DIRECTORY_PATTERN.test(fullPath) || basename(fullPath) === '.DS_Store'
}

export function getCanonicalCiContent(): string {
  return `name: CI

on:
  workflow_dispatch:

concurrency:
  group: ci-\${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true

# CI is disabled (workflow_dispatch only) to conserve GitHub Actions minutes.
# Deploy is done locally via \`pnpm run deploy\` (wrangler deploy).
# See .agents/workflows/deploy.md for the local deploy workflow.

jobs:
  quality:
    uses: narduk-enterprises/narduk-nuxt-template/.github/workflows/reusable-quality.yml@main
    secrets:
      DOPPLER_TOKEN: \${{ secrets.DOPPLER_TOKEN }}
      GH_PACKAGES_TOKEN: \${{ secrets.GH_PACKAGES_TOKEN }}
`
}

function shouldIgnoreEntry(fullPath: string): boolean {
  return isIgnoredManagedPath(fullPath)
}

function collectFilesUnderDirectory(rootDir: string, relativeDir: string): string[] {
  const start = join(rootDir, relativeDir)
  if (!existsSync(start)) return []

  const files: string[] = []

  const visit = (fullPath: string, relativePath: string) => {
    if (shouldIgnoreEntry(fullPath)) return

    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      for (const entry of readdirSync(fullPath)) {
        const entryFullPath = join(fullPath, entry)
        const entryRelativePath = join(relativePath, entry)
        visit(entryFullPath, entryRelativePath)
      }
      return
    }

    files.push(relativePath)
  }

  visit(start, relativeDir)
  return files
}

export function collectManagedTemplateFiles(templateRoot: string): string[] {
  const tracked = new Set<string>()

  for (const file of VERBATIM_SYNC_FILES) {
    if (existsSync(join(templateRoot, file))) {
      tracked.add(file)
    }
  }

  for (const file of REFERENCE_BASELINE_FILES) {
    if (existsSync(join(templateRoot, file))) {
      tracked.add(file)
    }
  }

  for (const directory of RECURSIVE_SYNC_DIRECTORIES) {
    for (const file of collectFilesUnderDirectory(templateRoot, directory)) {
      tracked.add(file)
    }
  }

  tracked.add('.github/workflows/ci.yml')

  return [...tracked].sort()
}

export function normalizeManagedContent(relativePath: string, content: string): string {
  if (relativePath !== 'layers/narduk-nuxt-layer/package.json') {
    return content
  }

  try {
    const parsed = JSON.parse(content) as Record<string, any>
    if (parsed.repository) {
      parsed.repository = {
        ...parsed.repository,
        url: '__APP_ORIGIN__',
      }
    }

    return JSON.stringify(parsed, null, 2) + '\n'
  } catch {
    return content
  }
}
