import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Unit tests for the useDatabase server utility.
 *
 * Tests the per-request Drizzle instantiation pattern for both backends:
 * - D1 (default): Throws when D1 binding is missing, creates instance when present
 * - Postgres: Throws when Hyperdrive binding is missing, creates instance when present
 * - Both: Memoizes on event.context._db
 */

// Mock Nitro auto-imports
vi.stubGlobal('createError', (opts: { statusCode: number; message: string }) => {
  const err = new Error(opts.message) as Error & { statusCode: number }
  err.statusCode = opts.statusCode
  return err
})

const mockUseRuntimeConfig = vi.fn(() => ({
  databaseBackend: 'd1',
  hyperdriveBinding: 'HYPERDRIVE',
}))
vi.stubGlobal('useRuntimeConfig', mockUseRuntimeConfig)

// Mock drizzle-orm/d1
vi.mock('drizzle-orm/d1', () => ({
  drizzle: vi.fn(() => ({ __mock: true, __backend: 'd1' })),
}))

// Mock drizzle-orm/neon-http
vi.mock('drizzle-orm/neon-http', () => ({
  drizzle: vi.fn(() => ({ __mock: true, __backend: 'postgres' })),
}))

// Mock @neondatabase/serverless
vi.mock('@neondatabase/serverless', () => ({
  neon: vi.fn(() => ({ __neonSql: true })),
}))

vi.mock('../../server/database/schema', () => ({}))

// Must import AFTER mocks are set up
const { useDatabase } = await import('../../server/utils/database')

describe('useDatabase — D1 backend (default)', () => {
  beforeEach(() => {
    mockUseRuntimeConfig.mockReturnValue({
      databaseBackend: 'd1',
      hyperdriveBinding: 'HYPERDRIVE',
    })
  })

  it('throws 500 when D1 binding is not available', () => {
    const event = {
      context: { cloudflare: { env: {} } },
    }
    expect(() => useDatabase(event as never)).toThrow('D1 database binding not available')
  })

  it('throws 500 when cloudflare context is missing', () => {
    const event = {
      context: {},
    }
    expect(() => useDatabase(event as never)).toThrow('D1 database binding not available')
  })

  it('returns a Drizzle instance when D1 binding exists', () => {
    const event = {
      context: {
        cloudflare: { env: { DB: { __d1: true } } },
      },
    }
    const db = useDatabase(event as never)
    expect(db).toBeDefined()
    expect(db).toEqual({ __mock: true, __backend: 'd1' })
  })

  it('memoizes the Drizzle instance on event.context._db', () => {
    const existingDb = { __cached: true }
    const event = {
      context: { _db: existingDb },
    }
    const db = useDatabase(event as never)
    expect(db).toBe(existingDb)
  })
})

describe('useDatabase — Postgres backend', () => {
  beforeEach(() => {
    mockUseRuntimeConfig.mockReturnValue({
      databaseBackend: 'postgres',
      hyperdriveBinding: 'HYPERDRIVE',
    })
  })

  it('throws 500 when Hyperdrive binding is not available', () => {
    const event = {
      context: { cloudflare: { env: {} } },
    }
    expect(() => useDatabase(event as never)).toThrow('Hyperdrive binding')
  })

  it('throws 500 when cloudflare context is missing', () => {
    const event = {
      context: {},
    }
    expect(() => useDatabase(event as never)).toThrow('Hyperdrive binding')
  })

  it('returns a Drizzle PG instance when Hyperdrive binding exists', () => {
    const event = {
      context: {
        cloudflare: {
          env: { HYPERDRIVE: { connectionString: 'postgres://test:test@localhost/db' } },
        },
      },
    }
    const db = useDatabase(event as never)
    expect(db).toBeDefined()
    expect(db).toEqual({ __mock: true, __backend: 'postgres' })
  })

  it('supports a custom Hyperdrive binding name', () => {
    mockUseRuntimeConfig.mockReturnValue({
      databaseBackend: 'postgres',
      hyperdriveBinding: 'CUSTOM_HD',
    })
    const event = {
      context: {
        cloudflare: {
          env: { CUSTOM_HD: { connectionString: 'postgres://test:test@localhost/db' } },
        },
      },
    }
    const db = useDatabase(event as never)
    expect(db).toBeDefined()
    expect(db).toEqual({ __mock: true, __backend: 'postgres' })
  })

  it('memoizes the PG instance on event.context._db', () => {
    const existingDb = { __cached: true }
    const event = {
      context: { _db: existingDb },
    }
    const db = useDatabase(event as never)
    expect(db).toBe(existingDb)
  })
})
