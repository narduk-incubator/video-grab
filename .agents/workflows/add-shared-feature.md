---
description:
  Add a new feature that will be available to all template consumers — guides
  placement in the shared layer, quality checks, and fleet rollout
---

# Add a Shared Feature

This workflow covers the full lifecycle of adding a feature to the shared Nuxt
layer so every downstream app inherits it automatically.

> [!IMPORTANT] All layer code lives in `layers/narduk-nuxt-layer/`. Never add
> shared reusable functionality directly inside `apps/web/`.

---

## 0. Pre-flight — Scope the Feature

Before writing code, answer these questions (ask the user if unclear):

1. **Is this truly shared?** If the feature is specific to one app, it belongs
   in `apps/web/` (or that app's repo), not the layer. Only add to the layer if
   _every_ downstream app should inherit it.
2. **Does it already exist?** Check the layer inventory in
   `docs/agents/workspace.md` and the layer's `AGENTS.md` under "Files Provided
   by This Layer." Do not duplicate existing functionality.
3. **What category?** Determine the feature type and target directory:

| Feature type        | Layer directory                                    |
| ------------------- | -------------------------------------------------- |
| Vue component       | `layers/narduk-nuxt-layer/app/components/`         |
| Composable          | `layers/narduk-nuxt-layer/app/composables/`        |
| Client plugin       | `layers/narduk-nuxt-layer/app/plugins/`            |
| CSS tokens/utils    | `layers/narduk-nuxt-layer/app/assets/css/main.css` |
| Layout              | `layers/narduk-nuxt-layer/app/layouts/`            |
| Middleware (client) | `layers/narduk-nuxt-layer/app/middleware/`         |
| Type definitions    | `layers/narduk-nuxt-layer/app/types/`              |
| Server utility      | `layers/narduk-nuxt-layer/server/utils/`           |
| Server middleware   | `layers/narduk-nuxt-layer/server/middleware/`      |
| API route           | `layers/narduk-nuxt-layer/server/api/`             |
| DB schema           | `layers/narduk-nuxt-layer/server/database/`        |
| DB migration        | `layers/narduk-nuxt-layer/drizzle/`                |
| Nuxt module config  | `layers/narduk-nuxt-layer/nuxt.config.ts`          |
| Public assets       | `layers/narduk-nuxt-layer/public/`                 |

---

## 1. Read the Layer's AGENTS.md

// turbo

```bash
cat layers/narduk-nuxt-layer/AGENTS.md
```

Internalize the hard constraints (Cloudflare Workers, Nuxt UI 4 rules, SEO
requirements, architecture patterns) before writing any code.

---

## 2. Implement the Feature

Write the code in the appropriate layer directory from Step 0.

### Mandatory constraints

- **Cloudflare Workers safe** — no Node.js built-ins (`fs`, `path`, `crypto`,
  `bcrypt`, `child_process`). Use Web Crypto for hashing.
- **SSR safe** — use `useState()` or Pinia stores for shared state, never bare
  `ref()` at module scope. Wrap `window`/`document` in `onMounted` or
  `<ClientOnly>`.
- **Thin components, thick composables** — business logic belongs in
  composables, not in `<template>` or `<script setup>`.
- **Data fetching** — use `useAsyncData` / `useFetch`, never raw `$fetch` in
  `<script setup>`.
- **Server mutations** — use `defineUserMutation`, `defineAdminMutation`, etc.
  from `server/utils/mutation.ts`. Validate bodies with
  `withValidatedBody(schema.parse)`.
- **Server imports** — use the `#server/` alias instead of long relative
  imports.
- **Nuxt UI 4** — use `USeparator` not `UDivider`, `i-lucide-*` icons, semantic
  color tokens, Tailwind v4 `@theme` configuration.
- **SEO** — if adding a page, call `useSeo(...)` and a Schema.org helper.
- **Zero warnings** — no `eslint-disable`, `@ts-ignore`, or build suppressions.

### If adding new runtime config

Add keys to `layers/narduk-nuxt-layer/app/types/runtime-config.d.ts` and
document them. Downstream apps will set values via Doppler.

### If modifying nuxt.config.ts

Be aware that downstream apps inherit this config. Only add settings that every
consumer needs. Use `nuxt.config.ts` for modules, build options, and universal
defaults.

---

## 3. Update the Layer Documentation

If the feature adds new files, components, composables, utilities, server
routes, or config keys:

1. **Update `AGENTS.md`** — add to the "Files Provided by This Layer" or "Layer
   nuxt.config Defaults" sections in `layers/narduk-nuxt-layer/AGENTS.md`.
2. **Update `docs/agents/workspace.md`** — add to the "Layer Inventory" table if
   the feature introduces a new category or significantly extends an existing
   one.

---

## 4. Add Showcase Coverage (optional but recommended)

If the feature has visible UI or behavior, add a demo route or section in
`apps/showcase/` so it serves as living documentation:

```
apps/showcase/app/pages/demos/<feature-name>.vue
```

Keep showcase content generic — it is template documentation, not a production
app.

---

## 5. Run Quality Checks

// turbo

```bash
pnpm run quality
```

This runs lint + typecheck across the entire monorepo. Fix all errors and
warnings — zero warnings is policy.

---

## 6. Test in the Main App

// turbo

```bash
pnpm run dev
```

Verify the feature works correctly in `apps/web/` during local development.
Manually confirm:

- Feature renders correctly (if UI).
- No hydration mismatches.
- No console warnings or errors.
- Works in both light and dark modes (if UI).

---

## 7. Commit the Template Changes

// turbo

```bash
git add -A && git status
```

Review the staged changes, then commit:

```bash
git commit -m "feat(layer): <concise description of the shared feature>"
```

Use conventional commit format:

- `feat(layer):` for new capabilities
- `fix(layer):` for bug fixes
- `chore(layer):` for non-functional changes

// turbo

```bash
git push
```

---

## 8. Roll Out to Fleet Apps

Once the template is committed and pushed, sync the updated layer to downstream
apps. Use the `/sync-fleet` workflow:

- **Single app:** `pnpm run sync:fleet -- --repos=<app-name> --auto-commit`
- **All apps:** `pnpm run sync:fleet -- --auto-commit`

After sync, run quality checks in each updated app:

// turbo

```bash
pnpm run sync:fleet -- --auto-commit
```

> [!TIP] Use `--dry-run` first to preview what will change across the fleet
> before committing.

---

## 9. Deploy Updated Apps

For each updated fleet app, deploy via the `/deploy` workflow or:

// turbo

```bash
pnpm run ship
```

---

## Summary Checklist

- [ ] Feature scoped correctly (layer vs app)
- [ ] No duplication of existing layer functionality
- [ ] Cloudflare Workers compatible (no Node.js built-ins)
- [ ] SSR safe (no module-scope refs, no raw window access)
- [ ] Architecture patterns followed (thin components, thick composables)
- [ ] Layer `AGENTS.md` and `docs/agents/workspace.md` updated
- [ ] `pnpm run quality` passes with zero warnings
- [ ] Tested locally in `apps/web/`
- [ ] Committed with conventional commit message
- [ ] Fleet synced and deployed
