import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

test('initial schema migration creates isolated Alist core tables', () => {
  const dir = mkdtempSync(join(tmpdir(), 'alist-nuxt-test-'))
  const db = new DatabaseSync(join(dir, 'test.db'))
  try {
    const migration = readFileSync(new URL('../prisma/migrations/0001_init/migration.sql', import.meta.url), 'utf8')
    db.exec(migration)
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(x => x.name)
    assert.deepEqual(tables, ['Setting', 'Storage', 'User', 'sqlite_sequence'])
    db.prepare('INSERT INTO User (username, passwordHash, updatedAt) VALUES (?, ?, ?)').run('tester', 'not-a-real-password', new Date().toISOString())
    assert.equal(db.prepare('SELECT username FROM User WHERE username = ?').get('tester').username, 'tester')
    assert.throws(() => db.prepare('INSERT INTO User (username, passwordHash, updatedAt) VALUES (?, ?, ?)').run('tester', 'x', new Date().toISOString()))
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
