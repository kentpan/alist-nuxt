import { fail, ok } from '../../utils/auth'
import { fsContext, isFsError, FS_PERMISSIONS } from '../../utils/fs-api'
import { localRename, validateNameComponent } from '../../utils/storage'
export default defineEventHandler(async (event) => {
  const body = await readBody<any>(event)
  const path = String(body?.path ?? '')
  const objects = Array.isArray(body?.rename_objects) ? body.rename_objects : []
  if (!path || !objects.length) return fail('path and rename_objects are required', 400)
  try {
    for (const item of objects) {
      const ctx = await fsContext(event, `${path.replace(/\/$/, '')}/${String(item.src_name ?? '')}`, FS_PERMISSIONS.rename)
      if (isFsError(ctx)) return ctx.response
      validateNameComponent(String(item.dst_name ?? ''))
      await localRename(ctx.resolved, String(item.dst_name), !!body.overwrite)
    }
    return ok()
  } catch (error: any) { return fail(error.message || 'batch rename failed', error.statusCode ?? 500) }
})
