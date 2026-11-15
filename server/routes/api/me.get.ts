// Authenticated current-user endpoint (kept in server/routes to avoid the nested /api/me route collision).
import { fail, getCurrentUserPayload, ok, requireAuth } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const context = await requireAuth(event)
  if ('error' in context) return fail(context.error, context.code)
  return ok(await getCurrentUserPayload(context))
})
