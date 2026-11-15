import { fail, ok, requireAdmin } from '../../../utils/auth'
import { normalizeMountPath, validateLocalAddition, validateWebDavAddition } from '../../../utils/storage'
import { protectWebDavAddition } from '../../../utils/credential-crypto'

export default defineEventHandler(async (event) => {
  const context = await requireAdmin(event)
  if ('error' in context) return fail(context.error, context.code)
  const body = await readBody<any>(event)
  const driverInput = String(body?.driver ?? 'local')
  const requestedDriver = driverInput.toLowerCase()
  if (!['local', 'webdav'].includes(requestedDriver)) return fail(`driver ${driverInput} is catalogued but not implemented yet`, 501)
  const driver = requestedDriver === 'webdav' ? 'WebDav' : 'Local'
  let mountPath: string
  try { mountPath = normalizeMountPath(String(body?.mount_path ?? body?.mountPath ?? '/')) }
  catch (error: any) { return fail(error.message, 400) }
  if (await context.db.first('SELECT id FROM Storage WHERE mountPath = ?', [mountPath])) return fail('mount_path already exists', 409)
  let addition: Record<string, unknown>
  try { addition = typeof body.addition === 'string' ? JSON.parse(body.addition) : (body.addition ?? {}) }
  catch { return fail('addition must be valid JSON', 400) }
  if (!addition || typeof addition !== 'object' || Array.isArray(addition)) return fail('addition must be a JSON object', 400)
  try {
    if (requestedDriver === 'local') {
      if (!(event as any).node?.req) return fail('Local storage configuration is supported only by the Node runtime', 501)
      await validateLocalAddition(addition)
    } else validateWebDavAddition(addition)
  } catch (error: any) { return fail(error.message, error.statusCode ?? 400) }
  let storedAddition = addition
  if (requestedDriver === 'webdav') {
    try { storedAddition = await protectWebDavAddition(addition, useRuntimeConfig(event).storageCredentialsKey) }
    catch (error: any) { return fail(error.message || 'Unable to protect WebDAV credentials', 400) }
  }
  const now = new Date().toISOString()
  const values = [
    mountPath, driver, JSON.stringify(storedAddition), Number(body.order ?? 0), body.disabled ? 1 : 0,
    Number(body.cache_expiration ?? 30), 'work', String(body.remark ?? ''), now,
    body.disable_index ? 1 : 0, body.enable_sign ? 1 : 0,
    String(body.order_by ?? ''), String(body.order_direction ?? ''), String(body.extract_folder ?? ''),
    body.web_proxy ? 1 : 0, String(body.webdav_policy ?? 'native_proxy'), body.proxy_range ? 1 : 0,
    String(body.down_proxy_url ?? ''), body.down_proxy_sign === false ? 0 : 1, now, now
  ]
  const result = await context.db.run('INSERT INTO Storage (mountPath, driver, addition, "order", disabled, cacheExpiration, status, remark, modified, disableIndex, enableSign, orderBy, orderDirection, extractFolder, webProxy, webdavPolicy, proxyRange, downProxyUrl, downProxySign, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', values)
  return ok({ id: Number(result.lastInsertRowid ?? 0), mount_path: mountPath, driver })
})
