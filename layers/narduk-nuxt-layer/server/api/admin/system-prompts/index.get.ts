import { requireAdmin } from '../../../utils/auth'
import { useDatabase } from '../../../utils/database'
import { systemPrompts } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const db = useDatabase(event)

  const existingRows = await db.select().from(systemPrompts).all()
  return existingRows
})
