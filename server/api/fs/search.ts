import { fail, ok } from '../../utils/auth'
import { fileObject, fsContext, isFsError, readFsInput } from '../../utils/fs-api'
import { localSearch } from '../../utils/storage'
export default defineEventHandler(async (event) => {
  const body = await readFsInput(event)
  const parent = String(body.parent ?? body.path ?? '/')
  const keyword = String(body.key ?? body.keyword ?? '')
  if (!keyword) return fail('search keyword is required', 400)
  const ctx = await fsContext(event, parent)
  if (isFsError(ctx)) return ctx.response
  try {
    const content = await localSearch(ctx.resolved, keyword, Math.min(1000, Number(body.max_results ?? 500) || 500))
    return ok({ content: content.map(item => fileObject(item.path, item.name, item.size, item.is_dir, item.modified, item.modified)), total: content.length })
  } catch (error: any) { return fail(error.message || 'search failed', error.statusCode ?? 500) }
})
