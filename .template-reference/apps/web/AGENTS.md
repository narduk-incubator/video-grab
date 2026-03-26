# AGENTS.md — apps/web

This is the **main application**. It extends
`@narduk-enterprises/narduk-nuxt-template-layer` (the shared Nuxt Layer) and is
deployed as a Cloudflare Worker.

## Key Rules

- **Do not duplicate layer-provided files.** Check the "Layer Inventory" section
  in the root [AGENTS.md](../../../AGENTS.md) before creating new composables,
  plugins, middleware, or server utils.
- All Cloudflare Workers hard constraints apply here (no Node.js modules, Web
  Crypto only, Drizzle ORM only).
- Every page must call `useSeo()` and a `useSchemaOrg()` helper.
- Use `useAsyncData`/`useFetch` for data fetching, never raw `$fetch` in
  `<script setup>`.

## Structure

```
app/           # Frontend: pages, components, layouts, composables
server/        # Edge API routes and database handling
nuxt.config.ts # Extends the layer — keep this slim
wrangler.json  # Cloudflare Workers deployment config
drizzle/       # App-specific SQL migrations
```

For recipes (auth, analytics, content, testing, forms), see the root
[AGENTS.md](../../../AGENTS.md).
