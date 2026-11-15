import { fail, ok } from '../../utils/auth'
import { fsContext, isFsError, FS_PERMISSIONS } from '../../utils/fs-api'
import { localMkdir } from '../../utils/storage'
export default defineEventHandler(async (event) => {
  const body = await readBody<any>(event)
  const ctx = await fsContext(event, String(body?.path ?? ''), FS_PERMISSIONS.write)
  if (isFsError(ctx)) return ctx.response
  try { await localMkdir(ctx.resolved); return ok() }
  catch (error: any) { return fail(error.message || 'mkdir failed', error.statusCode ?? 500) }
})
