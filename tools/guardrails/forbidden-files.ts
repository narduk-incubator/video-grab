import type { GuardrailFinding } from './types'

const FORBIDDEN_REPO_FILE_PATTERNS = [
  { label: 'environment file', pattern: /(^|\/)\\.env(?:\.[^/]+)?$/ },
  { label: 'Workers env file', pattern: /(^|\/)\\.dev\\.vars$/ },
  { label: 'Doppler local config', pattern: /(^|\/)doppler\\.yaml$/ },
  { label: 'Doppler export', pattern: /(^|\/)doppler\\.json$/ },
] as const

const JUNK_REPO_FILE_PATTERNS = [
  {
    label: 'local sqlite database',
    pattern: /(^|\/)(?:local|dev|test|tmp|wrangler)\.sqlite(?:3)?$/i,
  },
  { label: 'sqlite sidecar file', pattern: /(^|\/).+\.sqlite(?:-wal|-shm)$/i },
  { label: 'Playwright report output', pattern: /(^|\/)playwright-report(\/|$)/ },
  { label: 'test result output', pattern: /(^|\/)test-results(\/|$)/ },
  { label: 'typecheck error log', pattern: /(^|\/)typecheck_errors\.log$/ },
  { label: 'Wrangler state directory', pattern: /(^|\/)\.wrangler\/state(\/|$)/ },
] as const

export function checkForbiddenRepoFiles(repoFiles: string[]): GuardrailFinding[] {
  const matches = repoFiles
    .filter((file) => {
      const basename = file.split('/').pop() || file
      const isExampleConfig =
        /^\.env\.(?:example|sample|template)$/i.test(basename) ||
        /^doppler\.(?:example|sample|template)\.ya?ml$/i.test(basename) ||
        /^doppler\.(?:example|sample|template)\.json$/i.test(basename)

      if (isExampleConfig) return false
      return FORBIDDEN_REPO_FILE_PATTERNS.some(({ pattern }) => pattern.test(file))
    })
    .sort()
  if (matches.length === 0) return []

  return [
    {
      ruleId: 'forbidden-secret-files',
      severity: 'fail',
      message: `${matches.length} tracked or unignored local secret/config file(s) found.`,
      detail: matches.map((file) => `  ${file}`),
    },
  ]
}

export function checkJunkRepoFiles(repoFiles: string[]): GuardrailFinding[] {
  const details = repoFiles
    .map((file) => {
      const match = JUNK_REPO_FILE_PATTERNS.find(({ pattern }) => pattern.test(file))
      if (!match) return null
      return `  ${file} (${match.label})`
    })
    .filter((detail): detail is string => Boolean(detail))
    .sort()

  if (details.length === 0) return []

  return [
    {
      ruleId: 'forbidden-junk-files',
      severity: 'fail',
      message: `${details.length} tracked or unignored local artifact file(s) found.`,
      detail: details,
    },
  ]
}
