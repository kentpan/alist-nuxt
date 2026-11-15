import { fail, ok, requireAdmin } from '../../../utils/auth'
export default defineEventHandler(async (event) => {
  const context = await requireAdmin(event)
  if ('error' in context) return fail(context.error, context.code)
  const body = await readBody<{ id?: number }>(event)
  const id = Number(body?.id)
  if (!id) return fail('invalid user id', 400)
  await context.db.run('UPDATE User SET otpSecret = ?, updatedAt = ? WHERE id = ?', ['', new Date().toISOString(), id])
  return ok()
})
