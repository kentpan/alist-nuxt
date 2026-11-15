import { fail, ok } from '../../utils/auth'
import { fsContext, isFsError, readFsInput } from '../../utils/fs-api'
import { localList } from '../../utils/storage'
export default defineEventHandler(async (event) => {
  const body = await readFsInput(event)
  const ctx = await fsContext(event, String(body.path ?? '/'))
  if (isFsError(ctx)) return ctx.response
  try {
    const items = await localList(ctx.resolved)
    return ok(items.filter(item => item.isDir).map(item => ({ name: item.name, modified: item.modified.toISOString() })))
  } catch (error: any) { return fail(error.message || 'directory listing failed', error.statusCode ?? 500) }
})
