import { fail, ok, requireAdmin } from '../../../utils/auth'
import { normalizeMountPath, validateLocalAddition } from '../../../utils/storage'
export default defineEventHandler(async (event) => {
  const context = await requireAdmin(event)
  if ('error' in context) return fail(context.error, context.code)
  const body = await readBody<any>(event)
  const id = Number(body?.id)
  if (!Number.isInteger(id) || id < 1) return fail('valid id is required', 400)
  const old = await context.db.first<any>('SELECT * FROM Storage WHERE id = ?', [id])
  if (!old) return fail('storage not found', 404)
  const driver = String(body.driver ?? old.driver)
  if (!(event as any).node) return fail('Local storage configuration is available only in the Node runtime', 501)
  if (driver !== 'Local') return fail(`driver ${driver} is not implemented; only Local is currently available`, 501)
  let mountPath: string
  try { mountPath = normalizeMountPath(String(body.mount_path ?? old.mountPath)) } catch (error: any) { return fail(error.message, 400) }
  if (mountPath === '/') return fail('mount_path must be a non-root absolute path', 400)
  const duplicate = await context.db.first('SELECT id FROM Storage WHERE mountPath = ? AND id <> ?', [mountPath, id])
  if (duplicate) return fail('mount_path already exists', 409)
  let addition: Record<string, unknown>
  try { addition = typeof body.addition === 'string' ? JSON.parse(body.addition) : (body.addition ?? JSON.parse(old.addition || '{}')) } catch { return fail('addition must be valid JSON', 400) }
  try { await validateLocalAddition(addition) } catch (error: any) { return fail(error.message, error.statusCode ?? 400) }
  const now = new Date().toISOString()
  await context.db.run('UPDATE Storage SET mountPath = ?, driver = ?, addition = ?, "order" = ?, disabled = ?, cacheExpiration = ?, status = ?, remark = ?, modified = ?, disableIndex = ?, enableSign = ?, orderBy = ?, orderDirection = ?, extractFolder = ?, webProxy = ?, webdavPolicy = ?, proxyRange = ?, downProxyUrl = ?, downProxySign = ?, updatedAt = ? WHERE id = ?', [
    mountPath, driver, JSON.stringify(addition), Number(body.order ?? old.order), body.disabled === undefined ? old.disabled : (body.disabled ? 1 : 0),
    Number(body.cache_expiration ?? old.cacheExpiration), 'work', String(body.remark ?? old.remark), now,
    body.disable_index === undefined ? old.disableIndex : (body.disable_index ? 1 : 0), body.enable_sign === undefined ? old.enableSign : (body.enable_sign ? 1 : 0),
    String(body.order_by ?? old.orderBy), String(body.order_direction ?? old.orderDirection), String(body.extract_folder ?? old.extractFolder),
    body.web_proxy === undefined ? old.webProxy : (body.web_proxy ? 1 : 0), String(body.webdav_policy ?? old.webdavPolicy),
    body.proxy_range === undefined ? old.proxyRange : (body.proxy_range ? 1 : 0), String(body.down_proxy_url ?? old.downProxyUrl),
    body.down_proxy_sign === undefined ? old.downProxySign : (body.down_proxy_sign ? 1 : 0), now, id
  ])
  return ok()
})
