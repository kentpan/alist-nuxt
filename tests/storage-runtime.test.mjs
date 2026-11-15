import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createDatabase } from '../server/utils/database.ts'
import { resolveStorage, localList, localMkdir, localWritePath, localCopy, localMove, localRemove, localStat, StorageError } from '../server/utils/storage.ts'

test('Local driver confines paths to its root and supports core filesystem operations', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'alist-local-driver-'))
  const dbPath = join(temp, 'test.db')
  const root = join(temp, 'storage')
  mkdirSync(root)
  const raw = new DatabaseSync(dbPath)
  try {
    for (const name of ['0001_init/migration.sql', '0002_auth_roles_sessions/migration.sql', '0003_setting_metadata/migration.sql', '0004_storage_runtime/migration.sql']) {
      raw.exec(readFileSync(new URL(`../prisma/migrations/${name}`, import.meta.url), 'utf8'))
    }
    raw.prepare('INSERT INTO Storage (mountPath, driver, addition) VALUES (?, ?, ?)').run('/local', 'Local', JSON.stringify({ root_path: root, show_hidden: false }))
  } finally { raw.close() }
  const db = await createDatabase({ databasePath: dbPath })
  try {
    const rootStorage = await resolveStorage(db, '/local')
    await localMkdir(await resolveStorage(db, '/local/docs'))
    const file = await localWritePath(await resolveStorage(db, '/local/docs/hello.txt'))
    writeFileSync(file, 'local-driver-test')
    assert.equal((await localList(await resolveStorage(db, '/local/docs')))[0].name, 'hello.txt')
    await localCopy(db, '/local/docs/hello.txt', '/local', 'copy.txt')
    await localMove(db, '/local/copy.txt', '/local/docs', 'moved.txt')
    assert.equal(readFileSync(join(root, 'docs', 'moved.txt'), 'utf8'), 'local-driver-test')
    await localRemove(await resolveStorage(db, '/local/docs/hello.txt'))
    assert.equal((await localList(await resolveStorage(db, '/local/docs'))).length, 1)
    assert.ok(rootStorage.rootPath === resolve(root))
    symlinkSync('/etc/passwd', join(root, 'escape'))
    const escape = await resolveStorage(db, '/local/escape')
    await assert.rejects(() => localStat(escape), error => error instanceof StorageError && error.statusCode === 403)
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
})
