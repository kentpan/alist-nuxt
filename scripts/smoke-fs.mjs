import assert from 'node:assert/strict'
import { mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

const base = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000'
const root = resolve(process.env.FS_SMOKE_ROOT || './data/fs-storage')
rmSync(root, { recursive: true, force: true })
mkdirSync(root, { recursive: true })
const clientId = 'stage3-fs-ci'
async function api(path, { method = 'POST', body, token, headers = {} } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: token } : {}), 'client-id': clientId, ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  })
  const payload = await response.json().catch(() => ({}))
  assert.equal(response.status, 200, `${method} ${path}: HTTP ${response.status} ${JSON.stringify(payload)}`)
  return payload
}
const login = await api('/api/auth/login', { body: { username: 'admin', password: process.env.BOOTSTRAP_ADMIN_PASSWORD } })
assert.equal(login.code, 200, login.message)
const token = login.data.token
const storage = await api('/api/admin/storage/create', { token, body: { mount_path: '/local', driver: 'Local', addition: { root_path: root, show_hidden: false }, order: 0, remark: 'isolated stage3 test storage' } })
assert.equal(storage.code, 200, storage.message)
const storageId = storage.data.id
const registration = await api('/api/auth/register', { token, body: { username: 'stage3-reader', password: 'stage3-reader-password' } })
assert.equal(registration.code, 200, registration.message)
const readerLogin = await api('/api/auth/login', { body: { username: 'stage3-reader', password: 'stage3-reader-password' } })
assert.equal(readerLogin.code, 200, readerLogin.message)
try {
  const denied = await api('/api/fs/mkdir', { token: readerLogin.data.token, body: { path: '/local/blocked' } })
  assert.equal(denied.code, 403, 'read-only user must not create directories')
  assert.equal((await api('/api/fs/mkdir', { token, body: { path: '/local/docs' } })).code, 200)
  const upload = await fetch(`${base}/api/fs/put`, { method: 'PUT', headers: { authorization: token, 'client-id': clientId, 'File-Path': '/local/docs/hello.txt', 'content-type': 'text/plain' }, body: 'stage3 local driver works' })
  assert.equal(upload.status, 200, await upload.text())
  const listing = await api('/api/fs/list', { token, body: { path: '/local/docs' } })
  assert.equal(listing.code, 200, listing.message)
  assert.equal(listing.data.content[0].name, 'hello.txt')
  const info = await api('/api/fs/get', { token, body: { path: '/local/docs/hello.txt' } })
  assert.equal(info.code, 200, info.message)
  assert.ok(info.data.raw_url)
  const download = await fetch(`${base}${info.data.raw_url}`, { headers: { authorization: token, 'client-id': clientId } })
  assert.equal(download.status, 200)
  assert.equal(await download.text(), 'stage3 local driver works')
  assert.equal((await api('/api/fs/rename', { token, body: { path: '/local/docs/hello.txt', name: 'renamed.txt' } })).code, 200)
  assert.equal((await api('/api/fs/mkdir', { token, body: { path: '/local/archive' } })).code, 200)
  assert.equal((await api('/api/fs/copy', { token, body: { src_dir: '/local/docs', dst_dir: '/local', names: ['renamed.txt'] } })).code, 200)
  assert.equal((await api('/api/fs/move', { token, body: { src_dir: '/local', dst_dir: '/local/archive', names: ['renamed.txt'] } })).code, 200)
  const search = await api('/api/fs/search', { token, body: { parent: '/local', key: 'renamed' } })
  assert.equal(search.code, 200, search.message)
  assert.ok(search.data.content.length >= 1)
  assert.equal((await api('/api/fs/remove', { token, body: { dir: '/local/docs', names: ['renamed.txt'] } })).code, 200)
  assert.equal((await api('/api/fs/remove', { token, body: { dir: '/local/archive', names: ['renamed.txt'] } })).code, 200)
  assert.equal((await api('/api/fs/remove_empty_directory', { token, body: { path: '/local/docs' } })).code, 200)
  assert.equal((await api('/api/fs/remove_empty_directory', { token, body: { path: '/local/archive' } })).code, 200)
  process.stdout.write('Stage 3 filesystem integration passed: storage CRUD, mkdir, streamed upload, list/get/download, rename, copy, move, search and remove.\n')
} finally {
  await api('/api/admin/storage/delete', { token, body: { id: storageId } }).catch(() => {})
  rmSync(root, { recursive: true, force: true })
}
