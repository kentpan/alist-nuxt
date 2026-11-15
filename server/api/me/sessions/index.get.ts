import { fail, ok, requireAuth } from '../../../utils/auth'
export default defineEventHandler(async (event) => {
  const context = await requireAuth(event)
  if ('error' in context) return fail(context.error, context.code)
  const rows = await context.db.all<any>('SELECT deviceKey, userAgent, ip, lastActive, status FROM Session WHERE userId = ? ORDER BY lastActive DESC', [context.user.id])
  return ok(rows.map(row => ({ ...row, current: row.deviceKey === context.deviceKey, device_key: row.deviceKey, user_agent: row.userAgent, last_active: row.lastActive, deviceKey: undefined, userAgent: undefined, lastActive: undefined })))
})
