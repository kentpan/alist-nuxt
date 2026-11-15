import { fail, ok, requireAuth, verifyTotp } from '../../../utils/auth'
export default defineEventHandler(async (event) => {
  const context = await requireAuth(event, { allowGuest: false })
  if ('error' in context) return fail(context.error, context.code)
  const body = await readBody<{ code?: string; secret?: string }>(event)
  const code = String(body?.code ?? '')
  const secret = String(body?.secret ?? '')
  if (!code || !secret) return fail('code and secret are required', 400)
  if (!(await verifyTotp(code, secret))) return fail('Invalid 2FA code', 400)
  await context.db.run('UPDATE User SET otpSecret = ?, updatedAt = ? WHERE id = ?', [secret, new Date().toISOString(), context.user.id])
  return ok()
})
