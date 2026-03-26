# Narduk Nuxt Layer

> **⚠️ ARCHITECTURE NOTICE:** This is a **Nuxt Layer**. You do not build
> applications directly inside this directory. Instead, downstream applications
> (like `apps/web/`, `apps/showcase/`, or a derived app in its own repo) use
> `extends: ['@narduk-enterprises/narduk-nuxt-template-layer']` to inherit these
> shared resources.

This is the centralized source of truth for **Nuxt 4**, the aesthetics of **Nuxt
UI 4 (Tailwind CSS 4)**, and our global integrations for **Cloudflare Workers**
and **D1 SQLite databases**.

## What This Layer Provides

| Category                | Files                                                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Composables**         | `useSeo`, `useSchemaOrg`, `usePersistentTab`                                                                           |
| **Components**          | `AppTabs` (Nuxt UI tabs wrapper), OG image components                                                                  |
| **Plugins**             | `gtag.client.ts`, `posthog.client.ts`, `fetch.client.ts` (CSRF header injection)                                       |
| **Server Middleware**   | `cors.ts`, `csrf.ts`, `d1.ts` (database binding), `indexnow.ts`, `securityHeaders.ts`                                  |
| **Server Utils**        | `database.ts`, `rateLimit.ts`, `auth.ts` (includes `requireAdmin`), `kv.ts`, `r2.ts`, `google.ts`                      |
| **Server API Routes**   | `/api/health`, `/api/indexnow/submit`, `/api/admin/indexing/*`, `/api/admin/ga/overview`, `/api/admin/gsc/performance` |
| **Database Schema**     | Base schema in `server/database/schema.ts`                                                                             |
| **CSS / Design Tokens** | `main.css` with `@theme` tokens, utility classes (`.glass`, `.card-base`, etc.)                                        |
| **Types**               | Shared TypeScript interfaces in `app/types/`                                                                           |

### Documentation

Please refer to the [Workspace Root README](../../README.md) and
[Global Agent Instructions](../../AGENTS.md) for full architectural constraints,
database setup instructions, and Cloudflare Worker requirements.

### Tabs

Use `AppTabs` whenever an app needs remembered or shareable tab state. The
wrapper stays close to `UTabs`, forwards Nuxt UI props and slots, and adds only
three opt-in concerns:

- `persist-key` to remember the last tab on the current route
- `query-key` to deep-link a tab in the URL
- `storage="session"` or `storage="local"` to choose client persistence

### Auth Session Cookies

The layer configures `runtimeConfig.session` for `nuxt-auth-utils`. Production
defaults keep the sealed session cookie `Secure`, while the layer's
`$development` override disables `Secure` for local HTTP dev so Safari can stay
logged in on `http://localhost` and `http://127.0.0.1`. Downstream apps should
inherit this behavior instead of adding app-level local cookie overrides.
