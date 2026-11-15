import { fail, ok, requireAdmin } from '../../../utils/auth'
export default defineEventHandler(async (event) => {
  const context = await requireAdmin(event)
  if ('error' in context) return fail(context.error, context.code)
  const id = Number(getQuery(event).id)
  const role = await context.db.first<any>('SELECT * FROM Role WHERE id = ?', [id])
  if (!role) return fail('role not found', 404)
  return ok({ ...role, default: !!role.default, permission_scopes: JSON.parse(role.permissionScopes || '[]'), permissionScopes: undefined })
})
