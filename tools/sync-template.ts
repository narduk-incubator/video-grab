import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runCommand } from './command'
import { runAppSync } from './sync-core'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = join(__dirname, '..')

const rawArgs = process.argv.slice(2)
const positionalArgs: string[] = []
const flags = new Set<string>()
let fromValue: string | undefined

for (let index = 0; index < rawArgs.length; index += 1) {
  const argument = rawArgs[index]

  if (argument === '--from') {
    fromValue = rawArgs[index + 1]
    index += 1
    continue
  }

  if (argument.startsWith('--from=')) {
    fromValue = argument.slice('--from='.length)
    continue
  }

  if (argument.startsWith('--')) {
    flags.add(argument)
    continue
  }

  positionalArgs.push(argument)
}

function expandHome(value: string): string {
  return value.replace(/^~/, process.env.HOME || '')
}

function isAuthoringWorkspace(rootDir: string): boolean {
  try {
    const originUrl = runCommand('git', ['remote', 'get-url', 'origin'], {
      cwd: rootDir,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    if (originUrl.includes('narduk-enterprises/narduk-nuxt-template')) {
      return true
    }
  } catch {
    /* fall through */
  }

  try {
    const rootPackage = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf-8')) as {
      name?: string
    }
    if (rootPackage.name === 'narduk-nuxt-template') {
      return true
    }
  } catch {
    /* fall through */
  }

  return existsSync(join(rootDir, 'apps', 'showcase'))
}

function resolveTemplateDir(rootDir: string): string {
  if (fromValue) {
    return resolve(expandHome(fromValue))
  }

  if (isAuthoringWorkspace(rootDir)) {
    return rootDir
  }

  return join(process.env.HOME || '', 'new-code', 'narduk-nuxt-template')
}

const authoringWorkspace = isAuthoringWorkspace(ROOT_DIR)
const appDirArg = authoringWorkspace ? positionalArgs[0] : positionalArgs[0] || '.'

if (!appDirArg) {
  console.error(
    'Usage: pnpm exec tsx tools/sync-template.ts <app-directory> [--from /path/to/narduk-nuxt-template] [--dry-run] [--strict] [--skip-quality] [--allow-dirty-app] [--allow-dirty-template]',
  )
  process.exit(1)
}

const resolvedAppDir = resolve(expandHome(appDirArg))
const templateDir = resolve(resolveTemplateDir(ROOT_DIR))

if (!existsSync(resolvedAppDir)) {
  console.error(`App directory not found: ${resolvedAppDir}`)
  process.exit(1)
}

if (!existsSync(join(templateDir, 'layers', 'narduk-nuxt-layer'))) {
  console.error(`Template directory not found or incomplete: ${templateDir}`)
  console.error(
    'Pass --from /path/to/narduk-nuxt-template or clone the authoring workspace locally.',
  )
  process.exit(1)
}

if (!authoringWorkspace && resolvedAppDir === templateDir) {
  console.error('Template source resolves to the current app checkout.')
  console.error('Pass --from /path/to/narduk-nuxt-template to sync from the authoring workspace.')
  process.exit(1)
}

runAppSync({
  appDir: resolvedAppDir,
  templateDir,
  mode: 'full',
  dryRun: flags.has('--dry-run'),
  strict: flags.has('--strict'),
  skipQuality: flags.has('--skip-quality'),
  allowDirtyApp: flags.has('--allow-dirty-app'),
  allowDirtyTemplate: flags.has('--allow-dirty-template'),
}).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exit(1)
})
