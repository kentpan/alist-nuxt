import { fail, ok, requireAuth, revokeToken } from '../../utils/auth'
export default defineEventHandler(async (event) => {
  const context = await requireAuth(event)
  if ('error' in context) return fail(context.error, context.code)
  if (context.token) await revokeToken(context.db, context.token)
  await context.db.run('UPDATE Session SET status = 1, lastActive = ? WHERE deviceKey = ?', [Math.floor(Date.now() / 1000), context.deviceKey])
  return ok()
})
