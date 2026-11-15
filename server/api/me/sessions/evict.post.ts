import { fail, ok, requireAuth } from '../../../utils/auth'
export default defineEventHandler(async (event) => {
  const context = await requireAuth(event)
  if ('error' in context) return fail(context.error, context.code)
  const body = await readBody<{ device_key?: string }>(event)
  const key = String(body?.device_key ?? '')
  if (!key) return fail('device_key is required', 400)
  const result = await context.db.run('UPDATE Session SET status = 1 WHERE userId = ? AND deviceKey = ?', [context.user.id, key])
  if (!result.changes) return fail('session not found', 404)
  return ok()
})
