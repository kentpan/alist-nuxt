import { fail, ok, requireAdmin } from '../../../utils/auth'
export default defineEventHandler(async (event) => {
  const context = await requireAdmin(event)
  if ('error' in context) return fail(context.error, context.code)
  const q = getQuery(event)
  const page = Math.max(1, Number(q.page ?? 1) || 1)
  const size = Math.min(200, Math.max(1, Number(q.per_page ?? q.page_size ?? 20) || 20))
  const count = await context.db.first<{ total: number }>('SELECT COUNT(*) AS total FROM Storage')
  const rows = await context.db.all<any>('SELECT * FROM Storage ORDER BY "order" ASC, id ASC LIMIT ? OFFSET ?', [size, (page - 1) * size])
  return ok({ content: rows.map(row => ({ ...row, addition: parseAddition(row.addition), disabled: !!row.disabled, disable_index: !!row.disableIndex, enable_sign: !!row.enableSign, web_proxy: !!row.webProxy, proxy_range: !!row.proxyRange, down_proxy_sign: !!row.downProxySign })), total: count?.total ?? 0 })
})
function parseAddition(value: string) { try { return JSON.parse(value || '{}') } catch { return {} } }
