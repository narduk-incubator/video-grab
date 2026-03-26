import { generateApiKey } from '#layer/server/utils/auth'
import { apiKeys } from '#layer/orm-tables'
import { defineUserMutation, withValidatedBody } from '#layer/server/utils/mutation'
import { RATE_LIMIT_POLICIES } from '#layer/server/utils/rateLimit'
import { z } from 'zod'

const bodySchema = z.object({
  name: z.string().min(1).max(100),
})

/**
 * POST /api/auth/api-keys
 * Create a new API key. Returns the raw key ONCE — caller must save it.
 */
export default defineUserMutation(
  {
    rateLimit: RATE_LIMIT_POLICIES.authApiKeys,
    parseBody: withValidatedBody(bodySchema.parse),
  },
  async ({ event, user, body }) => {
    const log = useLogger(event).child('Auth')
    const db = useDatabase(event)
    const { rawKey, keyHash, keyPrefix } = await generateApiKey()
    const id = crypto.randomUUID()

    await db.insert(apiKeys).values({
      id,
      userId: user.id,
      name: body.name,
      keyHash,
      keyPrefix,
    })

    log.info('API key created', { keyPrefix, userId: user.id })

    return {
      id,
      name: body.name,
      keyPrefix,
      rawKey, // Only time the raw key is ever returned
      createdAt: new Date().toISOString(),
    }
  },
)
