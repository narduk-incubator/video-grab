import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createNotification,
  getUserNotifications,
  getUnreadCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
} from '../../server/utils/notifications'

// ─── Mocks ──────────────────────────────────────────────────

vi.stubGlobal('createError', (opts: { statusCode: number; message: string }) => {
  const err = new Error(opts.message) as Error & { statusCode: number }
  err.statusCode = opts.statusCode
  return err
})

// Mock crypto.randomUUID
vi.stubGlobal('crypto', {
  randomUUID: () => 'test-uuid-1234',
})

// Chainable query builder mock
function createChainMock(returnValue: unknown = []) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}
  chain.select = vi.fn(() => chain)
  chain.from = vi.fn(() => chain)
  chain.where = vi.fn(() => chain)
  chain.orderBy = vi.fn(() => chain)
  chain.limit = vi.fn(() => Promise.resolve(returnValue))
  chain.set = vi.fn(() => chain)
  chain.returning = vi.fn(() => Promise.resolve(returnValue))
  chain.values = vi.fn(() => Promise.resolve())
  chain.insert = vi.fn(() => chain)
  chain.update = vi.fn(() => chain)
  chain.delete = vi.fn(() => chain)
  return chain
}

let mockDb: ReturnType<typeof createChainMock>

vi.stubGlobal('useDatabase', () => mockDb)

// Mock drizzle-orm operators
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col, val) => ({ type: 'eq', value: val })),
  and: vi.fn((...conditions) => ({ type: 'and', conditions })),
  desc: vi.fn((col) => ({ type: 'desc', column: col })),
  count: vi.fn(() => 'count(*)'),
}))

vi.mock('../../server/database/schema', () => ({
  notifications: {
    id: 'id',
    userId: 'user_id',
    kind: 'kind',
    title: 'title',
    body: 'body',
    icon: 'icon',
    actionUrl: 'action_url',
    resourceType: 'resource_type',
    resourceId: 'resource_id',
    isRead: 'is_read',
    readAt: 'read_at',
    createdAt: 'created_at',
  },
}))

describe('notifications', () => {
  const event = { context: {} } as never

  beforeEach(() => {
    vi.clearAllMocks()
    mockDb = createChainMock()
  })

  describe('createNotification', () => {
    it('inserts a notification and returns the ID', async () => {
      const id = await createNotification(event, {
        userId: 'user-1',
        kind: 'system',
        title: 'Test',
        body: 'Hello world',
      })

      expect(id).toBe('test-uuid-1234')
      expect(mockDb.insert).toHaveBeenCalled()
      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-uuid-1234',
          userId: 'user-1',
          kind: 'system',
          title: 'Test',
          body: 'Hello world',
          isRead: false,
        }),
      )
    })

    it('passes optional fields when provided', async () => {
      await createNotification(event, {
        userId: 'user-1',
        kind: 'alert',
        title: 'Alert',
        body: 'Something happened',
        icon: 'i-lucide-alert-triangle',
        actionUrl: '/dashboard',
        resourceType: 'wager',
        resourceId: 'wager-123',
      })

      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          icon: 'i-lucide-alert-triangle',
          actionUrl: '/dashboard',
          resourceType: 'wager',
          resourceId: 'wager-123',
        }),
      )
    })
  })

  describe('getUserNotifications', () => {
    it('queries with user filter and default limit', async () => {
      const mockNotifications = [{ id: '1', title: 'Test' }]
      mockDb = createChainMock(mockNotifications)

      const result = await getUserNotifications(event, 'user-1')

      expect(result).toEqual(mockNotifications)
      expect(mockDb.select).toHaveBeenCalled()
      expect(mockDb.from).toHaveBeenCalled()
      expect(mockDb.where).toHaveBeenCalled()
      expect(mockDb.limit).toHaveBeenCalledWith(50)
    })

    it('respects custom limit capped at 100', async () => {
      mockDb = createChainMock([])

      await getUserNotifications(event, 'user-1', { limit: 200 })

      expect(mockDb.limit).toHaveBeenCalledWith(100)
    })
  })

  describe('getUnreadCount', () => {
    it('returns the count from the query', async () => {
      mockDb = createChainMock()
      // getUnreadCount does `const [row] = await db.select().from().where()` — where() must resolve to an array
      mockDb.where = vi.fn(() => Promise.resolve([{ value: 5 }]))

      const result = await getUnreadCount(event, 'user-1')

      expect(result).toBe(5)
    })

    it('returns 0 when no rows match', async () => {
      mockDb = createChainMock()
      mockDb.where = vi.fn(() => Promise.resolve([]))

      const result = await getUnreadCount(event, 'user-1')

      expect(result).toBe(0)
    })
  })

  describe('markNotificationAsRead', () => {
    it('updates the notification and returns successfully', async () => {
      mockDb = createChainMock([{ id: 'notif-1' }])

      await expect(markNotificationAsRead(event, 'notif-1', 'user-1')).resolves.toBeUndefined()

      expect(mockDb.update).toHaveBeenCalled()
      expect(mockDb.set).toHaveBeenCalledWith(expect.objectContaining({ isRead: true }))
    })

    it('throws 404 when notification not found or not owned', async () => {
      mockDb = createChainMock([]) // empty result

      await expect(markNotificationAsRead(event, 'notif-999', 'user-1')).rejects.toThrow(
        'Notification not found.',
      )
    })
  })

  describe('markAllNotificationsAsRead', () => {
    it('updates all unread notifications for the user', async () => {
      mockDb = createChainMock()

      await markAllNotificationsAsRead(event, 'user-1')

      expect(mockDb.update).toHaveBeenCalled()
      expect(mockDb.set).toHaveBeenCalledWith(expect.objectContaining({ isRead: true }))
      expect(mockDb.where).toHaveBeenCalled()
    })
  })

  describe('deleteNotification', () => {
    it('deletes the notification and returns successfully', async () => {
      mockDb = createChainMock([{ id: 'notif-1' }])

      await expect(deleteNotification(event, 'notif-1', 'user-1')).resolves.toBeUndefined()

      expect(mockDb.delete).toHaveBeenCalled()
    })

    it('throws 404 when notification not found or not owned', async () => {
      mockDb = createChainMock([])

      await expect(deleteNotification(event, 'notif-999', 'user-1')).rejects.toThrow(
        'Notification not found.',
      )
    })
  })
})
