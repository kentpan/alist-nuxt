import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createWebDavAdapter } from '../server/utils/drivers/webdav.ts'

test('WebDAV adapter interoperates with an isolated HTTP server over real fetch', async (t) => {
  const files = new Map([['/dav/root/hello.txt', Buffer.from('hello world')]])
  const directories = new Set(['/dav/root/'])
  const requests = []
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const path = decodeURIComponent(url.pathname)
    requests.push({ method: req.method ?? '', path, range: req.headers.range })
    const body = []
    for await (const chunk of req) body.push(Buffer.from(chunk))
    const data = Buffer.concat(body)
    const send = (status, text = '') => { res.statusCode = status; res.end(text) }
    if (req.method === 'PROPFIND') {
      const resources = req.headers.depth === '0' ? [path] : [path, ...[...files.keys(), ...directories].filter(item => item !== path && item.startsWith(path.endsWith('/') ? path : path + '/'))]
      const xml = resources.map(resource => {
        const name = resource.replace(/\/$/, '').split('/').pop() || 'root'
        const dir = directories.has(resource.endsWith('/') ? resource : resource + '/')
        const content = files.get(resource)
        return `<d:response><d:href>${resource}${dir && !resource.endsWith('/') ? '/' : ''}</d:href><d:propstat><d:prop><d:displayname>${name}</d:displayname><d:getcontentlength>${content?.length ?? 0}</d:getcontentlength><d:getlastmodified>Sun, 15 Nov 2026 00:00:00 GMT</d:getlastmodified><d:resourcetype>${dir ? '<d:collection/>' : ''}</d:resourcetype></d:prop></d:propstat></d:response>`
      }).join('')
      res.statusCode = 207
      res.setHeader('content-type', 'application/xml')
      res.end(`<d:multistatus xmlns:d="DAV:">${xml}</d:multistatus>`)
      return
    }
    if (req.method === 'MKCOL') { directories.add(path.endsWith('/') ? path : path + '/'); return send(201) }
    if (req.method === 'PUT') { files.set(path, data); return send(201) }
    if (req.method === 'GET') {
      const value = files.get(path)
      if (!value) return send(404)
      const range = req.headers.range
      if (range) {
        const match = /^bytes=(\d+)-(\d*)$/.exec(range)
        if (!match) return send(416)
        const start = Number(match[1]); const end = match[2] ? Math.min(Number(match[2]), value.length - 1) : value.length - 1
        if (start >= value.length || end < start) return send(416)
        res.statusCode = 206
        res.setHeader('content-range', `bytes ${start}-${end}/${value.length}`)
        res.setHeader('content-length', String(end - start + 1))
        res.end(value.subarray(start, end + 1))
        return
      }
      res.statusCode = 200
      res.setHeader('content-length', String(value.length))
      res.end(value)
      return
    }
    if (req.method === 'MOVE' || req.method === 'COPY') {
      const destination = new URL(String(req.headers.destination), 'http://127.0.0.1')
      const target = decodeURIComponent(destination.pathname)
      const value = files.get(path)
      if (!value) return send(404)
      files.set(target, Buffer.from(value))
      if (req.method === 'MOVE') files.delete(path)
      return send(201)
    }
    if (req.method === 'DELETE') { files.delete(path); directories.delete(path.endsWith('/') ? path : path + '/'); return send(204) }
    return send(405)
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise(resolve => server.close(() => resolve())))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const adapter = createWebDavAdapter({ mountPath: '/remote', url: `http://127.0.0.1:${address.port}/dav/root/` })

  const listed = await adapter.list('/remote')
  assert.deepEqual(listed.map(item => item.name), ['hello.txt'])
  await adapter.makeDir('/remote/folder')
  await adapter.put('/remote/upload.txt', new TextEncoder().encode('upload body'))
  const read = await adapter.openRead('/remote/hello.txt', 'bytes=1-4')
  assert.equal(read.status, 206)
  assert.equal(read.headers.get('content-range'), 'bytes 1-4/11')
  assert.equal(await new Response(read.stream).text(), 'ello')
  await adapter.copy('/remote/hello.txt', '/remote/folder')
  await adapter.move('/remote/upload.txt', '/remote/folder')
  await adapter.remove('/remote/folder/hello.txt')

  assert.deepEqual(requests.map(item => item.method), ['PROPFIND', 'MKCOL', 'PUT', 'GET', 'PROPFIND', 'COPY', 'MOVE', 'DELETE'])
  assert.equal(files.has('/dav/root/folder/upload.txt'), true)
  assert.equal(files.has('/dav/root/upload.txt'), false)
})
