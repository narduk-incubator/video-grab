---
description:
  Repair fleet apps that drifted on guardrails, workflows, or shared-package
  rollout
---

# Repair Fleet Guardrails

Use the `fleet-guardrails` skill. Use `shared-package-release` if the fix needs
an upstream package change.

## 1. Audit first

```bash
pnpm run audit:fleet-guardrails
```

Group the output by repo and by fix type.

## 2. Fix the source of truth

- Prefer template, layer, workflow, or shared-package changes over one-off app
  edits.
- Fix multiple repos by changing the shared source once, then syncing.

## 3. Sync and repair fleets

```bash
pnpm run sync:fleet
```

Only commit repos that were clean before the repair pass started.

## 4. Re-check

```bash
pnpm run audit:fleet-guardrails
```
