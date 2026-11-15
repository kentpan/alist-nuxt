import { hasPermission, mergeRolePermissions, fail, ok, requireAuth } from '../../utils/auth'
import { useDatabase } from '../../utils/database'
import { normalizeVirtualPath, resolveStorageForPath } from '../../utils/storage'

export default defineEventHandler(async (event) => {
  const context = await requireAuth(event)
  if ('error' in context) return fail(context.error, context.code)
  const body = await readBody<{ src_dir?: string; dst_dir?: string; names?: string[]; overwrite?: boolean }>(event)
  const srcDir = normalizeVirtualPath(String(body?.src_dir ?? '/'))
  const dstDir = normalizeVirtualPath(String(body?.dst_dir ?? '/'))
  const names = Array.isArray(body?.names) ? body.names : []
  if (!names.length) return fail('At least one file name is required', 400)
  if (!hasPermission(mergeRolePermissions(context.roles, srcDir), 6) || !hasPermission(mergeRolePermissions(context.roles, dstDir), 3)) return fail('Copy and destination write permissions are required', 403)
  try {
    const storage = await resolveStorageForPath(await useDatabase(event), srcDir)
    for (const name of names) {
      if (!name || /[\\/\\0]/.test(name) || name === '.' || name === '..') return fail('Invalid file name', 400)
      await storage.copy(normalizeVirtualPath(`${srcDir}/${name}`), dstDir, body.overwrite === true)
    }
    return ok()
  } catch (error: any) {
    return fail(error?.message || 'Unable to copy files', 400)
  }
})
