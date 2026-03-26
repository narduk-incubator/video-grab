import { apiKeys } from '#layer/orm-tables'
import { defineUserMutation } from '#layer/server/utils/mutation'
import { RATE_LIMIT_POLICIES } from '#layer/server/utils/rateLimit'
import { eq, and } from 'drizzle-orm'

/**
 * DELETE /api/auth/api-keys/:id
 * Revoke (delete) an API key. Users can only delete their own keys.
 */
export default defineUserMutation(
  {
    rateLimit: RATE_LIMIT_POLICIES.authApiKeys,
  },
  async ({ event, user }) => {
    const log = useLogger(event).child('Auth')
    const id = getRouterParam(event, 'id')

    if (!id) {
      throw createError({ statusCode: 400, message: 'Missing key ID' })
    }

    const db = useDatabase(event)

    const deleted = await db
      .delete(apiKeys)
      .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, user.id)))
      .returning({ id: apiKeys.id })

    if (deleted.length === 0) {
      log.warn('API key not found for deletion', { keyId: id, userId: user.id })
      throw createError({ statusCode: 404, message: 'API key not found' })
    }

    log.info('API key revoked', { keyId: id, userId: user.id })
    return { success: true }
  },
)
