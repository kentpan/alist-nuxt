import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { createLocalStorageAdapter, normalizeVirtualPath } from '../server/utils/storage.ts'

test('virtual paths are normalized and traversal is rejected', () => {
  assert.equal(normalizeVirtualPath('/docs//images/'), '/docs/images')
  assert.throws(() => normalizeVirtualPath('/../outside'), /traversal/)
  assert.throws(() => normalizeVirtualPath('/docs/../../outside'), /traversal/)
})

test('local storage supports list, mkdir, upload, rename, copy, move and remove', async () => {
  const root = await mkdtemp(join(tmpdir(), 'alist-local-'))
  try {
    const storage = await createLocalStorageAdapter({ mountPath: '/', rootPath: root })
    await storage.makeDir('/docs')
    await storage.put('/docs/a.txt', new TextEncoder().encode('hello'))
    await storage.putStream('/docs/stream.txt', Readable.from([Buffer.from('streamed')]))
    assert.equal(await readFile(join(root, 'docs', 'stream.txt'), 'utf8'), 'streamed')
    assert.equal((await storage.get('/docs/a.txt')).size, 5)
    assert.equal((await storage.list('/docs')).length, 1)
    await storage.rename('/docs/a.txt', 'b.txt')
    await storage.copy('/docs/b.txt', '/')
    await storage.makeDir('/archive')
    await storage.move('/b.txt', '/archive')
    assert.equal(await readFile(join(root, 'archive', 'b.txt'), 'utf8'), 'hello')
    await storage.remove('/docs/b.txt')
    await storage.remove('/archive/b.txt')
    assert.equal((await storage.list('/docs')).length, 0)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('local storage refuses symlink traversal outside its root', async () => {
  const root = await mkdtemp(join(tmpdir(), 'alist-local-root-'))
  const outside = await mkdtemp(join(tmpdir(), 'alist-local-outside-'))
  try {
    await writeFile(join(outside, 'secret.txt'), 'secret')
    await symlink(outside, join(root, 'escape'), 'dir')
    const storage = await createLocalStorageAdapter({ mountPath: '/', rootPath: root })
    await assert.rejects(storage.get('/escape/secret.txt'), /Symbolic links/)
  } finally {
    await rm(root, { recursive: true, force: true })
    await rm(outside, { recursive: true, force: true })
  }
})
