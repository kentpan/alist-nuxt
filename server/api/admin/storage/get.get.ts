import { fail, ok, requireAdmin } from '../../../utils/auth'
export default defineEventHandler(async (event) => {
  const context = await requireAdmin(event)
  if ('error' in context) return fail(context.error, context.code)
  const id = Number(getQuery(event).id)
  if (!Number.isInteger(id) || id < 1) return fail('valid id is required', 400)
  const row = await context.db.first<any>('SELECT * FROM Storage WHERE id = ?', [id])
  if (!row) return fail('storage not found', 404)
  let addition = {}
  try { addition = JSON.parse(row.addition || '{}') } catch { return fail('storage addition is invalid JSON', 500) }
  return ok({ ...row, mount_path: row.mountPath, addition, disabled: !!row.disabled, disable_index: !!row.disableIndex, enable_sign: !!row.enableSign, web_proxy: !!row.webProxy, proxy_range: !!row.proxyRange, down_proxy_sign: !!row.downProxySign })
})
