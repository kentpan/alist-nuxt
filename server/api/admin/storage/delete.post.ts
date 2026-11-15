import { fail, ok, requireAdmin } from '../../../utils/auth'
import { useDatabase } from '../../../utils/database'

export default defineEventHandler(async (event) => {
  const context = await requireAdmin(event)
  if ('error' in context) return fail(context.error, context.code)
  const body = await readBody<{ id?: number }>(event)
  const id = Number(body?.id)
  if (!Number.isInteger(id) || id <= 0) return fail('A valid storage id is required', 400)
  const result = await context.db.run('DELETE FROM Storage WHERE id = ?', [id])
  if (result.changes === 0) return fail('Storage not found', 404)
  return ok()
})
