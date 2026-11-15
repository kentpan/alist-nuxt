import { fail, requireAuth } from '../../utils/auth'
import { joinUserPath, resolveStorage, localReadPath, StorageError } from '../../utils/storage'
import { canReadPath } from '../../utils/auth'
export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event)
  if ('error' in auth) return send(event, auth.error, auth.code)
  let virtualPath: string
  try { virtualPath = joinUserPath(auth.user.basePath || '/', `/${getRouterParam(event, 'path') ?? ''}`) }
  catch (error: any) { return send(event, error.message, 403) }
  if (!canReadPath(auth.roles, virtualPath)) return send(event, 'permission denied', 403)
  if (!(event as any).node) return send(event, 'Local file streaming is supported only by the Node runtime', 501)
  try {
    const resolved = await resolveStorage(auth.db, virtualPath)
    const target = await localReadPath(resolved)
    const { createReadStream, promises: fs } = await import('node:fs')
    const stat = await fs.stat(target)
    if (!stat.isFile()) return send(event, 'not a file', 400)
    const range = getHeader(event, 'range')
    let start = 0, end = stat.size - 1
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range)
      if (!match) return send(event, 'invalid range', 416)
      if (match[1]) start = Number(match[1])
      if (match[2]) end = Number(match[2])
      if (start > end || start >= stat.size) return send(event, 'range not satisfiable', 416)
      end = Math.min(end, stat.size - 1)
      setResponseStatus(event, 206)
      setHeader(event, 'content-range', `bytes ${start}-${end}/${stat.size}`)
    }
    setHeader(event, 'accept-ranges', 'bytes')
    setHeader(event, 'content-length', String(Math.max(0, end - start + 1)))
    setHeader(event, 'content-type', contentType(virtualPath))
    setHeader(event, 'last-modified', stat.mtime.toUTCString())
    setHeader(event, 'cache-control', 'private, max-age=0, must-revalidate')
    return sendStream(event, createReadStream(target, { start, end }))
  } catch (error: any) {
    if (error instanceof StorageError) return send(event, error.message, error.statusCode)
    return send(event, error.message || 'file stream failed', 404)
  }
})
function send(event: any, message: string, status: number) { setResponseStatus(event, status); return { code: status, message, data: null } }
function contentType(filePath: string) {
  const ext = filePath.toLowerCase().split('.').pop() || ''
  const map: Record<string, string> = { txt: 'text/plain; charset=utf-8', md: 'text/markdown; charset=utf-8', html: 'text/html; charset=utf-8', css: 'text/css', js: 'text/javascript', json: 'application/json', pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', mp4: 'video/mp4', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', zip: 'application/zip' }
  return map[ext] || 'application/octet-stream'
}
