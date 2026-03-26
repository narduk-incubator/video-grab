import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createAppDatabase } from '../../server/utils/database'

/**
 * Unit tests for the createAppDatabase factory.
 *
 * Tests:
 * - Returns a function that creates Drizzle instances
 * - Throws when D1 binding is missing
 * - Memoizes on event.context._appDb (separate from _db)
 * - Uses the provided schema
 */

// Mock Nitro auto-imports
vi.stubGlobal('createError', (opts: { statusCode: number; message: string }) => {
  const err = new Error(opts.message) as Error & { statusCode: number }
  err.statusCode = opts.statusCode
  return err
})

// Mock drizzle-orm — capture calls to verify schema is passed
const mockDrizzle = vi.fn(() => ({ __mock: true, __factory: true }))
vi.mock('drizzle-orm/d1', () => ({
  drizzle: (...args: unknown[]) => mockDrizzle(...args),
}))

vi.mock('../../server/database/schema', () => ({}))

describe('createAppDatabase', () => {
  beforeEach(() => {
    mockDrizzle.mockClear()
  })

  it('returns a function', () => {
    const useAppDb = createAppDatabase({ posts: {} })
    expect(typeof useAppDb).toBe('function')
  })

  it('throws 500 when D1 binding is not available', () => {
    const useAppDb = createAppDatabase({ posts: {} })
    const event = { context: { cloudflare: { env: {} } } }
    expect(() => useAppDb(event as never)).toThrow('D1 database binding not available')
  })

  it('throws 500 when cloudflare context is missing', () => {
    const useAppDb = createAppDatabase({ posts: {} })
    const event = { context: {} }
    expect(() => useAppDb(event as never)).toThrow('D1 database binding not available')
  })

  it('returns a Drizzle instance when D1 binding exists', () => {
    const schema = { posts: { id: 'text' } }
    const useAppDb = createAppDatabase(schema)
    const event = {
      context: { cloudflare: { env: { DB: { __d1: true } } } },
    }
    const db = useAppDb(event as never)
    expect(db).toBeDefined()
    expect(db).toEqual({ __mock: true, __factory: true })
    // Verify schema was passed to drizzle
    expect(mockDrizzle).toHaveBeenCalledWith({ __d1: true }, { schema })
  })

  it('memoizes on event.context._appDb', () => {
    const schema = { posts: {} }
    const useAppDb = createAppDatabase(schema)
    const existingDb = { __cached: true }
    const event = { context: { _appDb: existingDb } }
    const db = useAppDb(event as never)
    expect(db).toBe(existingDb)
    expect(mockDrizzle).not.toHaveBeenCalled()
  })

  it('uses _appDb key, not _db (no collision with useDatabase)', () => {
    const schema = { posts: {} }
    const useAppDb = createAppDatabase(schema)
    const event = {
      context: {
        _db: { __layerDb: true },
        cloudflare: { env: { DB: { __d1: true } } },
      },
    }
    const db = useAppDb(event as never)
    // Should create a new instance, not return _db
    expect(db).toEqual({ __mock: true, __factory: true })
    // Should store on _appDb
    expect(event.context).toHaveProperty('_appDb')
  })
})
