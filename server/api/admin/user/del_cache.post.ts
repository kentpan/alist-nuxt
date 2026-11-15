import { fail, ok, requireAdmin } from '../../../utils/auth'
export default defineEventHandler(async (event) => {
  const context = await requireAdmin(event)
  if ('error' in context) return fail(context.error, context.code)
  const body = await readBody<{ username?: string }>(event)
  const username = String(body?.username ?? '')
  if (!username) return fail('username is required', 400)
  const user = await context.db.first('SELECT id FROM User WHERE username = ?', [username])
  if (!user) return fail('user not found', 404)
  // No process-local user cache is used in this migration; successful lookup is the cache invalidation boundary.
  return ok()
})
