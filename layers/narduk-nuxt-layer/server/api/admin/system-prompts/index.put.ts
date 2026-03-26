import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { useDatabase } from '#layer/server/utils/database'
import { systemPrompts } from '#layer/orm-tables'
import { defineAdminMutation, withValidatedBody } from '#layer/server/utils/mutation'
import { RATE_LIMIT_POLICIES } from '#layer/server/utils/rateLimit'

const schema = z.object({
  name: z.string().min(1),
  content: z.string().min(1),
})

export default defineAdminMutation(
  {
    rateLimit: RATE_LIMIT_POLICIES.adminSystemPrompts,
    parseBody: withValidatedBody(schema.parse),
  },
  async ({ event, body }) => {
    const db = useDatabase(event)

    await db
      .update(systemPrompts)
      .set({
        content: body.content,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(systemPrompts.name, body.name))
      .run()

    return { success: true }
  },
)
