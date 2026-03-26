import { desc, sql } from 'drizzle-orm'
import { z } from 'zod'
import { requireAdmin } from '../../../utils/auth'
import { useDatabase } from '../../../utils/database'
import { users } from '#layer/orm-tables'

const querySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
})

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const query = await getValidatedQuery(event, (data) => querySchema.safeParse(data))
  if (!query.success) {
    throw createError({ statusCode: 400, message: 'Invalid pagination parameters.' })
  }

  const { page, limit } = query.data
  const offset = (page - 1) * limit

  const db = useDatabase(event)

  const [totalResult, userRows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .get(),
    db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        isAdmin: users.isAdmin,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset)
      .all(),
  ])

  return {
    users: userRows,
    total: totalResult?.count || 0,
  }
})
