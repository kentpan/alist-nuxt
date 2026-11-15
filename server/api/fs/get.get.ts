import { canReadPath, fail, ok, requireAuth } from '../../utils/auth'
import { useDatabase } from '../../utils/database'
import { normalizeVirtualPath, resolveStorageForPath } from '../../utils/storage'

export default defineEventHandler(async (event) => {
  const context = await requireAuth(event)
  if ('error' in context) return fail(context.error, context.code)
  const path = normalizeVirtualPath(String(getQuery(event).path ?? '/'))
  if (!canReadPath(context.roles, path)) return fail('Permission denied', 403)
  try {
    const storage = await resolveStorageForPath(await useDatabase(event), path)
    return ok(await storage.get(path))
  } catch (error: any) {
    return fail(error?.message || 'Unable to get file metadata', 400)
  }
})
