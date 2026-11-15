import { fail, ok, requireAdmin } from '../../../utils/auth'
export default defineEventHandler(async (event) => {
  const context = await requireAdmin(event)
  if ('error' in context) return fail(context.error, context.code)
  const q = getQuery(event)
  const page = Math.max(1, Number(q.page ?? 1) || 1)
  const size = Math.min(200, Math.max(1, Number(q.page_size ?? 20) || 20))
  const count = await context.db.first<{ total: number }>('SELECT COUNT(*) AS total FROM Role')
  const rows = await context.db.all<any>('SELECT * FROM Role ORDER BY id ASC LIMIT ? OFFSET ?', [size, (page - 1) * size])
  return ok({ content: rows.map(role => ({ ...role, default: !!role.default, permission_scopes: JSON.parse(role.permissionScopes || '[]'), permissionScopes: undefined })), total: count?.total ?? 0 })
})
