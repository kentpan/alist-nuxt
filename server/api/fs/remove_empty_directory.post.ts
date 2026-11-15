import { fail, ok } from '../../utils/auth'
import { fsContext, isFsError, FS_PERMISSIONS } from '../../utils/fs-api'
import { localList, localRemove } from '../../utils/storage'
export default defineEventHandler(async (event) => {
  const body = await readBody<any>(event)
  const ctx = await fsContext(event, String(body?.path ?? ''), FS_PERMISSIONS.remove)
  if (isFsError(ctx)) return ctx.response
  try {
    if ((await localList(ctx.resolved)).length) return fail('directory is not empty', 409)
    await localRemove(ctx.resolved)
    return ok()
  } catch (error: any) { return fail(error.message || 'remove empty directory failed', error.statusCode ?? 500) }
})
