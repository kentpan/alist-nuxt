import { canReadPath, fail, requireAuth } from '../../utils/auth'
import { useDatabase } from '../../utils/database'
import { normalizeVirtualPath, resolveStorageForPath } from '../../utils/storage'

export default defineEventHandler(async (event) => {
  const context = await requireAuth(event)
  if ('error' in context) return fail(context.error, context.code)
  const path = normalizeVirtualPath(String(getQuery(event).path ?? ''))
  if (!canReadPath(context.roles, path)) return fail('Permission denied', 403)
  try {
    const storage = await resolveStorageForPath(await useDatabase(event), path)
    const result = await storage.openRead(path)
    setHeader(event, 'content-type', 'application/octet-stream')
    setHeader(event, 'content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(result.file.name)}`)
    setHeader(event, 'content-length', result.file.size)
    return sendStream(event, result.stream)
  } catch (error: any) {
    return fail(error?.message || 'Unable to download file', 400)
  }
})
