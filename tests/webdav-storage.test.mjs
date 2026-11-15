import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveStorage, localList, localMkdir, localRemove, localRename, localMove, localCopy, validateWebDavAddition } from '../server/utils/storage.ts'
import { protectWebDavAddition } from '../server/utils/credential-crypto.ts'

const row = {
  id: 77, mountPath: '/remote', driver: 'WebDav', addition: JSON.stringify({ url: 'https://dav.example/dav/root/', username: 'test', password: 'secret' }),
  order: 0, disabled: 0, cacheExpiration: 30, status: 'work', remark: '', modified: '', disableIndex: 0, enableSign: 0,
  orderBy: 'name', orderDirection: 'asc', extractFolder: '', webProxy: 0, webdavPolicy: 'native_proxy', proxyRange: 0, downProxyUrl: '', downProxySign: 1
}
const listing = `<d:multistatus xmlns:d="DAV:">
<d:response><d:href>/dav/root/</d:href><d:propstat><d:prop><d:displayname>root</d:displayname><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>
<d:response><d:href>/dav/root/file.txt</d:href><d:propstat><d:prop><d:displayname>file.txt</d:displayname><d:getcontentlength>4</d:getcontentlength><d:getlastmodified>Sun, 15 Nov 2026 00:00:00 GMT</d:getlastmodified><d:resourcetype/></d:prop></d:propstat></d:response>
</d:multistatus>`

test('storage resolver dispatches WebDAV and reuses it for list/mkdir operations', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), method: init.method })
    return init.method === 'PROPFIND' ? new Response(listing, { status: 207 }) : new Response('', { status: 201 })
  }
  try {
    const db = { all: async () => [row] }
    const resolved = await resolveStorage(db, '/remote')
    assert.equal(resolved.storage.driver, 'WebDav')
    assert.ok(resolved.remote)
    const items = await localList(resolved)
    assert.deepEqual(items.map(item => [item.name, item.size, item.isDir]), [['file.txt', 4, false]])
    await localMkdir({ ...resolved, virtualPath: '/remote/new-folder' })
    assert.deepEqual(calls.map(call => call.method), ['PROPFIND', 'MKCOL'])
    assert.equal(calls[0].url, 'https://dav.example/dav/root/')
    assert.equal(calls[1].url, 'https://dav.example/dav/root/new-folder')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('WebDAV storage config rejects insecure non-loopback endpoints and embedded credentials', () => {
  assert.throws(() => validateWebDavAddition({ url: 'http://dav.example/root' }), /HTTPS/)
  assert.throws(() => validateWebDavAddition({ url: 'https://user:pass@dav.example/root' }), /embedded credentials/)
  assert.doesNotThrow(() => validateWebDavAddition({ url: 'http://127.0.0.1:8080/dav' }))
})

test('WebDAV mount roots cannot be renamed, moved, copied or removed', async () => {
  const db = { all: async () => [row] }
  const root = await resolveStorage(db, '/remote')
  await assert.rejects(localRename(root, 'renamed'), /storage root/)
  await assert.rejects(localRemove(root), /storage root/)
  await assert.rejects(localMove(db, '/remote', '/remote', 'remote'), /storage root/)
  await assert.rejects(localCopy(db, '/remote', '/remote', 'remote'), /storage root/)
})

test('storage resolver decrypts encrypted WebDAV credentials only with the configured key', async () => {
  const secret = 'webdav-resolver-test-key-with-at-least-32-characters'
  const addition = await protectWebDavAddition({ url: 'https://dav.example/dav/root/', username: 'test-user', password: 'test-password' }, secret)
  const encryptedRow = { ...row, addition: JSON.stringify(addition) }
  const originalFetch = globalThis.fetch
  let authorization = ''
  globalThis.fetch = async (_url, init) => {
    authorization = String(init.headers.Authorization ?? '')
    return new Response(listing, { status: 207 })
  }
  try {
    const resolved = await resolveStorage({ all: async () => [encryptedRow] } as any, '/remote', secret)
    await resolved.remote!.get('/remote')
    assert.equal(authorization, `Basic ${btoa('test-user:test-password')}`)
    await assert.rejects(resolveStorage({ all: async () => [encryptedRow] } as any, '/remote'), /could not be decrypted/)
  } finally {
    globalThis.fetch = originalFetch
  }
})
