import assert from 'node:assert/strict'
import { createServer } from 'node:http'

const base = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000'
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || ''
const davRoot = '/dav/root/'
const resources = new Map([
  ['', { directory: true }],
  ['folder', { directory: true }],
  ['folder/hello.txt', { directory: false, data: Buffer.from('hello webdav') }]
])

function xmlEscape(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function keyFor(pathname) {
  if (!pathname.startsWith(davRoot)) return null
  return decodeURIComponent(pathname.slice(davRoot.length)).replace(/\/$/, '')
}
function davEntry(key) {
  const item = resources.get(key)
  const name = key.split('/').pop() || 'root'
  const href = davRoot + key.split('/').map(encodeURIComponent).join('/') + (item?.directory ? '/' : '')
  return `<d:response><d:href>${href}</d:href><d:propstat><d:prop><d:displayname>${xmlEscape(name)}</d:displayname><d:getcontentlength>${item?.data?.length ?? 0}</d:getcontentlength><d:getlastmodified>Sun, 15 Nov 2026 00:00:00 GMT</d:getlastmodified><d:resourcetype>${item?.directory ? '<d:collection/>' : ''}</d:resourcetype></d:prop></d:propstat></d:response>`
}

const dav = createServer(async (req, res) => {
  const key = keyFor(new URL(req.url, 'http://localhost').pathname)
  if (key === null) { res.writeHead(404).end(); return }
  if (req.method === 'PROPFIND') {
    const item = resources.get(key)
    if (!item) { res.writeHead(404).end(); return }
    const entries = [davEntry(key)]
    if (req.headers.depth !== '0' && item.directory) {
      for (const child of resources.keys()) {
        if (child === key || !child.startsWith(key ? key + '/' : '')) continue
        const rest = child.slice(key ? key.length + 1 : 0)
        if (rest && !rest.includes('/')) entries.push(davEntry(child))
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
    const item = resources.get(key)
    if (!item || item.directory) { res.writeHead(404).end(); return }
    const range = /^bytes=(\d+)-(\d*)$/.exec(String(req.headers.range ?? ''))
    if (range) {
      const start = Number(range[1]), end = Math.min(range[2] ? Number(range[2]) : item.data.length - 1, item.data.length - 1)
      if (start > end || start >= item.data.length) { res.writeHead(416).end(); return }
      res.writeHead(206, { 'content-range': `bytes ${start}-${end}/${item.data.length}`, 'content-length': end - start + 1, 'accept-ranges': 'bytes' })
      res.end(item.data.subarray(start, end + 1)); return
    }
    res.writeHead(200, { 'content-length': item.data.length, 'accept-ranges': 'bytes' }).end(item.data); return
  }
  if (req.method === 'MOVE' || req.method === 'COPY') {
    const destination = new URL(req.headers.destination)
    const target = keyFor(destination.pathname)
    const item = resources.get(key)
    if (target === null || !item) { res.writeHead(404).end(); return }
    resources.set(target, { ...item, data: item.data ? Buffer.from(item.data) : undefined })
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

dav.listen(0, '127.0.0.1')
await new Promise(resolve => dav.once('listening', resolve))
const address = dav.address()
const davUrl = `http://127.0.0.1:${address.port}${davRoot}`
let token = ''
try {
  assert.ok(password, 'BOOTSTRAP_ADMIN_PASSWORD is required')
  const login = await fetch(new URL('/api/auth/login', base), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'client-id': 'alist-webdav-smoke' },
    body: JSON.stringify({ username: 'admin', password })
  })
  const loginBody = await login.json()
  assert.equal(loginBody.code, 200, JSON.stringify(loginBody))
  token = loginBody.data.token
  async function api(path, method = 'POST', body) {
    const response = await fetch(new URL(path, base), {
      method,
      headers: { authorization: token, 'client-id': 'alist-webdav-smoke', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    })
    const result = await response.json()
    assert.equal(response.ok, true, JSON.stringify(result))
    assert.equal(result.code, 200, JSON.stringify(result))
    return result.data
  }

  const created = await api('/api/admin/storage/create', 'POST', {
    mount_path: '/webdav',
    driver: 'WebDav',
    addition: { url: davUrl, username: 'ci', password: 'only-test' }
  })
  assert.ok(created.id)
  const initial = await api('/api/fs/list', 'POST', { path: '/webdav' })
  assert.ok(initial.content.some(item => item.name === 'folder' && item.is_dir))
  await api('/api/fs/mkdir', 'POST', { path: '/webdav/new-folder' })

  const uploadResponse = await fetch(new URL('/api/fs/put', base), {
    method: 'PUT',
    headers: { authorization: token, 'client-id': 'alist-webdav-smoke', 'File-Path': encodeURIComponent('/webdav/upload.txt'), 'Overwrite': 'false' },
    body: 'abcdef'
  })
  const uploadBody = await uploadResponse.json()
  assert.equal(uploadResponse.ok, true, JSON.stringify(uploadBody))
  assert.equal(uploadBody.code, 200, JSON.stringify(uploadBody))

  const info = await api('/api/fs/get', 'POST', { path: '/webdav/upload.txt' })
  const signed = await fetch(new URL(info.raw_url, base), { headers: { Range: 'bytes=1-3' } })
  assert.equal(signed.status, 206)
  assert.equal(await signed.text(), 'bcd')

  const download = await fetch(new URL('/api/fs/download?path=%2Fwebdav%2Fupload.txt', base), {
    headers: { authorization: token, Range: 'bytes=2-4' }
  })
  assert.equal(download.status, 206)
  assert.equal(await download.text(), 'cde')

  await api('/api/fs/rename', 'POST', { path: '/webdav/upload.txt', name: 'renamed.txt' })
  await api('/api/fs/copy', 'POST', { src_dir: '/webdav', dst_dir: '/webdav/new-folder', names: ['renamed.txt'] })
  await api('/api/fs/move', 'POST', { src_dir: '/webdav/new-folder', dst_dir: '/webdav', names: ['renamed.txt'] })
  await api('/api/fs/remove', 'POST', { dir: '/webdav', names: ['renamed.txt'] })
  const search = await api('/api/fs/search?parent=%2Fwebdav&key=hello', 'GET')
  assert.ok(search.content.some(item => item.name === 'hello.txt'))
  process.stdout.write('Stage 6 WebDAV API integration passed: storage CRUD, list, mkdir, upload, signed range preview, download range, rename, copy, move, remove and recursive search.\n')
} finally {
  await new Promise((resolve, reject) => dav.close(error => error ? reject(error) : resolve()))
}
