import { fail, ok } from '../../utils/auth'
import { fsContext, isFsError, FS_PERMISSIONS } from '../../utils/fs-api'
import { localRename } from '../../utils/storage'
export default defineEventHandler(async (event) => {
  const body = await readBody<any>(event)
  const ctx = await fsContext(event, String(body?.path ?? ''), FS_PERMISSIONS.rename)
  if (isFsError(ctx)) return ctx.response
  try { await localRename(ctx.resolved, String(body?.name ?? ''), !!body?.overwrite); return ok() }
  catch (error: any) { return fail(error.message || 'rename failed', error.statusCode ?? 500) }
})
