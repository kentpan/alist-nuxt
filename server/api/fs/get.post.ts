import { fail, ok } from '../../utils/auth'
import { fileObject, fsContext, isFsError, readFsInput } from '../../utils/fs-api'
import { localStat, encodeVirtualPath } from '../../utils/storage'
import { createDownloadSignature } from '../../utils/download-sign'

export default defineEventHandler(async (event) => {
  const body = await readFsInput(event)
  const ctx = await fsContext(event, String(body.path ?? '/'))
  if (isFsError(ctx)) return ctx.response
  try {
    const { stat } = await localStat(ctx.resolved)
    const name = ctx.virtualPath.split('/').filter(Boolean).pop() || ''
    const item = fileObject(ctx.virtualPath, name, stat.isDirectory() ? 0 : stat.size, stat.isDirectory(), stat.mtime, stat.birthtime)
    const expires = Math.floor(Date.now() / 1000) + 15 * 60
    const secret = String(useRuntimeConfig(event).jwtSecret)
    const signature = stat.isFile() ? await createDownloadSignature(ctx.virtualPath, secret, expires) : ''
    const rawUrl = stat.isFile() ? `/d/${encodeVirtualPath(ctx.virtualPath.replace(/^\//, ''))}?expires=${expires}&sign=${signature}` : ''
    return ok({ ...item, raw_url: rawUrl, provider: ctx.resolved.storage.driver.toLowerCase(), related: [] })
  } catch (error: any) { return fail(error.message || 'get failed', error.statusCode ?? 404) }
})
