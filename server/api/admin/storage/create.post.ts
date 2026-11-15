import { fail, ok, requireAdmin } from '../../../utils/auth'
import { normalizeMountPath, validateLocalAddition } from '../../../utils/storage'
export default defineEventHandler(async (event) => {
  const context = await requireAdmin(event)
  if ('error' in context) return fail(context.error, context.code)
  const body = await readBody<any>(event)
  const driver = String(body?.driver ?? '')
  if (driver !== 'Local') return fail(`driver ${driver || '(empty)'} is not implemented; only Local is currently available`, 501)
  let mountPath: string
  try { mountPath = normalizeMountPath(String(body?.mount_path ?? '')) } catch (error: any) { return fail(error.message, 400) }
  if (!mountPath || mountPath === '/') return fail('mount_path must be a non-root absolute path', 400)
  if (await context.db.first('SELECT id FROM Storage WHERE mountPath = ?', [mountPath])) return fail('mount_path already exists', 409)
  if (!(event as any).node) return fail('Local storage configuration is available only in the Node runtime', 501)
  let addition: Record<string, unknown>
  try { addition = typeof body.addition === 'string' ? JSON.parse(body.addition) : (body.addition ?? {}) } catch { return fail('addition must be valid JSON', 400) }
  if (!addition || typeof addition !== 'object' || Array.isArray(addition)) return fail('addition must be a JSON object', 400)
  try { await validateLocalAddition(addition) } catch (error: any) { return fail(error.message, error.statusCode ?? 400) }
  const now = new Date().toISOString()
  const values = [
    mountPath, driver, JSON.stringify(addition), Number(body.order ?? 0), body.disabled ? 1 : 0,
    Number(body.cache_expiration ?? 30), 'work', String(body.remark ?? ''), now,
    body.disable_index ? 1 : 0, body.enable_sign ? 1 : 0,
    String(body.order_by ?? ''), String(body.order_direction ?? ''), String(body.extract_folder ?? ''),
    body.web_proxy ? 1 : 0, String(body.webdav_policy ?? 'native_proxy'), body.proxy_range ? 1 : 0,
    String(body.down_proxy_url ?? ''), body.down_proxy_sign === false ? 0 : 1, now, now
  ]
  const result = await context.db.run('INSERT INTO Storage (mountPath, driver, addition, "order", disabled, cacheExpiration, status, remark, modified, disableIndex, enableSign, orderBy, orderDirection, extractFolder, webProxy, webdavPolicy, proxyRange, downProxyUrl, downProxySign, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', values)
  return ok({ id: Number(result.lastInsertRowid ?? 0) })
})
