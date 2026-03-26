import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { GuardrailReport } from './types'
import { listRepoFiles } from './utils'
import { checkGitignore } from './gitignore'
import { checkForbiddenRepoFiles, checkJunkRepoFiles } from './forbidden-files'
import { checkHooksPath } from './hooks'
import { checkSuppressionExceptions, checkTsNoCheckDebt } from './suppressions'

export type {
  GuardrailSeverity,
  GuardrailFinding,
  GuardrailException,
  GuardrailReport,
  SuppressionSite,
} from './types'

export function auditRepoGuardrails(rootDir: string): GuardrailReport {
  const root = resolve(rootDir)
  const repoFiles = listRepoFiles(root)
  const findings = [
    ...checkGitignore(root),
    ...checkForbiddenRepoFiles(repoFiles),
    ...checkJunkRepoFiles(repoFiles),
    ...checkHooksPath(root),
    ...checkSuppressionExceptions(root, repoFiles),
    ...checkTsNoCheckDebt(root, repoFiles),
  ]

  const summary = findings.reduce(
    (acc, finding) => {
      acc[finding.severity] += 1
      return acc
    },
    { fail: 0, warn: 0 },
  )

  return {
    root,
    checkedAt: new Date().toISOString(),
    ok: summary.fail === 0,
    findings,
    summary,
  }
}

export function formatGuardrailReport(report: GuardrailReport): string {
  const lines = [
    `Guardrail audit — ${report.root}`,
    `Status: ${report.ok ? 'PASS' : 'FAIL'} (${report.summary.fail} fail, ${report.summary.warn} warn)`,
  ]

  if (report.findings.length === 0) {
    lines.push('No guardrail findings.')
    return lines.join('\n')
  }

  for (const finding of report.findings) {
    lines.push(``)
    lines.push(`[${finding.severity.toUpperCase()}] ${finding.ruleId} — ${finding.message}`)
    for (const detail of finding.detail || []) {
      lines.push(detail)
    }
  }

  return lines.join('\n')
}

export function writeGuardrailArtifact(
  report: GuardrailReport,
  outputDir = join(report.root, 'artifacts', 'guardrails'),
): { latestPath: string; timestampPath: string } {
  mkdirSync(outputDir, { recursive: true })
  const timestamp = report.checkedAt.replaceAll(':', '-')
  const timestampPath = join(outputDir, `${timestamp}.json`)
  const latestPath = join(outputDir, 'latest.json')
  const payload = JSON.stringify(report, null, 2) + '\n'

  writeFileSync(timestampPath, payload, 'utf-8')
  writeFileSync(latestPath, payload, 'utf-8')

  return { latestPath, timestampPath }
}
