import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { useDatabase } from '#layer/server/utils/database'
import { users } from '#layer/server/database/schema'
import { defineAdminMutation, withValidatedBody } from '#layer/server/utils/mutation'
import { RATE_LIMIT_POLICIES } from '#layer/server/utils/rateLimit'

const schema = z.object({
  userId: z.string().min(1),
  isAdmin: z.boolean(),
})

export default defineAdminMutation(
  {
    rateLimit: RATE_LIMIT_POLICIES.adminUsers,
    parseBody: withValidatedBody(schema.parse),
  },
  async ({ event, admin, body }) => {
    // Prevent admin from removing their own admin privileges by accident
    if (body.userId === admin.id && !body.isAdmin) {
      throw createError({ statusCode: 403, message: 'Cannot demote yourself.' })
    }

    const db = useDatabase(event)

    await db
      .update(users)
      .set({
        isAdmin: body.isAdmin,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, body.userId))
      .run()

    return { success: true }
  },
)
