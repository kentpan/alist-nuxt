import { fail, newPassword, ok, requireAdmin } from '../../../utils/auth'
export default defineEventHandler(async (event) => {
  const context = await requireAdmin(event)
  if ('error' in context) return fail(context.error, context.code)
  const body = await readBody<any>(event)
  const id = Number(body?.id)
  if (!Number.isInteger(id) || id < 1) return fail('invalid user id', 400)
  const old = await context.db.first<any>('SELECT * FROM User WHERE id = ?', [id])
  if (!old) return fail('user not found', 404)
  const username = String(body.username ?? old.username).trim()
  if (await context.db.first('SELECT id FROM User WHERE username = ? AND id <> ?', [username, id])) return fail('username already exists', 409)
  const roles = Array.isArray(body.role) ? body.role.map(Number) : (body.role === undefined ? JSON.parse(old.roles || '[]') : [Number(body.role)])
  const disabled = body.disabled === undefined ? old.disabled : (body.disabled ? 1 : 0)
  let pwd = { passwordHash: old.passwordHash, salt: old.salt, pwdTs: old.pwdTs }
  if (body.password) pwd = newPassword(String(body.password))
  const now = new Date().toISOString()
  await context.db.run('UPDATE User SET username = ?, passwordHash = ?, pwdTs = ?, salt = ?, roles = ?, permission = ?, disabled = ?, ssoId = ?, updatedAt = ? WHERE id = ?', [username, pwd.passwordHash, pwd.pwdTs, pwd.salt, JSON.stringify(roles), Number(body.permission ?? old.permission), disabled, String(body.sso_id ?? old.ssoId), now, id])
  return ok()
})
