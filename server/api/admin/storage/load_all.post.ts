import { fail, ok, requireAdmin } from '../../../utils/auth'
export default defineEventHandler(async (event) => {
  const context = await requireAdmin(event)
  if ('error' in context) return fail(context.error, context.code)
  const rows = await context.db.all<any>('SELECT id, mountPath, driver, disabled, status FROM Storage ORDER BY "order" ASC, id ASC')
  return ok({ loaded: rows.filter(row => !row.disabled && row.driver === 'Local').length, pending: rows.filter(row => row.driver !== 'Local').map(row => ({ id: row.id, driver: row.driver, status: 'unsupported' })) })
})
