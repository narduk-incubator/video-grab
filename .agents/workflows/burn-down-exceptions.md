---
description:
  Review tracked guardrail exceptions and remove or renew them with an owner and
  expiry
---

# Burn Down Exceptions

Use the `exception-triage` skill. Use `fleet-guardrails` if the exception spans
multiple apps.

## 1. Review the manifest

Open `guardrail-exceptions.json` and sort entries by expiry.

## 2. Decide each entry

- Remove it if the code or shared rule is fixed.
- Renew it only if there is a real blocker and a named owner.
- Shorten the expiry whenever possible.

## 3. Validate

```bash
pnpm run guardrails:repo
```

Follow with a targeted repo audit if the exceptions were tied to a specific
fleet app.
