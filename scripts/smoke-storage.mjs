import assert from 'node:assert/strict'

const base = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000'
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD
async function api(path, { method = 'GET', body, token, headers = {} } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: token } : {}),
      'client-id': 'stage3-storage-ci',
      ...headers
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  })
  const raw = await response.text()
  assert.equal(response.status, 200, `${method} ${path} HTTP status: ${raw}`)
  const result = JSON.parse(raw)
  assert.equal(result.code, 200, `${method} ${path}: ${result.message}`)
  return result
}

const login = await api('/api/auth/login', { method: 'POST', body: { username: 'admin', password } })
const token = login.data.token
assert.ok(token)
const root = await api('/api/fs/list?path=%2F', { token })
assert.equal(root.data.provider, 'local')
await api('/api/fs/mkdir', { method: 'POST', token, body: { path: '/stage3' } })
await api('/api/fs/mkdir', { method: 'POST', token, body: { path: '/copies' } })
await api('/api/fs/mkdir', { method: 'POST', token, body: { path: '/archive' } })
const uploadResponse = await fetch(`${base}/api/fs/put`, {
  method: 'POST',
  headers: { authorization: token, 'client-id': 'stage3-storage-ci', 'File-Path': encodeURIComponent('/stage3/hello.txt'), 'Content-Type': 'text/plain', Overwrite: 'false' },
  body: 'hello from Stage 3'
})
const uploadText = await uploadResponse.text()
assert.equal(uploadResponse.status, 200, `upload HTTP status: ${uploadText}`)
assert.equal(JSON.parse(uploadText).code, 200, uploadText)

const downloaded = await fetch(`${base}/api/fs/download?path=${encodeURIComponent('/stage3/hello.txt')}`, { headers: { authorization: token, 'client-id': 'stage3-storage-ci' } })
assert.equal(downloaded.status, 200)
assert.equal(await downloaded.text(), 'hello from Stage 3')

await api('/api/fs/rename', { method: 'POST', token, body: { path: '/stage3/hello.txt', name: 'renamed.txt' } })
await api('/api/fs/copy', { method: 'POST', token, body: { src_dir: '/stage3', dst_dir: '/copies', names: ['renamed.txt'] } })
await api('/api/fs/move', { method: 'POST', token, body: { src_dir: '/copies', dst_dir: '/archive', names: ['renamed.txt'] } })
const archived = await api('/api/fs/list?path=%2Farchive', { token })
assert.equal(archived.data.content[0].name, 'renamed.txt')
await api('/api/fs/remove', { method: 'POST', token, body: { dir: '/archive', names: ['renamed.txt'] } })
await api('/api/fs/remove', { method: 'POST', token, body: { dir: '/stage3', names: ['renamed.txt'] } })
assert.equal((await api('/api/fs/list?path=%2Fstage3', { token })).data.content.length, 0)
process.stdout.write('Stage 3 local storage API integration passed: list, mkdir, streaming upload, download, rename, copy, move and remove.\n')
