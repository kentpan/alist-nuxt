import { fail, newPassword, ok } from '../../utils/auth'
import { useDatabase } from '../../utils/database'

export default defineEventHandler(async (event) => {
  const db = await useDatabase(event)
  const allowRegister = await db.first<{ value: string }>('SELECT value FROM Setting WHERE key = ?', ['allow_register'])
  if (allowRegister?.value !== 'true') return fail('registration is disabled', 403)
  const body = await readBody<{ username?: string; password?: string }>(event)
  const username = String(body?.username ?? '').trim()
  const password = String(body?.password ?? '')
  if (!username || !password) return fail('username and password are required', 400)
  if (username.length > 64) return fail('username must be at most 64 characters', 400)
  const existing = await db.first('SELECT id FROM User WHERE username = ?', [username])
  if (existing) return fail('username already exists', 409)
  const defaultRole = await db.first<{ value: string }>('SELECT value FROM Setting WHERE key = ?', ['default_role'])
  const roleId = Number(defaultRole?.value || 3)
  const pwd = newPassword(password)
  const now = new Date().toISOString()
  await db.run('INSERT INTO User (username, passwordHash, role, pwdTs, salt, basePath, roles, permission, otpSecret, ssoId, authn, disabled, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, char(47), ?, 0, char(), char(), json_array(), 0, ?, ?)', [username, pwd.passwordHash, 'user', pwd.pwdTs, pwd.salt, JSON.stringify([roleId]), now, now])
  return ok()
})
