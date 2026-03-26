#!/usr/bin/env -S pnpm exec tsx

import { join, resolve } from 'node:path'
import { auditRepoGuardrails, formatGuardrailReport, writeGuardrailArtifact } from './guardrails'

interface CliOptions {
  root: string
  json: boolean
  writeArtifact: boolean
  artifactDir?: string
}

function parseArgs(): CliOptions {
  const options: CliOptions = {
    root: process.cwd(),
    json: false,
    writeArtifact: false,
  }

  for (const arg of process.argv.slice(2)) {
    if (arg === '--json') {
      options.json = true
      continue
    }

    if (arg === '--write-artifact') {
      options.writeArtifact = true
      continue
    }

    if (arg.startsWith('--root=')) {
      options.root = resolve(arg.slice('--root='.length))
      continue
    }

    if (arg.startsWith('--artifact-dir=')) {
      options.artifactDir = resolve(arg.slice('--artifact-dir='.length))
    }
  }

  return options
}

function main() {
  const options = parseArgs()
  const report = auditRepoGuardrails(options.root)

  if (options.writeArtifact) {
    const outputDir = options.artifactDir || join(options.root, 'artifacts', 'guardrails')
    const { latestPath, timestampPath } = writeGuardrailArtifact(report, outputDir)
    report.findings.unshift({
      ruleId: 'guardrail-artifact',
      severity: 'warn',
      message: 'Wrote guardrail audit artifacts.',
      detail: [`  ${timestampPath}`, `  ${latestPath}`],
    })
    report.summary.warn += 1
  }

  if (options.json) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    console.log(formatGuardrailReport(report))
  }

  process.exit(report.ok ? 0 : 1)
}

main()
