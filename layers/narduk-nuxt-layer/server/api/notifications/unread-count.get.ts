/**
 * GET /api/notifications/unread-count
 *
 * Lightweight endpoint that returns only the unread notification count.
 * Designed for polling from the frontend badge.
 */
export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const count = await getUnreadCount(event, user.id)

  return { count }
})
