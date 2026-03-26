import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getSessionUser, requireAuth, requireAdmin } from '../../server/utils/auth'

// Mock Nitro auto-imports
vi.stubGlobal('createError', (opts: { statusCode: number; message: string }) => {
  const err = new Error(opts.message) as Error & { statusCode: number }
  err.statusCode = opts.statusCode
  return err
})

vi.stubGlobal('useRuntimeConfig', () => ({
  sessionCookieName: 'test_session',
}))

// requireAuth checks nuxt-auth-utils session first; stub to return no session
vi.stubGlobal('getUserSession', vi.fn().mockResolvedValue(null))

// Mock useDatabase
const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
  delete: vi.fn(),
}

vi.stubGlobal('useDatabase', () => mockDb)

// Mock h3 functions
vi.mock('h3', () => ({
  getCookie: vi.fn(),
  setCookie: vi.fn(),
  deleteCookie: vi.fn(),
  getRequestHeader: vi.fn(() => 'localhost:3000'),
}))

// Mock drizzle-orm
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col, val) => ({ column: 'eq', value: val })),
  and: vi.fn((...conditions) => ({ type: 'and', conditions })),
  gt: vi.fn((_col, val) => ({ column: 'gt', value: val })),
}))

vi.mock('#layer/orm-tables', () => ({
  users: {
    id: 'id',
    email: 'email',
    name: 'name',
    passwordHash: 'password_hash',
    appleId: 'apple_id',
    isAdmin: 'is_admin',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  sessions: { id: 'id', userId: 'user_id', expiresAt: 'expires_at', createdAt: 'created_at' },
}))

describe('auth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getSessionUser', () => {
    it('returns null when no session cookie is present', async () => {
      const { getCookie } = await import('h3')
      vi.mocked(getCookie).mockReturnValue()

      const event = { context: {} } as never
      const result = await getSessionUser(event)
      expect(result).toBeNull()
    })
  })

  describe('requireAuth', () => {
    it('throws 401 when no session exists', async () => {
      const { getCookie } = await import('h3')
      vi.mocked(getCookie).mockReturnValue()

      const event = { context: {} } as never
      await expect(requireAuth(event)).rejects.toThrow('Unauthorized')
    })
  })

  describe('requireAdmin', () => {
    it('throws 401 when no session exists (via requireAuth)', async () => {
      const { getCookie } = await import('h3')
      vi.mocked(getCookie).mockReturnValue()

      const event = { context: {} } as never
      await expect(requireAdmin(event)).rejects.toThrow('Unauthorized')
    })
  })
})
