import { fail, ok, requireAdmin } from '../../../utils/auth'
export default defineEventHandler(async (event) => {
  const context = await requireAdmin(event)
  if ('error' in context) return fail(context.error, context.code)
  const body = await readBody<{ id?: number }>(event)
  const id = Number(body?.id)
  const user = await context.db.first<{ roles: string }>('SELECT roles FROM User WHERE id = ?', [id])
  if (!user) return fail('user not found', 404)
  const roles = JSON.parse(user.roles || '[]') as number[]
  if (roles.includes(1) || roles.includes(2) || id === context.user.id) return fail('cannot delete built-in or current administrator account', 403)
  await context.db.run('DELETE FROM User WHERE id = ?', [id])
  return ok()
})
