---
description:
  Release shared guardrail packages, tag them, and roll them through the
  template and fleet
---

# Release Shared Guardrails

Use the `shared-package-release` skill. If the release adds or removes an
exception rule, also use `exception-triage`.

## 1. Make the shared-package change

Typical target:

```bash
packages/eslint-config
```

Run the package's build or tests before versioning it.

## 2. Version, commit, tag, push

- Bump the package version.
- Commit the package change.
- Create the release tag.
- Push the package repo changes so the template can consume the new version.

## 3. Roll through the template

- Update the template dependency to the new version.
- Re-run `pnpm run quality:check`.
- Sync the fleet only after the template is clean.

## 4. Verify downstream

```bash
pnpm run audit:fleet-guardrails
```
