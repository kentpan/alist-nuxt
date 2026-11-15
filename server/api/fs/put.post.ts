import { hasPermission, mergeRolePermissions, fail, ok, requireAuth } from '../../utils/auth'
import { useDatabase } from '../../utils/database'
import { normalizeVirtualPath, resolveStorageForPath } from '../../utils/storage'

export default defineEventHandler(async (event) => {
  const context = await requireAuth(event)
  if ('error' in context) return fail(context.error, context.code)
  const headerPath = getHeader(event, 'file-path') || String(getQuery(event).path ?? '')
  let decodedPath: string
  try { decodedPath = decodeURIComponent(headerPath) } catch { return fail('File-Path header is invalid URL encoding', 400) }
  const path = normalizeVirtualPath(decodedPath)
  if (!hasPermission(mergeRolePermissions(context.roles, path), 3)) return fail('Write permission is required', 403)
  const requestStream = (event as any).node?.req
  if (!requestStream) return fail('Streaming uploads require the Node runtime; configure an Edge object-storage driver for Edge deployments', 501)
  try {
    const storage = await resolveStorageForPath(await useDatabase(event), path)
    const overwrite = getHeader(event, 'overwrite') !== 'false'
    const file = await storage.putStream(path, requestStream, overwrite)
    return ok({ path: file.path, name: file.name, size: file.size })
  } catch (error: any) {
    return fail(error?.message || 'Unable to upload file', 400)
  }
})
