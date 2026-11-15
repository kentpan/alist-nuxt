import { hasPermission, mergeRolePermissions, fail, ok, requireAuth } from '../../utils/auth'
import { useDatabase } from '../../utils/database'
import { normalizeVirtualPath, resolveStorageForPath } from '../../utils/storage'

export default defineEventHandler(async (event) => {
  const context = await requireAuth(event)
  if ('error' in context) return fail(context.error, context.code)
  const body = await readBody<{ names?: string[]; dir?: string }>(event)
  const directory = normalizeVirtualPath(String(body?.dir ?? '/'))
  const names = Array.isArray(body?.names) ? body.names : []
  if (!names.length) return fail('At least one file name is required', 400)
  if (!hasPermission(mergeRolePermissions(context.roles, directory), 7)) return fail('Remove permission is required', 403)
  try {
    const storage = await resolveStorageForPath(await useDatabase(event), directory)
    for (const name of names) {
      if (!name || /[\\/\\0]/.test(name) || name === '.' || name === '..') return fail('Invalid file name', 400)
      await storage.remove(normalizeVirtualPath(`${directory}/${name}`))
    }
    return ok()
  } catch (error: any) {
    return fail(error?.message || 'Unable to remove files', 400)
  }
})
