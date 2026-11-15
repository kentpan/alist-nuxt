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
