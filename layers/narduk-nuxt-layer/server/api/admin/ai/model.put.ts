import { z } from 'zod'
import { kvSet } from '#layer/server/utils/kv'
import { defineAdminMutation, withValidatedBody } from '#layer/server/utils/mutation'
import { RATE_LIMIT_POLICIES } from '#layer/server/utils/rateLimit'

const schema = z.object({
  model: z.string().min(1),
})

export default defineAdminMutation(
  {
    rateLimit: RATE_LIMIT_POLICIES.adminAiModel,
    parseBody: withValidatedBody(schema.parse),
  },
  async ({ event, body }) => {
    // Store in cache with highly distant expiration (never expires basically)
    // KV Cache allows string values up to 4MB
    await kvSet(event, 'admin:chatModel', { value: body.model }, 365 * 24 * 60 * 60)

    return { success: true, model: body.model }
  },
)
