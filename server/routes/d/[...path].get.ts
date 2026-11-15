import { fail, requireAuth, canReadPath } from '../../utils/auth'
import { joinUserPath, resolveStorage, localReadPath, StorageError } from '../../utils/storage'
import { useDatabase } from '../../utils/database'
import { verifyDownloadSignature } from '../../utils/download-sign'

export default defineEventHandler(async (event) => {
  const encodedPath = `/${getRouterParam(event, 'path') ?? ''}`
  let virtualPath: string
  try { virtualPath = joinUserPath('/', encodedPath) }
  catch (error: any) { return send(event, error.message, 403) }

  const query = getQuery(event)
  const secret = String(useRuntimeConfig(event).jwtSecret)
  const signed = await verifyDownloadSignature(virtualPath, secret, query.expires, query.sign)
  let db: any
  if (signed) {
    db = await useDatabase(event)
  } else {
    const auth = await requireAuth(event)
    if ('error' in auth) return send(event, auth.error, auth.code)
    try { virtualPath = joinUserPath(auth.user.basePath || '/', encodedPath) }
    catch (error: any) { return send(event, error.message, 403) }
    if (!canReadPath(auth.roles, virtualPath)) return send(event, 'permission denied', 403)
    db = auth.db
  }

  try {
    const resolved = await resolveStorage(db, virtualPath, useRuntimeConfig(event).storageCredentialsKey)
    if (resolved.remote) {
      const remote = await resolved.remote.openRead(virtualPath, getHeader(event, 'range'))
      const headers = new Headers({
        'content-type': remote.headers.get('content-type') || contentType(virtualPath),
        'content-disposition': 'inline',
        'accept-ranges': remote.headers.get('accept-ranges') || 'bytes',
        'cache-control': signed ? 'private, max-age=60' : 'private, max-age=0, must-revalidate'
      })
      for (const name of ['content-length', 'content-range', 'last-modified']) {
        const value = remote.headers.get(name)
        if (value) headers.set(name, value)
      }
      return new Response(remote.stream, { status: remote.status, headers })
    }
    if (!(event as any).node?.req) return send(event, 'Local file streaming is supported only by the Node runtime', 501)
    const target = await localReadPath(resolved)
    const { createReadStream, promises: fs } = await import('node:fs')
    const stat = await fs.stat(target)
    if (!stat.isFile()) return send(event, 'not a file', 400)
    const range = getHeader(event, 'range')
    let start = 0, end = stat.size - 1
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range)
      if (!match || stat.size === 0) return send(event, 'invalid range', 416)
      if (match[1]) start = Number(match[1])
      if (match[2]) end = Number(match[2])
      if (start > end || start >= stat.size) return send(event, 'range not satisfiable', 416)
      end = Math.min(end, stat.size - 1)
      setResponseStatus(event, 206)
      setHeader(event, 'content-range', `bytes ${start}-${end}/${stat.size}`)
    }
    setHeader(event, 'accept-ranges', 'bytes')
    setHeader(event, 'content-length', stat.size === 0 ? 0 : Math.max(0, end - start + 1))
    setHeader(event, 'content-type', contentType(virtualPath))
    setHeader(event, 'content-disposition', 'inline')
    setHeader(event, 'last-modified', stat.mtime.toUTCString())
    setHeader(event, 'cache-control', signed ? 'private, max-age=60' : 'private, max-age=0, must-revalidate')
    const stream = stat.size === 0 ? createReadStream(target) : createReadStream(target, { start, end })
    return sendStream(event, stream)
  } catch (error: any) {
    if (error instanceof StorageError) return send(event, error.message, error.statusCode)
    return send(event, error.message || 'file stream failed', error.statusCode ?? 404)
  }
})

function send(event: any, message: string, status: number) {
  setResponseStatus(event, status)
  return { code: status, message, data: null }
}

function contentType(filePath: string) {
  const ext = filePath.toLowerCase().split('.').pop() || ''
  const map: Record<string, string> = { txt: 'text/plain; charset=utf-8', md: 'text/markdown; charset=utf-8', html: 'text/html; charset=utf-8', css: 'text/css', js: 'text/javascript', json: 'application/json', pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', mp4: 'video/mp4', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', zip: 'application/zip' }
  return map[ext] || 'application/octet-stream'
}
