import { fail, ok, requireAdmin } from '../../../utils/auth'
import { useDatabase } from '../../../utils/database'

export default defineEventHandler(async (event) => {
  const context = await requireAdmin(event)
  if ('error' in context) return fail(context.error, context.code)
  const rows = await context.db.all<any>('SELECT id, mountPath, driver, addition, "order", disabled, createdAt, updatedAt FROM Storage ORDER BY "order" ASC, id ASC')
  return ok({ content: rows.map(row => ({ ...row, mount_path: row.mountPath, mountPath: undefined })) })
})
