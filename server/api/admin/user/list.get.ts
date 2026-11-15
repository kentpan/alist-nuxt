import { fail, ok, requireAdmin } from '../../../utils/auth'
export default defineEventHandler(async (event) => {
  const context = await requireAdmin(event)
  if ('error' in context) return fail(context.error, context.code)
  const query = getQuery(event)
  const page = Math.max(1, Number(query.page ?? 1) || 1)
  const pageSize = Math.min(200, Math.max(1, Number(query.page_size ?? 20) || 20))
  const search = String(query.search ?? '').trim()
  const where = search ? 'WHERE username LIKE ?' : ''
  const params = search ? [`%${search}%`] : []
  const count = await context.db.first<{ total: number }>(`SELECT COUNT(*) AS total FROM User ${where}`, params)
  const users = await context.db.all<any>(`SELECT id, username, role, roles, permission, disabled, basePath, ssoId, createdAt, updatedAt, otpSecret FROM User ${where} ORDER BY id ASC LIMIT ? OFFSET ?`, [...params, pageSize, (page - 1) * pageSize])
  return ok({ content: users.map(user => ({ ...user, role: JSON.parse(user.roles || '[]'), base_path: user.basePath, sso_id: user.ssoId, otp: !!user.otpSecret, otpSecret: undefined, roles: undefined, basePath: undefined, ssoId: undefined })), total: count?.total ?? 0 })
})
