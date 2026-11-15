import test from 'node:test'
import assert from 'node:assert/strict'
import { createWebDavAdapter } from '../server/utils/drivers/webdav.ts'

const multistatus = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:">
 <d:response><d:href>/dav/root/</d:href><d:propstat><d:prop><d:displayname>root</d:displayname><d:resourcetype><d:collection/></d:resourcetype><d:getlastmodified>Sun, 15 Nov 2026 00:00:00 GMT</d:getlastmodified></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
 <d:response><d:href>/dav/root/folder%20one/</d:href><d:propstat><d:prop><d:displayname>folder one</d:displayname><d:resourcetype><d:collection/></d:resourcetype><d:getlastmodified>Sun, 15 Nov 2026 00:00:00 GMT</d:getlastmodified></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
 <d:response><d:href>/dav/root/a%20file.txt</d:href><d:propstat><d:prop><d:displayname>a file.txt</d:displayname><d:getcontentlength>17</d:getcontentlength><d:getlastmodified>Sun, 15 Nov 2026 00:00:00 GMT</d:getlastmodified><d:resourcetype/></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
</d:multistatus>`

test('WebDAV lists resources under the configured mount and sorts directories first', async () => {
  const calls = []
  const adapter = createWebDavAdapter({
    mountPath: '/remote',
    url: 'https://dav.example/dav/root/',
    username: '用户',
    password: 'secret',
    fetcher: async (url, init) => {
      calls.push({ url: String(url), init })
      return new Response(multistatus, { status: 207 })
    }
  })
  const items = await adapter.list('/remote')
  assert.deepEqual(items.map(item => [item.name, item.path, item.is_dir, item.size]), [
    ['folder one', '/remote/folder one', true, 0],
    ['a file.txt', '/remote/a file.txt', false, 17]
  ])
  assert.equal(calls[0].url, 'https://dav.example/dav/root/')
  assert.equal(calls[0].init.method, 'PROPFIND')
  assert.equal(calls[0].init.headers.Depth, '1')
  assert.match(calls[0].init.headers.Authorization, /^Basic /)
})

test('WebDAV rejects path traversal and paths outside the mount before making requests', async () => {
  let called = false
  const adapter = createWebDavAdapter({
    mountPath: '/remote',
    url: 'https://dav.example/dav/',
    fetcher: async () => { called = true; return new Response('', { status: 200 }) }
  })
  await assert.rejects(adapter.get('/remote/../secret'), /Path traversal/)
  await assert.rejects(adapter.get('/other/file'), /outside the WebDAV mount/)
  assert.equal(called, false)
})

test('WebDAV maps authentication and missing-resource responses to safe status errors', async () => {
  const adapter = createWebDavAdapter({
    mountPath: '/remote',
    url: 'https://dav.example/dav/',
    fetcher: async () => new Response('', { status: 401 })
  })
  await assert.rejects(adapter.get('/remote/file'), error => error.statusCode === 403 && !error.message.includes('secret'))
})

test('WebDAV PUT, MOVE, COPY and range GET forward the correct HTTP contract', async () => {
  const calls = []
  const adapter = createWebDavAdapter({
    mountPath: '/remote',
    url: 'https://dav.example/dav/root/',
    fetcher: async (url, init) => {
      calls.push({ url: String(url), init })
      if (init.method === 'PROPFIND') return new Response(multistatus, { status: 207 })
      if (init.method === 'GET') return new Response('bytes 2-5', { status: 206, headers: { 'content-range': 'bytes 2-5/10', 'content-type': 'application/octet-stream' } })
      return new Response('', { status: 201 })
    }
  })
  await adapter.put('/remote/new file.txt', new TextEncoder().encode('hello'), true)
  await adapter.move('/remote/new file.txt', '/remote/folder one')
  await adapter.copy('/remote/a file.txt', '/remote/folder one', true)
  const read = await adapter.openRead('/remote/a file.txt', 'bytes=2-5')
  assert.equal(read.status, 206)
  assert.equal(read.headers.get('content-range'), 'bytes 2-5/10')
  assert.equal(await new Response(read.stream).text(), 'bytes 2-5')
  assert.equal(calls[0].init.method, 'PUT')
  assert.equal(calls[0].url, 'https://dav.example/dav/root/new%20file.txt')
  assert.equal(calls.find(call => call.init.method === 'MOVE').init.headers.Overwrite, 'F')
  assert.equal(calls.find(call => call.init.method === 'COPY').init.headers.Overwrite, 'T')
  assert.equal(calls.find(call => call.init.method === 'GET').init.headers.Range, 'bytes=2-5')
})
