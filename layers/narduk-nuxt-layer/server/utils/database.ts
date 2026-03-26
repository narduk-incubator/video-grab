/// <reference types="@cloudflare/workers-types" />
import type { H3Event } from 'h3'
import { drizzle as drizzleD1, type DrizzleD1Database } from 'drizzle-orm/d1'
import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as d1Schema from '../database/schema'
import * as pgSchema from '../database/pg-schema'
import { useHyperdriveConnectionString } from './hyperdrive'
import { useLogger } from './logger'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Postgres uses a small runtime compatibility wrapper to preserve the existing D1-style query helpers.
export type LayerDatabase = DrizzleD1Database<typeof d1Schema> | any

const QUERY_COMPAT_METHODS = new Set(['all', 'get', 'run'])
const QUERY_PROMISE_METHODS = new Set(['then', 'catch', 'finally'])
const pgCompatCache = new WeakMap<object, object>()

function makeLogger(event: H3Event, label: string) {
  return import.meta.dev
    ? {
        logQuery(query: string, params: unknown) {
          useLogger(event).child(label).debug('sql', { query, params })
        },
      }
    : undefined
}

function executeCompatQuery(query: unknown) {
  if (query && typeof query === 'object' && 'execute' in query && typeof query.execute === 'function') {
    return query.execute()
  }

  return Promise.resolve(query)
}

function wrapPgCompat<T>(value: T): T {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) {
    return value
  }

  const cached = pgCompatCache.get(value as object)
  if (cached) {
    return cached as T
  }

  const proxy = new Proxy(value as object, {
    get(target, prop, receiver) {
      if (QUERY_COMPAT_METHODS.has(String(prop))) {
        if (prop === 'get') {
          return async () => {
            const rows = await executeCompatQuery(target)
            return Array.isArray(rows) ? (rows[0] ?? undefined) : rows
          }
        }

        return () => executeCompatQuery(target)
      }

      const raw = Reflect.get(target, prop, receiver)
      if (typeof raw !== 'function') {
        return raw
      }

      if (QUERY_PROMISE_METHODS.has(String(prop))) {
        return raw.bind(target)
      }

      return (...args: unknown[]) => wrapPgCompat(raw.apply(target, args))
    },
  })

  pgCompatCache.set(value as object, proxy)
  return proxy as T
}

/**
 * Return a Drizzle ORM instance for the current request.
 *
 * - `d1` (default): Cloudflare D1 via the `DB` binding.
 * - `postgres`: Hyperdrive connection string + `postgres.js` + Drizzle postgres-js.
 *
 * Memoized on `event.context._db`. Postgres builds must use `NUXT_DATABASE_BACKEND=postgres`
 * so `#layer/orm-tables` and this schema stay aligned.
 */
export function useDatabase(event: H3Event): LayerDatabase {
  if (event.context._db) {
    return event.context._db
  }

  const config = useRuntimeConfig(event)
  const backend = (config as Record<string, unknown>).databaseBackend || 'd1'

  if (backend === 'postgres') {
    const connectionString = useHyperdriveConnectionString(event)
    const client = postgres(connectionString, { prepare: false, max: 1 })
    const db = wrapPgCompat(
      drizzlePg(client, {
        schema: pgSchema,
        logger: makeLogger(event, 'PG'),
      }),
    )
    event.context._db = db
    return db
  }

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
 * Factory to create an app-level Drizzle accessor with typed schema (D1 only).
 *
 * @example
 * ```ts
 * import * as schema from '../database/schema'
 * export const useAppDatabase = createAppDatabase(schema)
 * ```
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
