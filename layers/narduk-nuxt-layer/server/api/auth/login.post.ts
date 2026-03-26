import { z } from 'zod'
import { users } from '#layer/orm-tables'
import { eq } from 'drizzle-orm'
import { definePublicMutation, withValidatedBody } from '#layer/server/utils/mutation'
import { verifyUserPassword } from '../../utils/password'
import { RATE_LIMIT_POLICIES } from '../../utils/rateLimit'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export default definePublicMutation(
  {
    rateLimit: RATE_LIMIT_POLICIES.authLogin,
    parseBody: withValidatedBody(loginSchema.parse),
  },
  async ({ event, body }) => {
    const log = useLogger(event).child('Auth')
    const db = useDatabase(event)
    const normalizedEmail = body.email.toLowerCase()

    const user = await db.select().from(users).where(eq(users.email, normalizedEmail)).get()

    if (!user || !user.passwordHash) {
      log.warn('Login failed — invalid credentials', { email: normalizedEmail })
      throw createError({
        statusCode: 401,
        statusMessage: 'Invalid email or password',
      })
    }

    const isValid = await verifyUserPassword(body.password, user.passwordHash)
    if (!isValid) {
      log.warn('Login failed — invalid credentials', { email: normalizedEmail })
      throw createError({
        statusCode: 401,
        statusMessage: 'Invalid email or password',
      })
    }

    const { passwordHash: _passwordHash, ...rest } = user
    const cleanUser = {
      id: rest.id,
      email: rest.email,
      name: rest.name,
      isAdmin: rest.isAdmin,
    }

    await setUserSession(event, { user: cleanUser })
    log.info('Login successful', { email: normalizedEmail, userId: cleanUser.id })

    return { user: cleanUser }
  },
)
