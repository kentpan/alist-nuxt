import { fail, ok, requireAdmin } from '../../../utils/auth'
export default defineEventHandler(async (event) => {
  const context = await requireAdmin(event)
  if ('error' in context) return fail(context.error, context.code)
  const id = Number(getQuery(event).id)
  if (!Number.isInteger(id) || id < 1) return fail('invalid user id', 400)
  const user = await context.db.first<any>('SELECT id, username, role, roles, permission, disabled, basePath, ssoId, createdAt, updatedAt, otpSecret FROM User WHERE id = ?', [id])
  if (!user) return fail('user not found', 404)
  return ok({ ...user, role: JSON.parse(user.roles || '[]'), base_path: user.basePath, sso_id: user.ssoId, otp: !!user.otpSecret, otpSecret: undefined, roles: undefined, basePath: undefined, ssoId: undefined })
})
