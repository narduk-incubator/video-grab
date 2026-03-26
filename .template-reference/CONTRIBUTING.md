# Contributing

This file is the **derived-app baseline** for `CONTRIBUTING.md`. Downstream apps
can customize it for project-specific workflows while keeping this version as a
reference.

## Quick Start

```bash
pnpm install
doppler setup --project <app-name> --config dev
doppler run -- pnpm run dev
```

## Where To Work

- `apps/web/` is the main application.
- `layers/narduk-nuxt-layer/` is shared layer code. Only change it when the
  feature should apply across Narduk apps.
- `tools/` contains local and CI automation.

## Common Commands

| Command                  | What It Does                                                      |
| ------------------------ | ----------------------------------------------------------------- |
| `pnpm run dev`           | Start the app locally                                             |
| `pnpm run quality`       | Auto-fix lint/format, then run lint, typecheck, and format checks |
| `pnpm run ship`          | Local deploy flow                                                 |
| `pnpm run validate`      | Infrastructure validation                                         |
| `pnpm run sync-template` | Pull current template infra + layer into this app                 |

## Working Rules

- Keep app code in `apps/web/`.
- Prefer thin components and thick composables.
- Do not duplicate layer-provided components, composables, or middleware.
- Use Doppler instead of `.env` files.
- Keep lint and typecheck clean before shipping.

## Reference Docs

- Root `AGENTS.md`
- `apps/web/AGENTS.md`
- `tools/AGENTS.md`
- `.template-reference/build-visibility.md`
