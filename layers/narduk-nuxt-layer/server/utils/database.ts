/// <reference types="@cloudflare/workers-types" />
import type { H3Event } from 'h3'
import { drizzle as drizzleD1, type DrizzleD1Database } from 'drizzle-orm/d1'
import { drizzle as drizzleNeonHttp } from 'drizzle-orm/neon-http'
import { neon } from '@neondatabase/serverless'
import * as d1Schema from '../database/schema'
import { useLogger } from './logger'

// ─── Types ──────────────────────────────────────────────────

/**
 * A database instance returned by useDatabase(). The concrete type depends on
 * the `databaseBackend` runtime config (`d1` or `postgres`).
 *
 * Drizzle's query API surface is identical across dialects for the operations
 * the layer uses (select, insert, update, delete, where, join, etc.), so
 * callers don't need to care which backend is active.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- The PG drizzle instance type is structurally different from D1; a union with `any` keeps callers backend-agnostic.
export type LayerDatabase = DrizzleD1Database<typeof d1Schema> | any

// ─── Helpers ────────────────────────────────────────────────

function makeLogger(event: H3Event, label: string) {
  return import.meta.dev
    ? {
        logQuery(query: string, params: unknown) {
          useLogger(event).child(label).debug('sql', { query, params })
        },
      }
    : undefined
}

/**
 * Resolve the Hyperdrive connection string from the Cloudflare env.
 * The binding name is configurable via `runtimeConfig.hyperdriveBinding`
 * (default: `HYPERDRIVE`).
 */
function getHyperdriveConnectionString(event: H3Event): string {
  const config = useRuntimeConfig(event)
  const bindingName = (config as Record<string, unknown>).hyperdriveBinding || 'HYPERDRIVE'
  const env = event.context.cloudflare?.env as
    | Record<string, { connectionString?: string }>
    | undefined
  const hd = env?.[bindingName as string]
  if (!hd?.connectionString) {
    throw createError({
      statusCode: 500,
      message: `Hyperdrive binding "${bindingName}" not available. Ensure it is configured in wrangler.json and NUXT_DATABASE_BACKEND=postgres is set.`,
    })
  }
  return hd.connectionString
}

// ─── Public API ─────────────────────────────────────────────

/**
 * Return a Drizzle ORM instance for the current request.
 *
 * The backend is selected by `runtimeConfig.databaseBackend`:
 * - `'d1'` (default) — Cloudflare D1 via the `DB` binding
 * - `'postgres'` — Neon PostgreSQL via a Hyperdrive binding
 *
 * Memoized on `event.context` to avoid redundant instantiation within a single
 * request lifecycle. This avoids module-scope singletons which risk stale
 * bindings across isolate reuse on Cloudflare Workers.
 */
export function useDatabase(event: H3Event): LayerDatabase {
  if (event.context._db) {
    return event.context._db
  }

  const config = useRuntimeConfig(event)
  const backend = (config as Record<string, unknown>).databaseBackend || 'd1'

  if (backend === 'postgres') {
    const connectionString = getHyperdriveConnectionString(event)
    const sql = neon(connectionString)
    const db = drizzleNeonHttp(sql, {
      logger: makeLogger(event, 'PG'),
    })
    event.context._db = db
    return db
  }

  // Default: D1
  const d1 = (event.context.cloudflare?.env as { DB?: D1Database })?.DB
  if (!d1) {
    throw createError({
      statusCode: 500,
      message: 'D1 database binding not available. Ensure DB is configured in wrangler.json.',
    })
  }

  const db = drizzleD1(d1, {
    schema: d1Schema,
    logger: makeLogger(event, 'D1'),
  })
  event.context._db = db
  return db
}

/**
 * Factory to create an app-level Drizzle accessor with typed schema.
 *
 * The layer's `useDatabase()` only knows about the base layer tables.
 * Apps that add their own tables need a typed wrapper. Instead of each app
 * copy-pasting identical boilerplate, use this factory:
 *
 * @example
 * ```ts
 * // apps/web/server/utils/database.ts
 * import * as schema from '../database/schema'
 * export const useAppDatabase = createAppDatabase(schema)
 * ```
 *
 * The returned function is memoized on `event.context._appDb` (separate from
 * the layer's `_db` key) so multiple calls within a single request are free.
 */
export function createAppDatabase<T extends Record<string, unknown>>(appSchema: T) {
  return (event: H3Event): DrizzleD1Database<T> => {
    if (event.context._appDb) {
      return event.context._appDb as DrizzleD1Database<T>
    }

    const d1 = (event.context.cloudflare?.env as { DB?: D1Database })?.DB
    if (!d1) {
      throw createError({
        statusCode: 500,
        message: 'D1 database binding not available. Ensure DB is configured in wrangler.json.',
      })
    }

    const db = drizzleD1(d1, {
      schema: appSchema,
      logger: makeLogger(event, 'D1'),
    })
    event.context._appDb = db
    return db
  }
}
