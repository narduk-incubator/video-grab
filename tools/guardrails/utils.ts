import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { SuppressionSite } from './types'

export const COMMENT_FILE_PATTERN = /\.(?:ts|mts|cts|tsx|js|mjs|cjs|jsx|vue)$/
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
export const IGNORED_DIRS = new Set([
  '.git',
  '.nuxt',
  '.output',
  '.nitro',
  '.wrangler',
  '.data',
  '.turbo',
  'dist',
  'node_modules',
  '__pycache__',
])

export function normalizePath(value: string): string {
  return value.replace(/\\/g, '/')
}

export function formatSite(site: SuppressionSite): string {
  const suffix = site.rule ? ` (${site.rule})` : ''
  return `${site.file}:${site.line} ${site.kind}${suffix}`
}

export function getSiteKey(site: Pick<SuppressionSite, 'file' | 'line' | 'kind' | 'rule'>): string {
  return `${site.file}:${site.line}:${site.kind}:${site.rule ?? ''}`
}

export function compareIsoDates(left: string, right: string): number {
  return left.localeCompare(right)
}

export function isoDateToUtcDay(value: string): number | null {
  if (!DATE_PATTERN.test(value)) return null

  const [year, month, day] = value.split('-').map((segment) => Number(segment))
  if (!year || !month || !day) return null

  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000)
}

export function getIsoDaySpan(start: string, end: string): number | null {
  const startDay = isoDateToUtcDay(start)
  const endDay = isoDateToUtcDay(end)
  if (startDay === null || endDay === null) return null
  return endDay - startDay
}

export function isGitRepo(root: string): boolean {
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return true
  } catch {
    return false
  }
}

export function listRepoFiles(root: string): string[] {
  if (isGitRepo(root)) {
    try {
      const output = execFileSync(
        'git',
        ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
        {
          cwd: root,
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'ignore'],
        },
      )
      return output
        .split('\0')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map(normalizePath)
        .filter((file) => existsSync(join(root, file)))
        .sort()
    } catch {
      // Fall through to filesystem walk.
    }
  }

  const files: string[] = []
  const visit = (currentDir: string) => {
    for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
      if (entry.name === '.DS_Store') continue

      const fullPath = join(currentDir, entry.name)
      const relativePath = normalizePath(fullPath.slice(root.length + 1))

      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue
        visit(fullPath)
        continue
      }

      files.push(relativePath)
    }
  }

  visit(root)
  return files.sort()
}
