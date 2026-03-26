---
description:
  Sweep server code for worker-runtime hazards like process.env, Node imports,
  and unsafe server boundaries
---

# Worker Runtime Hygiene

Use the `mutation-hardening` skill for server-route changes and
`fleet-guardrails` when the same issue appears across apps.

## 1. Search for runtime hazards

```bash
rg -n "process\\.env|from 'node:|from \"node:|readBody\\(|defineEventHandler" \
  layers/narduk-nuxt-layer/server apps/web/server -g '*.ts'
```

## 2. Fix the pattern

- Replace `process.env` with request-scoped runtime config or bindings.
- Remove Node-only imports from worker code.
- Use shared server helpers for repeated access patterns.

## 3. Re-run checks

```bash
pnpm run guardrails:repo
pnpm run quality:check
```
