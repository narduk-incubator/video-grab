# AGENTS.md — packages/eslint-config

This workspace package contains **custom ESLint plugins** that enforce
project-specific patterns at lint time.

## Key Rules

- After modifying any plugin source code, **always rebuild**:
  `pnpm run build:plugins`
- The ATX plugin (`eslint-plugin-atx`) is plain `.mjs` and does NOT need
  building.
- These plugins run in Node.js (not on Cloudflare Workers) — Node.js APIs are
  allowed here.
- See [docs/agents/engineering.md](../../docs/agents/engineering.md) for the
  shared guardrail inventory and repo-wide lint expectations.

## Plugins

| Plugin                                      | Language          | Build Required                 |
| ------------------------------------------- | ----------------- | ------------------------------ |
| `eslint-plugin-nuxt-ui`                     | TypeScript        | Yes (`pnpm run build:plugins`) |
| `eslint-plugin-nuxt-guardrails`             | TypeScript        | Yes                            |
| `eslint-plugin-atx`                         | JavaScript (.mjs) | No                             |
| `eslint-plugin-vue-official-best-practices` | TypeScript        | Yes                            |
