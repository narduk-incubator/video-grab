import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { GuardrailFinding } from './types'

const REQUIRED_GITIGNORE_ENTRIES = ['.env', '.env.*', '.dev.vars', 'doppler.yaml', 'doppler.json']

export function checkGitignore(root: string): GuardrailFinding[] {
  const gitignorePath = join(root, '.gitignore')
  if (!existsSync(gitignorePath)) {
    return [
      {
        ruleId: 'gitignore-secrets',
        severity: 'fail',
        message: '.gitignore is missing.',
      },
    ]
  }

  const content = readFileSync(gitignorePath, 'utf-8')
  const missing = REQUIRED_GITIGNORE_ENTRIES.filter((entry) => !content.includes(entry))
  if (missing.length === 0) return []

  return [
    {
      ruleId: 'gitignore-secrets',
      severity: 'fail',
      message: `${missing.length} required secret-ignore pattern(s) are missing from .gitignore.`,
      detail: missing.map((entry) => `  ${entry}`),
    },
  ]
}
