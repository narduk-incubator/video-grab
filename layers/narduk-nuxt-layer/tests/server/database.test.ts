import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Unit tests for useDatabase (D1 + Postgres via Hyperdrive).
 */

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

const mockD1Drizzle = vi.fn(() => ({ __mock: true, __backend: 'd1' }))

const mockPgSelectExecute = vi.fn(async () => [{ id: 'u_1' }, { id: 'u_2' }])
const mockPgUpdateExecute = vi.fn(async () => ({ count: 1 }))
const mockPgDb = {
  __mock: true,
  __backend: 'postgres',
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        execute: mockPgSelectExecute,
      })),
    })),
  })),
  update: vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn(() => ({
        execute: mockPgUpdateExecute,
      })),
    })),
  })),
}

vi.mock('drizzle-orm/d1', () => ({
  drizzle: (...args: unknown[]) => mockD1Drizzle(...args),
}))

vi.mock('drizzle-orm/postgres-js', () => ({
  drizzle: vi.fn(() => mockPgDb),
}))

vi.mock('postgres', () => ({
  default: vi.fn(() => ({ __pgClient: true })),
}))

vi.mock('../../server/database/schema', () => ({}))
vi.mock('../../server/database/pg-schema', () => ({}))

const { useDatabase } = await import('../../server/utils/database')

describe('useDatabase — D1 backend (default)', () => {
  beforeEach(() => {
    mockUseRuntimeConfig.mockReturnValue({
      databaseBackend: 'd1',
      hyperdriveBinding: 'HYPERDRIVE',
    })
    mockD1Drizzle.mockClear()
    mockPgSelectExecute.mockClear()
    mockPgUpdateExecute.mockClear()
    mockPgDb.select.mockClear()
    mockPgDb.update.mockClear()
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
    expect(db).toEqual({ __mock: true, __backend: 'd1' })
  })

  it('memoizes the Drizzle instance on event.context._db', () => {
    const existingDb = { __cached: true }
    const event = {
      context: { _db: existingDb },
    }
    expect(useDatabase(event as never)).toBe(existingDb)
  })
})

describe('useDatabase — Postgres backend (Hyperdrive)', () => {
  beforeEach(() => {
    mockUseRuntimeConfig.mockReturnValue({
      databaseBackend: 'postgres',
      hyperdriveBinding: 'HYPERDRIVE',
    })
    mockD1Drizzle.mockClear()
    mockPgSelectExecute.mockClear()
    mockPgUpdateExecute.mockClear()
    mockPgDb.select.mockClear()
    mockPgDb.update.mockClear()
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
    expect(db.__backend).toBe('postgres')
  })

  it('adds D1-style get/all/run helpers to the Postgres query builders', async () => {
    const event = {
      context: {
        cloudflare: {
          env: { HYPERDRIVE: { connectionString: 'postgres://test:test@localhost/db' } },
        },
      },
    }
    const db = useDatabase(event as never)

    await expect(db.select().from('users').where('id').get()).resolves.toEqual({ id: 'u_1' })
    await expect(db.select().from('users').where('id').all()).resolves.toEqual([
      { id: 'u_1' },
      { id: 'u_2' },
    ])
    await expect(db.update('users').set({}).where('id').run()).resolves.toEqual({ count: 1 })

    expect(mockPgSelectExecute).toHaveBeenCalledTimes(2)
    expect(mockPgUpdateExecute).toHaveBeenCalledTimes(1)
  })

  it('memoizes the PG instance on event.context._db', () => {
    const existingDb = { __cached: true }
    const event = {
      context: { _db: existingDb },
    }
    expect(useDatabase(event as never)).toBe(existingDb)
  })
})
