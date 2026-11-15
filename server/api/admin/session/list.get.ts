import { fail, ok, requireAdmin } from '../../../utils/auth'
export default defineEventHandler(async (event) => {
  const context = await requireAdmin(event)
  if ('error' in context) return fail(context.error, context.code)
  const q = getQuery(event)
  const page = Math.max(1, Number(q.page ?? 1) || 1)
  const size = Math.min(200, Math.max(1, Number(q.page_size ?? 20) || 20))
  const count = await context.db.first<{ total: number }>('SELECT COUNT(*) AS total FROM Session')
  const rows = await context.db.all<any>('SELECT Session.*, User.username FROM Session JOIN User ON User.id = Session.userId ORDER BY lastActive DESC LIMIT ? OFFSET ?', [size, (page - 1) * size])
  return ok({ content: rows.map(row => ({ ...row, user_id: row.userId, device_key: row.deviceKey, user_agent: row.userAgent, last_active: row.lastActive, userId: undefined, deviceKey: undefined, userAgent: undefined, lastActive: undefined })), total: count?.total ?? 0 })
})
