import { canReadPath, hasPermission, mergeRolePermissions, fail, ok, requireAuth } from '../../utils/auth'
import { useDatabase } from '../../utils/database'
import { normalizeVirtualPath, resolveStorageForPath } from '../../utils/storage'

export default defineEventHandler(async (event) => {
  const context = await requireAuth(event)
  if ('error' in context) return fail(context.error, context.code)
  const path = normalizeVirtualPath(String(getQuery(event).path ?? '/'))
  if (!canReadPath(context.roles, path)) return fail('Permission denied', 403)
  try {
    const db = await useDatabase(event)
    const storage = await resolveStorageForPath(db, path)
    const content = await storage.list(path)
    const permission = mergeRolePermissions(context.roles, path)
    return ok({ content, total: content.length, provider: 'local', write: hasPermission(permission, 3) })
  } catch (error: any) {
    return fail(error?.message || 'Unable to list storage path', 400)
  }
})
