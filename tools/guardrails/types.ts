export type GuardrailSeverity = 'warn' | 'fail'

export interface GuardrailFinding {
  ruleId: string
  severity: GuardrailSeverity
  message: string
  detail?: string[]
}

export interface GuardrailException {
  file: string
  line: number
  kind: 'eslint-disable' | 'ts-ignore' | 'ts-expect-error' | 'ts-nocheck'
  rule?: string | null
  reason: string
  owner: string
  createdAt: string
  expiresAt: string
}

export interface GuardrailReport {
  root: string
  checkedAt: string
  ok: boolean
  findings: GuardrailFinding[]
  summary: {
    fail: number
    warn: number
  }
}

export interface SuppressionSite {
  file: string
  line: number
  kind: GuardrailException['kind']
  rule: string | null
}
