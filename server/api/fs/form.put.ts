import { fail, ok } from '../../utils/auth'
import { fsContext, isFsError, FS_PERMISSIONS } from '../../utils/fs-api'
import { localWritePath } from '../../utils/storage'
export default defineEventHandler(async (event) => {
  if (!(event as any).node?.req) return fail('multipart upload is supported only by the Node runtime', 501)
  const parts = await readMultipartFormData(event)
  if (!parts?.length) return fail('multipart form data is required', 400)
  const pathPart = parts.find(part => part.name === 'path')
  const filePart = parts.find(part => !!part.filename && !!part.data)
  if (!pathPart?.data || !filePart?.data) return fail('path and file fields are required', 400)
  const virtualPath = pathPart.data.toString('utf8')
  const ctx = await fsContext(event, virtualPath, FS_PERMISSIONS.write)
  if (isFsError(ctx)) return ctx.response
  try {
    const [{ promises: fs }, path] = await Promise.all([import('node:fs'), import('node:path')])
    const target = await localWritePath(ctx.resolved)
    await fs.mkdir(path.dirname(target), { recursive: false }).catch((error: any) => { if (error?.code !== 'EEXIST') throw error })
    if (String(getQuery(event).overwrite ?? 'true') === 'false') {
      try { await fs.lstat(target); return fail('file already exists', 409) } catch (error: any) { if (error?.code !== 'ENOENT') throw error }
    }
    await fs.writeFile(target, filePart.data)
    return ok()
  } catch (error: any) { return fail(error.message || 'form upload failed', error.statusCode ?? 500) }
})
