/**
 * PATCH /api/notifications/:id
 *
 * Mark a single notification as read. Owner-only.
 */
import { defineUserMutation } from '#layer/server/utils/mutation'
import { RATE_LIMIT_POLICIES } from '#layer/server/utils/rateLimit'

export default defineUserMutation(
  {
    rateLimit: RATE_LIMIT_POLICIES.notifications,
  },
  async ({ event, user }) => {
    const notificationId = getRouterParam(event, 'id')

    if (!notificationId) {
      throw createError({ statusCode: 400, message: 'Notification ID is required.' })
    }

    await markNotificationAsRead(event, notificationId, user.id)

    return { ok: true }
  },
)
