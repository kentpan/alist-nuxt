import { ok } from '../../utils/auth'
import { useDatabase } from '../../utils/database'
export default defineEventHandler(async (event) => {
  const db = await useDatabase(event)
  const rows = await db.all<{ key: string; value: string }>('SELECT key, value FROM Setting WHERE flag IN (0, 2) ORDER BY "index" ASC')
  return ok(Object.fromEntries(rows.map(row => [row.key, row.value])))
})
