# AGENTS.md - Workspace Root

Use this file as the entry point for agent work in this repository.

## Repository Identity

- This checkout is a downstream app created from `narduk-nuxt-template`.
- The main shipped application lives in `apps/web/`.
- The shared Nuxt layer lives in `layers/narduk-nuxt-layer/`.
- This repo does not ship the template authoring workspace's `apps/showcase/`.

## Where Changes Belong

| Change type                                     | Preferred location          |
| ----------------------------------------------- | --------------------------- |
| App-specific product work                       | `apps/web/`                 |
| Shared reusable Nuxt functionality for all apps | `layers/narduk-nuxt-layer/` |
| Shared ESLint rules and plugins                 | `packages/eslint-config/`   |
| Local Node.js automation and sync tooling       | `tools/`                    |
| Shell helper scripts                            | `scripts/`                  |

Do not recreate layer-provided composables, plugins, middleware, auth helpers,
rate limiting, OG image building blocks, or base schema files inside `apps/web`
without first checking the workspace guide.

## Load The Right Local Instructions

| Area                             | Read first                           |
| -------------------------------- | ------------------------------------ |
| Main app                         | `apps/web/AGENTS.md`                 |
| Shared Nuxt layer                | `layers/narduk-nuxt-layer/AGENTS.md` |
| ESLint plugins and shared config | `packages/eslint-config/AGENTS.md`   |
| Local automation tools           | `tools/AGENTS.md`                    |

## Non-Negotiable Rules

- Cloudflare Workers constraints apply to deployed server code: no Node.js
  built-ins, Web Crypto only, Drizzle ORM only, and no per-request shared
  mutable state.
- Use the layer before adding new app files. Check the layer inventory in
  `docs/agents/workspace.md`.
- All mutation routes must use the shared mutation wrappers in
  `server/utils/mutation.ts`.
- Validate mutation bodies with `withValidatedBody(...)` or
  `withOptionalValidatedBody(...)`. Do not read unvalidated bodies directly.
- In `server/`, use the `#server/` alias instead of long relative imports.
- Every page must call `useSeo(...)` and a Schema.org helper such as
  `useWebPageSchema(...)`.
- In page `script setup`, use composables plus `useAsyncData` or `useFetch`. Do
  not use raw `$fetch`.
- If the app extends the database schema, create and use `useAppDatabase(event)`
  in `apps/web/server/utils/database.ts`. Do not shadow the layer's
  `useDatabase`.
- Doppler is the source of truth for secrets. Do not add `.env` files.
- Zero warnings is policy. Do not hide problems with `eslint-disable`,
  `@ts-ignore`, or similar suppressions unless the exception is explicitly
  tracked and justified.

## Provisioned app build (GitHub Agentic Workflows)

- After the control plane creates the repo, run **Actions →
  `provisioned-app-build`** (or your org’s entry) when ready. Work should land
  on **`integrate/build`** and finish as **one PR** to `main`.
- Agent-facing secrets: GitHub environment **`copilot`**, populated from Doppler
  config **`copilot`** / **`prd_copilot`** via
  `pnpm run sync:copilot-secrets -- <slug>` (run from a checkout that includes
  `tools/sync-copilot-secrets.ts`).
- Canonical machine input: **`provision.json`**; product spec: **`SPEC.md`** →
  **`UI_PLAN.md`** → **`CONTRACT.md`** before implementation.

## Quality Commands

- Main app quality: `pnpm --filter web run quality`
- Verify local D1 setup: `pnpm --filter web run db:verify`
- Rebuild shared ESLint plugins after plugin changes: `pnpm run build:plugins`
- Sync the latest template infrastructure into this app:
  `pnpm run sync-template -- --from /path/to/narduk-nuxt-template`
- Sync the vendored layer into this app:
  `pnpm run update-layer -- --from /path/to/narduk-nuxt-template`
- Local deploy path: `pnpm run ship`

## Reference Handbook

Open only the docs relevant to the task:

- `docs/agents/README.md` - handbook index
- `docs/agents/workspace.md` - repo layout, layer inventory, update-layer flow,
  and build pipeline
- `docs/agents/engineering.md` - hard constraints, security, lint rules, SEO,
  design tokens, and architecture patterns
- `docs/agents/operations.md` - setup, provisioning, deploys, Doppler, and agent
  admin API access
- `docs/agents/recipes.md` - testing, auth, analytics, content, linting, UI, and
  form-handling recipes
- `docs/e2e-testing.md` - shared Playwright baseline and extension model
