import { execFileSync } from 'node:child_process'
import type { GuardrailFinding } from './types'
import { isGitRepo } from './utils'

export function checkHooksPath(root: string): GuardrailFinding[] {
  if (!isGitRepo(root)) {
    return [
      {
        ruleId: 'git-hooks-path',
        severity: 'warn',
        message: 'Not a git worktree; skipping hooksPath check.',
      },
    ]
  }

  let hooksPath = ''
  try {
    hooksPath = execFileSync('git', ['config', '--get', 'core.hooksPath'], {
      cwd: root,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    hooksPath = ''
  }

  const normalized = hooksPath.replace(/\/+$/, '').replace(/^\.\//, '')
  if (normalized === '.githooks') return []

  return [
    {
      ruleId: 'git-hooks-path',
      severity: 'fail',
      message: 'git core.hooksPath is not set to .githooks.',
      detail: ['  Run: git config core.hooksPath .githooks'],
    },
  ]
}
