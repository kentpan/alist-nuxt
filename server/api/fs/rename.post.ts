import { hasPermission, mergeRolePermissions, fail, ok, requireAuth } from '../../utils/auth'
import { useDatabase } from '../../utils/database'
import { normalizeVirtualPath, resolveStorageForPath } from '../../utils/storage'

export default defineEventHandler(async (event) => {
  const context = await requireAuth(event)
  if ('error' in context) return fail(context.error, context.code)
  const body = await readBody<{ path?: string; name?: string }>(event)
  const path = normalizeVirtualPath(String(body?.path ?? ''))
  if (!hasPermission(mergeRolePermissions(context.roles, path), 4)) return fail('Rename permission is required', 403)
  try {
    const storage = await resolveStorageForPath(await useDatabase(event), path)
    await storage.rename(path, String(body?.name ?? ''))
    return ok()
  } catch (error: any) {
    return fail(error?.message || 'Unable to rename file', 400)
  }
})
