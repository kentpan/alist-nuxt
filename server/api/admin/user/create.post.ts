import { fail, newPassword, ok, requireAdmin } from '../../../utils/auth'
export default defineEventHandler(async (event) => {
  const context = await requireAdmin(event)
  if ('error' in context) return fail(context.error, context.code)
  const body = await readBody<any>(event)
  const username = String(body?.username ?? '').trim()
  const password = String(body?.password ?? '')
  const roles = Array.isArray(body?.role) ? body.role.map(Number) : [Number(body?.role ?? 3)]
  if (!username || !password || !roles.length || roles.some((id: number) => !Number.isInteger(id) || id < 1)) return fail('username, password, and valid role IDs are required', 400)
  if (await context.db.first('SELECT id FROM User WHERE username = ?', [username])) return fail('username already exists', 409)
  const pwd = newPassword(password)
  const now = new Date().toISOString()
  const result = await context.db.run('INSERT INTO User (username, passwordHash, role, pwdTs, salt, basePath, roles, permission, otpSecret, ssoId, authn, disabled, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, char(47), ?, ?, char(), ?, json_array(), ?, ?, ?)', [username, pwd.passwordHash, 'user', pwd.pwdTs, pwd.salt, JSON.stringify(roles), Number(body.permission ?? 0), String(body.sso_id ?? ''), body.disabled ? 1 : 0, now, now])
  return ok({ id: Number(result.lastInsertRowid ?? 0) })
})
