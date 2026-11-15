import { fail } from '../../utils/auth'
import { fsContext, isFsError, readFsInput } from '../../utils/fs-api'
import { localReadPath } from '../../utils/storage'

export default defineEventHandler(async (event) => {
  const body = await readFsInput(event)
  const ctx = await fsContext(event, String(body.path ?? ''))
  if (isFsError(ctx)) return ctx.response
  try {
    if (ctx.resolved.remote) {
      const remote = await ctx.resolved.remote.openRead(ctx.virtualPath, getHeader(event, 'range'))
      const headers = new Headers({
        'content-type': remote.headers.get('content-type') || 'application/octet-stream',
        'content-disposition': 'attachment',
        'accept-ranges': remote.headers.get('accept-ranges') || 'bytes'
      })
      for (const name of ['content-length', 'content-range', 'last-modified']) {
        const value = remote.headers.get(name)
        if (value) headers.set(name, value)
      }
      return new Response(remote.stream, { status: remote.status, headers })
    }
    const target = await localReadPath(ctx.resolved)
    const { createReadStream, promises: fs } = await import('node:fs')
    const stat = await fs.stat(target)
    if (!stat.isFile()) return fail('path is not a file', 400)
    const range = getHeader(event, 'range')
    let start = 0
    let end = stat.size - 1
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range)
      if (!match) return fail('invalid range', 416)
      if (match[1]) start = Number(match[1])
      if (match[2]) end = Number(match[2])
      if (start > end || start >= stat.size) return fail('range not satisfiable', 416)
      end = Math.min(end, stat.size - 1)
      setResponseStatus(event, 206)
      setHeader(event, 'content-range', `bytes ${start}-${end}/${stat.size}`)
    }
    setHeader(event, 'accept-ranges', 'bytes')
    setHeader(event, 'content-length', Math.max(0, end - start + 1))
    setHeader(event, 'content-type', contentType(ctx.virtualPath))
    setHeader(event, 'last-modified', stat.mtime.toUTCString())
    return sendStream(event, createReadStream(target, { start, end }))
  } catch (error: any) {
    return fail(error.message || 'download failed', error.statusCode ?? 404)
  }
})

function contentType(filePath: string) {
  const ext = filePath.toLowerCase().split('.').pop() || ''
  const map: Record<string, string> = { txt: 'text/plain; charset=utf-8', md: 'text/markdown; charset=utf-8', html: 'text/html; charset=utf-8', css: 'text/css', js: 'text/javascript', json: 'application/json', pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', mp4: 'video/mp4', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', zip: 'application/zip' }
  return map[ext] || 'application/octet-stream'
}
