import { fail, ok, requireAdmin } from '../../../utils/auth'
export default defineEventHandler(async (event) => {
  const context = await requireAdmin(event)
  if ('error' in context) return fail(context.error, context.code)
  const body = await readBody<any>(event)
  const id = Number(body?.id ?? getQuery(event).id)
  if (!Number.isInteger(id) || id < 1) return fail('valid id is required', 400)
  const result = await context.db.run('DELETE FROM Storage WHERE id = ?', [id])
  if (!result.changes) return fail('storage not found', 404)
  return ok()
})
