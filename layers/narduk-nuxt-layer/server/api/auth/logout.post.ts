import { definePublicMutation } from '#layer/server/utils/mutation'
import { RATE_LIMIT_POLICIES } from '#layer/server/utils/rateLimit'

export default definePublicMutation(
  {
    rateLimit: RATE_LIMIT_POLICIES.authLogout,
  },
  async ({ event }) => {
    const log = useLogger(event).child('Auth')
    await clearUserSession(event)
    log.info('Session cleared')
    return { success: true }
  },
)
