import { fail, ok } from '../../utils/auth'
import { fsContext, isFsError, FS_PERMISSIONS } from '../../utils/fs-api'
import { localRemove } from '../../utils/storage'
import { joinUserPath } from '../../utils/storage'
export default defineEventHandler(async (event) => {
  const body = await readBody<any>(event)
  const dir = String(body?.dir ?? body?.path ?? '')
  const names = Array.isArray(body?.names) ? body.names.map(String) : []
  if (!dir || !names.length) return fail('dir and names are required', 400)
  const ctx = await fsContext(event, dir, FS_PERMISSIONS.remove)
  if (isFsError(ctx)) return ctx.response
  try {
    for (const name of names) {
      const full = joinUserPath(ctx.auth.user.basePath || '/', `${dir.replace(/\/$/, '')}/${name}`)
      const itemContext = await fsContext(event, full, FS_PERMISSIONS.remove)
      if (isFsError(itemContext)) return itemContext.response
      await localRemove(itemContext.resolved)
    }
    return ok()
  } catch (error: any) { return fail(error.message || 'remove failed', error.statusCode ?? 500) }
})
