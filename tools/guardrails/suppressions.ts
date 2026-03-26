import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { GuardrailException, GuardrailFinding, SuppressionSite } from './types'
import {
  COMMENT_FILE_PATTERN,
  DATE_PATTERN,
  compareIsoDates,
  formatSite,
  getIsoDaySpan,
  getSiteKey,
  normalizePath,
} from './utils'

const SUPPRESSION_COMMENT_PATTERN = /(?:\/\/|\/\*|<!--)\s*eslint-disable(?:-(?:next-line|line))?\b/
const TS_DIRECTIVE_COMMENT_PATTERN = /(?:\/\/|\/\*)\s*@ts-(?:ignore|expect-error|nocheck)\b/
const MAX_TS_NOCHECK_EXCEPTION_WINDOW_DAYS = 30

export function loadGuardrailExceptions(root: string): {
  entries: GuardrailException[]
  findings: GuardrailFinding[]
} {
  const manifestPath = join(root, 'guardrail-exceptions.json')
  if (!existsSync(manifestPath)) {
    return {
      entries: [],
      findings: [
        {
          ruleId: 'guardrail-exceptions-manifest',
          severity: 'fail',
          message: 'guardrail-exceptions.json is missing.',
          detail: ['Add the manifest, even if it only contains an empty array.'],
        },
      ],
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(manifestPath, 'utf-8'))
  } catch (error: any) {
    return {
      entries: [],
      findings: [
        {
          ruleId: 'guardrail-exceptions-manifest',
          severity: 'fail',
          message: 'guardrail-exceptions.json is not valid JSON.',
          detail: [String(error?.message || error)],
        },
      ],
    }
  }

  if (!Array.isArray(parsed)) {
    return {
      entries: [],
      findings: [
        {
          ruleId: 'guardrail-exceptions-manifest',
          severity: 'fail',
          message: 'guardrail-exceptions.json must be an array.',
        },
      ],
    }
  }

  const entries: GuardrailException[] = []
  const invalidDetails: string[] = []
  const today = new Date().toISOString().slice(0, 10)

  for (const [index, rawEntry] of parsed.entries()) {
    const prefix = `entry ${index}`
    if (!rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) {
      invalidDetails.push(`${prefix}: must be an object`)
      continue
    }

    const entry = rawEntry as Record<string, unknown>
    const file = typeof entry.file === 'string' ? normalizePath(entry.file.trim()) : ''
    const line = typeof entry.line === 'number' ? entry.line : Number.NaN
    const kind = entry.kind
    const rule =
      typeof entry.rule === 'string'
        ? entry.rule.trim()
        : entry.rule === null || entry.rule === undefined
          ? null
          : ''
    const reason = typeof entry.reason === 'string' ? entry.reason.trim() : ''
    const owner = typeof entry.owner === 'string' ? entry.owner.trim() : ''
    const createdAt = typeof entry.createdAt === 'string' ? entry.createdAt.trim() : ''
    const expiresAt = typeof entry.expiresAt === 'string' ? entry.expiresAt.trim() : ''

    if (!file) invalidDetails.push(`${prefix}: file is required`)
    if (!Number.isInteger(line) || line < 1) invalidDetails.push(`${prefix}: line must be >= 1`)
    if (
      kind !== 'eslint-disable' &&
      kind !== 'ts-ignore' &&
      kind !== 'ts-expect-error' &&
      kind !== 'ts-nocheck'
    ) {
      invalidDetails.push(
        `${prefix}: kind must be eslint-disable, ts-ignore, ts-expect-error, or ts-nocheck`,
      )
    }
    if (kind === 'eslint-disable' && rule !== null && !String(rule).trim()) {
      invalidDetails.push(`${prefix}: eslint-disable entries need a rule or "*"`)
    }
    if (!reason) invalidDetails.push(`${prefix}: reason is required`)
    if (!owner) invalidDetails.push(`${prefix}: owner is required`)
    if (!DATE_PATTERN.test(createdAt))
      invalidDetails.push(`${prefix}: createdAt must be YYYY-MM-DD`)
    if (!DATE_PATTERN.test(expiresAt))
      invalidDetails.push(`${prefix}: expiresAt must be YYYY-MM-DD`)
    if (DATE_PATTERN.test(expiresAt) && compareIsoDates(expiresAt, today) < 0) {
      invalidDetails.push(`${prefix}: expired on ${expiresAt}`)
    }
    if (
      kind === 'ts-nocheck' &&
      DATE_PATTERN.test(createdAt) &&
      DATE_PATTERN.test(expiresAt) &&
      (getIsoDaySpan(createdAt, expiresAt) ?? 0) > MAX_TS_NOCHECK_EXCEPTION_WINDOW_DAYS
    ) {
      invalidDetails.push(
        `${prefix}: ts-nocheck expiresAt must be within ${MAX_TS_NOCHECK_EXCEPTION_WINDOW_DAYS} days of createdAt`,
      )
    }

    entries.push({
      file,
      line: Number.isInteger(line) ? line : 0,
      kind: kind as GuardrailException['kind'],
      rule,
      reason,
      owner,
      createdAt,
      expiresAt,
    })
  }

  return {
    entries,
    findings:
      invalidDetails.length === 0
        ? []
        : [
            {
              ruleId: 'guardrail-exceptions-manifest',
              severity: 'fail',
              message: `${invalidDetails.length} invalid guardrail exception entr${invalidDetails.length === 1 ? 'y' : 'ies'}.`,
              detail: invalidDetails.map((detail) => `  ${detail}`),
            },
          ],
  }
}

export function scanSuppressionSites(
  root: string,
  repoFiles: string[],
): {
  sites: SuppressionSite[]
  findings: GuardrailFinding[]
} {
  const sites: SuppressionSite[] = []
  const missingReasonDetails: string[] = []

  for (const file of repoFiles) {
    if (!COMMENT_FILE_PATTERN.test(file)) continue

    const absolutePath = join(root, file)
    if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) continue

    const content = readFileSync(absolutePath, 'utf-8')
    const lines = content.split('\n')

    for (const [index, line] of lines.entries()) {
      const lineNumber = index + 1
      const hasSuppressionComment = SUPPRESSION_COMMENT_PATTERN.test(line)
      const hasTsDirectiveComment = TS_DIRECTIVE_COMMENT_PATTERN.test(line)

      if (
        /(?:\/\/|\/\*|<!--)\s*eslint-disable-(?:next-line|line)\b/.test(line) &&
        !/--\s*\S/.test(line)
      ) {
        missingReasonDetails.push(
          `${file}:${lineNumber} eslint-disable-next-line is missing an inline reason`,
        )
      }

      if (
        hasSuppressionComment &&
        !line.includes('eslint-disable-next-line') &&
        !line.includes('eslint-disable-line')
      ) {
        if (!/--\s*\S/.test(line)) {
          missingReasonDetails.push(
            `${file}:${lineNumber} eslint-disable is missing an inline reason`,
          )
        }

        const match = line.match(/(?:\/\/|\/\*|<!--)\s*eslint-disable\b(.*?)(?:--|\*\/|-->|$)/)
        const rawRule = match?.[1]?.trim() || '*'
        const normalizedRule = rawRule.replace(/^[,*\s]+|[,*\s]+$/g, '').trim() || '*'
        sites.push({
          file,
          line: lineNumber,
          kind: 'eslint-disable',
          rule: normalizedRule,
        })
      }

      if (hasTsDirectiveComment && !/[:\-–—]\s*\S/.test(line)) {
        missingReasonDetails.push(
          `${file}:${lineNumber} TypeScript suppression is missing an inline reason`,
        )
      }

      if (hasTsDirectiveComment && line.includes('@ts-nocheck')) {
        sites.push({ file, line: lineNumber, kind: 'ts-nocheck', rule: null })
      }

      if (hasTsDirectiveComment && line.includes('@ts-ignore')) {
        sites.push({ file, line: lineNumber, kind: 'ts-ignore', rule: null })
      }

      if (hasTsDirectiveComment && line.includes('@ts-expect-error')) {
        sites.push({ file, line: lineNumber, kind: 'ts-expect-error', rule: null })
      }
    }
  }

  return {
    sites,
    findings:
      missingReasonDetails.length === 0
        ? []
        : [
            {
              ruleId: 'suppression-inline-reason',
              severity: 'fail',
              message: `${missingReasonDetails.length} suppression comment(s) are missing an inline reason.`,
              detail: missingReasonDetails.map((detail) => `  ${detail}`),
            },
          ],
  }
}

export function checkSuppressionExceptions(root: string, repoFiles: string[]): GuardrailFinding[] {
  const findings: GuardrailFinding[] = []
  const manifest = loadGuardrailExceptions(root)
  findings.push(...manifest.findings)

  const suppressionScan = scanSuppressionSites(root, repoFiles)
  findings.push(...suppressionScan.findings)

  if (manifest.findings.length > 0) {
    return findings
  }

  const siteMap = new Map(suppressionScan.sites.map((site) => [getSiteKey(site), site]))
  const requiresTrackedException = (site: Pick<SuppressionSite, 'file' | 'kind'>) => {
    if (site.kind === 'ts-ignore' || site.kind === 'ts-nocheck') return true
    if (site.kind !== 'eslint-disable') return false

    return (
      site.file.startsWith('tools/') ||
      site.file.startsWith('packages/') ||
      site.file.includes('/server/')
    )
  }
  const missingDetails: string[] = []
  const staleDetails: string[] = []

  for (const site of suppressionScan.sites) {
    if (!requiresTrackedException(site)) continue

    const hasEntry = manifest.entries.some(
      (entry) =>
        entry.file === site.file &&
        entry.line === site.line &&
        entry.kind === site.kind &&
        (entry.rule ?? null) === site.rule,
    )
    if (!hasEntry) {
      missingDetails.push(`  Missing exception entry for ${formatSite(site)}`)
    }
  }

  for (const entry of manifest.entries) {
    if (!requiresTrackedException(entry)) continue

    const key = getSiteKey({
      file: entry.file,
      line: entry.line,
      kind: entry.kind,
      rule: entry.rule ?? null,
    })
    if (!siteMap.has(key)) {
      staleDetails.push(`  Stale exception entry for ${entry.file}:${entry.line} ${entry.kind}`)
    }
  }

  if (missingDetails.length > 0) {
    findings.push({
      ruleId: 'guardrail-exceptions',
      severity: 'fail',
      message: `${missingDetails.length} suppression site(s) are missing guardrail exception entries.`,
      detail: missingDetails,
    })
  }

  if (staleDetails.length > 0) {
    findings.push({
      ruleId: 'guardrail-exceptions',
      severity: 'fail',
      message: `${staleDetails.length} stale guardrail exception entr${staleDetails.length === 1 ? 'y' : 'ies'} found.`,
      detail: staleDetails,
    })
  }

  return findings
}

export function checkTsNoCheckDebt(root: string, repoFiles: string[]): GuardrailFinding[] {
  const suppressionScan = scanSuppressionSites(root, repoFiles)
  const tsNoCheckSites = suppressionScan.sites
    .filter((site) => site.kind === 'ts-nocheck')
    .sort((left, right) => left.file.localeCompare(right.file) || left.line - right.line)

  if (tsNoCheckSites.length === 0) return []

  return [
    {
      ruleId: 'ts-nocheck-debt',
      severity: 'warn',
      message: `${tsNoCheckSites.length} @ts-nocheck site(s) remain in the repo.`,
      detail: tsNoCheckSites.map((site) => `  ${formatSite(site)}`),
    },
  ]
}
