import { fail, ok } from '../../utils/auth'
import { fsContext, isFsError, FS_PERMISSIONS } from '../../utils/fs-api'
import { localCopy, joinUserPath } from '../../utils/storage'
export default defineEventHandler(async (event) => {
  const body = await readBody<any>(event)
  const sourceDir = String(body?.src_dir ?? '')
  const destinationDir = String(body?.dst_dir ?? '')
  const names = Array.isArray(body?.names) ? body.names.map(String) : []
  if (!sourceDir || !destinationDir || !names.length) return fail('src_dir, dst_dir and names are required', 400)
  const source = await fsContext(event, sourceDir, FS_PERMISSIONS.copy)
  if (isFsError(source)) return source.response
  const destination = await fsContext(event, destinationDir, FS_PERMISSIONS.copy)
  if (isFsError(destination)) return destination.response
  try {
    for (const name of names) {
      const sourcePath = joinUserPath(source.auth.user.basePath || '/', `${sourceDir.replace(/\/$/, '')}/${name}`)
      const sourceItem = await fsContext(event, sourcePath, FS_PERMISSIONS.copy)
      if (isFsError(sourceItem)) return sourceItem.response
      const destinationItem = await fsContext(event, `${destinationDir.replace(/\/$/, '')}/${name}`, FS_PERMISSIONS.copy)
      if (isFsError(destinationItem)) return destinationItem.response
      await localCopy(source.auth.db, sourcePath, destination.virtualPath, name, !!body.overwrite)
    }
    return ok()
  } catch (error: any) { return fail(error.message || 'copy failed', error.statusCode ?? 500) }
})
