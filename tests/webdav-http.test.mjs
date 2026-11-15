import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createWebDavAdapter } from '../server/utils/drivers/webdav.ts'

function xmlEscape(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

test('WebDAV adapter interoperates with an isolated HTTP DAV server for CRUD and ranges', async () => {
  const root = '/dav/root/'
  const resources = new Map([
    ['', { directory: true }],
    ['folder', { directory: true }],
    ['existing.txt', { directory: false, data: Buffer.from('hello world') }]
  ])
  const resolveKey = pathname => {
    if (!pathname.startsWith(root)) return null
    return decodeURIComponent(pathname.slice(root.length)).replace(/\/$/, '')
  }
  const makeResponse = (key) => {
    const resource = resources.get(key)
    const name = key.split('/').pop() || 'root'
    const length = resource?.data?.length ?? 0
    return `<d:response><d:href>${root}${key.split('/').map(encodeURIComponent).join('/')}${resource?.directory ? '/' : ''}</d:href><d:propstat><d:prop><d:displayname>${xmlEscape(name)}</d:displayname><d:getcontentlength>${length}</d:getcontentlength><d:getlastmodified>Sun, 15 Nov 2026 00:00:00 GMT</d:getlastmodified><d:resourcetype>${resource?.directory ? '<d:collection/>' : ''}</d:resourcetype></d:prop></d:propstat></d:response>`
  }
  const server = createServer(async (req, res) => {
    const key = resolveKey(new URL(req.url, 'http://localhost').pathname)
    if (key === null) { res.writeHead(404).end(); return }
    if (req.method === 'PROPFIND') {
      const current = resources.get(key)
      if (!current) { res.writeHead(404).end(); return }
      const entries = [makeResponse(key)]
      if (req.headers.depth !== '0' && current.directory) {
        for (const child of resources.keys()) {
          if (!child || child === key || !child.startsWith(key ? key + '/' : '')) continue
          const rest = child.slice(key ? key.length + 1 : 0)
          if (rest && !rest.includes('/')) entries.push(makeResponse(child))
        }
      }
      res.writeHead(207, { 'content-type': 'application/xml' }).end(`<d:multistatus xmlns:d="DAV:">${entries.join('')}</d:multistatus>`)
      return
    }
    if (req.method === 'MKCOL') {
      if (resources.has(key)) { res.writeHead(405).end(); return }
      resources.set(key, { directory: true }); res.writeHead(201).end(); return
    }
    if (req.method === 'PUT') {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      resources.set(key, { directory: false, data: Buffer.concat(chunks) })
      res.writeHead(201).end(); return
    }
    if (req.method === 'GET') {
      const resource = resources.get(key)
      if (!resource || resource.directory) { res.writeHead(404).end(); return }
      const data = resource.data
      const range = /^bytes=(\d+)-(\d*)$/.exec(String(req.headers.range ?? ''))
      if (range) {
        const start = Number(range[1]), end = Math.min(range[2] ? Number(range[2]) : data.length - 1, data.length - 1)
        if (start > end || start >= data.length) { res.writeHead(416).end(); return }
        res.writeHead(206, { 'content-range': `bytes ${start}-${end}/${data.length}`, 'content-length': end - start + 1, 'accept-ranges': 'bytes' })
        res.end(data.subarray(start, end + 1)); return
      }
      res.writeHead(200, { 'content-length': data.length, 'accept-ranges': 'bytes' }).end(data); return
    }
    if (req.method === 'MOVE' || req.method === 'COPY') {
      const destination = new URL(req.headers.destination)
      const target = resolveKey(destination.pathname)
      const source = resources.get(key)
      if (target === null || !source) { res.writeHead(404).end(); return }
      resources.set(target, { ...source, data: source.data ? Buffer.from(source.data) : undefined })
      if (req.method === 'MOVE') resources.delete(key)
      res.writeHead(201).end(); return
    }
    if (req.method === 'DELETE') {
      resources.delete(key)
      for (const child of [...resources.keys()]) if (child.startsWith(key + '/')) resources.delete(child)
      res.writeHead(204).end(); return
    }
    res.writeHead(405).end()
  })
  server.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  const address = server.address()
  const adapter = createWebDavAdapter({ mountPath: '/remote', url: `http://127.0.0.1:${address.port}${root}` })
  try {
    const listing = await adapter.list('/remote')
    assert.deepEqual(listing.map(item => item.name).sort(), ['existing.txt', 'folder'])
    await adapter.put('/remote/upload.txt', new TextEncoder().encode('abcdef'), true)
    await adapter.move('/remote/upload.txt', '/remote/folder')
    await adapter.copy('/remote/existing.txt', '/remote/folder', true)
    const read = await adapter.openRead('/remote/folder/upload.txt', 'bytes=1-3')
    assert.equal(read.status, 206)
    assert.equal(await new Response(read.stream).text(), 'bcd')
    await adapter.remove('/remote/folder/existing.txt')
    const folder = await adapter.list('/remote/folder')
    assert.deepEqual(folder.map(item => item.name), ['upload.txt'])
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})
