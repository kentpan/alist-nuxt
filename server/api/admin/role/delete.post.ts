import { fail, ok, requireAdmin } from '../../../utils/auth'
export default defineEventHandler(async (event) => {
  const context = await requireAdmin(event)
  if ('error' in context) return fail(context.error, context.code)
  const body = await readBody<{ id?: number }>(event)
  const id = Number(body?.id)
  const role = await context.db.first<{ name: string }>('SELECT name FROM Role WHERE id = ?', [id])
  if (!role) return fail('role not found', 404)
  if (['admin', 'guest'].includes(role.name)) return fail('built-in roles cannot be deleted', 403)
  const assigned = await context.db.all<{ id: number }>("SELECT id FROM User WHERE roles LIKE ?", [`%${id}%`])
  for (const user of assigned) {
    const row = await context.db.first<{ roles: string }>('SELECT roles FROM User WHERE id = ?', [user.id])
    const roles = JSON.parse(row?.roles || '[]') as number[]
    if (roles.includes(id)) return fail('role is assigned to users', 409)
  }
  await context.db.run('DELETE FROM Role WHERE id = ?', [id])
  return ok()
})
