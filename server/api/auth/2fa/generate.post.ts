import { fail, generateTotpSecret, createTotpQr, ok, requireAuth } from '../../../utils/auth'
export default defineEventHandler(async (event) => {
  const context = await requireAuth(event, { allowGuest: false })
  if ('error' in context) return fail(context.error, context.code)
  const secret = await generateTotpSecret()
  const qr = await createTotpQr(context.user.username, secret)
  return ok({ qr, secret })
})
