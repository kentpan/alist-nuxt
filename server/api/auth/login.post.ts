import { ensureSession, fail, ok, passwordMatches, signToken } from '../../utils/auth'
import { useDatabase } from '../../utils/database'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ username?: string; password?: string; otp_code?: string }>(event)
  const username = String(body?.username ?? '').trim()
  const password = String(body?.password ?? '')
  if (!username || !password) return fail('username and password are required', 400)
  const db = await useDatabase(event)
  const ip = getRequestIP(event, { xForwardedFor: true }) || 'unknown'
  const now = Math.floor(Date.now() / 1000)
  const attempt = await db.first<{ count: number; expiresAt: number }>('SELECT count, expiresAt FROM LoginAttempt WHERE ip = ?', [ip])
  if (attempt && attempt.expiresAt > now && attempt.count >= 5) return fail('Too many unsuccessful sign-in attempts have been made using an incorrect username or password, Try again later.', 429)

  const user = await db.first<any>('SELECT * FROM User WHERE username = ?', [username])
  const hashedMode = event.path.endsWith('/hash')
  if (!user || user.disabled || !passwordMatches(user, password, hashedMode)) {
    const count = attempt && attempt.expiresAt > now ? attempt.count + 1 : 1
    await db.run('INSERT OR REPLACE INTO LoginAttempt (ip, count, expiresAt) VALUES (?, ?, ?)', [ip, count, now + 300])
    return fail('username or password is incorrect', 400)
  }
  if (user.otpSecret) {
    const { verifyTotp } = await import('../../utils/auth')
    if (!(await verifyTotp(String(body.otp_code ?? ''), user.otpSecret))) {
      const count = attempt && attempt.expiresAt > now ? attempt.count + 1 : 1
      await db.run('INSERT OR REPLACE INTO LoginAttempt (ip, count, expiresAt) VALUES (?, ?, ?)', [ip, count, now + 300])
      return fail('Invalid 2FA code', 402)
    }
  }

  const clientId = getHeader(event, 'client-id') || getQuery(event).client_id?.toString() || ''
  const { deviceKeyFor } = await import('../../utils/auth')
  const deviceKey = deviceKeyFor(user.id, clientId)
  const sessionError = await ensureSession(db, user, deviceKey, getHeader(event, 'user-agent') || '', ip, true)
  if (sessionError) return fail(sessionError, sessionError === 'too many devices' ? 403 : 400)
  const config = useRuntimeConfig(event)
  const secret = String(config.jwtSecret || '')
  if (!secret || (typeof process !== 'undefined' && process.env.NODE_ENV === 'production' && secret === 'local-development-only-change-this-secret')) return fail('JWT secret is not securely configured', 500)
  const token = signToken(user, secret, Number(config.tokenExpiresIn || 48))
  await db.run('DELETE FROM LoginAttempt WHERE ip = ?', [ip])
  return ok({ token, device_key: deviceKey })
})
