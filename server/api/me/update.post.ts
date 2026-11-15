import { fail, newPassword, ok, requireAuth } from '../../utils/auth'
export default defineEventHandler(async (event) => {
  const context = await requireAuth(event)
  if ('error' in context) return fail(context.error, context.code)
  if (context.isGuest) return fail('Guest user can not update profile', 403)
  const body = await readBody<{ username?: string; password?: string; sso_id?: string }>(event)
  const username = String(body?.username ?? context.user.username).trim()
  if (!username) return fail('username is required', 400)
  const duplicate = await context.db.first<{ id: number }>('SELECT id FROM User WHERE username = ? AND id <> ?', [username, context.user.id])
  if (duplicate) return fail('username already exists', 409)
  if (body.password) {
    const pwd = newPassword(body.password)
    await context.db.run('UPDATE User SET username = ?, passwordHash = ?, pwdTs = ?, salt = ?, ssoId = ?, updatedAt = ? WHERE id = ?', [username, pwd.passwordHash, pwd.pwdTs, pwd.salt, String(body.sso_id ?? ''), new Date().toISOString(), context.user.id])
  } else {
    await context.db.run('UPDATE User SET username = ?, ssoId = ?, updatedAt = ? WHERE id = ?', [username, String(body.sso_id ?? context.user.ssoId), new Date().toISOString(), context.user.id])
  }
  return ok()
})
