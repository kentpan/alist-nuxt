import { fail, ok, requireAuth } from '../../utils/auth'
import { fsContext, isFsError, FS_PERMISSIONS } from '../../utils/fs-api'
import { localWritePath } from '../../utils/storage'
export default defineEventHandler(async (event) => {
  if (String(getHeader(event, 'as-task') ?? '').toLowerCase() === 'true') return fail('asynchronous upload tasks are not implemented yet', 501)
  const filePathHeader = getHeader(event, 'file-path')
  if (!filePathHeader) return fail('File-Path header is required', 400)
  let virtualPath: string
  try { virtualPath = decodeURIComponent(filePathHeader) } catch { return fail('File-Path header is not valid URL encoding', 400) }
  const ctx = await fsContext(event, virtualPath, FS_PERMISSIONS.write)
  if (isFsError(ctx)) return ctx.response
  const nodeEvent = (event as any).node
  if (!nodeEvent?.req) return fail('raw stream upload is supported only by the Node runtime', 501)
  try {
    const [{ createWriteStream, promises: fs }, { pipeline }, path] = await Promise.all([import('node:fs'), import('node:stream/promises'), import('node:path')])
    const target = await localWritePath(ctx.resolved)
    await fs.mkdir(path.dirname(target), { recursive: false }).catch((error: any) => { if (error?.code !== 'EEXIST') throw error })
    const overwrite = String(getHeader(event, 'overwrite') ?? 'true').toLowerCase() !== 'false'
    const stream = createWriteStream(target, { flags: overwrite ? 'w' : 'wx', mode: 0o644 })
    await pipeline(nodeEvent.req, stream)
    const lastModified = Number(getHeader(event, 'last-modified') ?? 0)
    if (lastModified > 0 && Number.isFinite(lastModified)) await fs.utimes(target, new Date(), new Date(lastModified))
    return ok()
  } catch (error: any) { return fail(error.message || 'upload failed', error.code === 'EEXIST' ? 409 : error.statusCode ?? 500) }
})
