import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

test('auth migration adds role, device session, login throttle and revocation tables', () => {
  const dir = mkdtempSync(join(tmpdir(), 'alist-auth-migration-'))
  const db = new DatabaseSync(join(dir, 'test.db'))
  try {
    for (const name of ['0001_init/migration.sql', '0002_auth_roles_sessions/migration.sql', '0003_setting_metadata/migration.sql']) {
      db.exec(readFileSync(new URL(`../prisma/migrations/${name}`, import.meta.url), 'utf8'))
    }
    const columns = db.prepare('PRAGMA table_info("User")').all().map(x => x.name)
    for (const column of ['pwdTs', 'salt', 'basePath', 'roles', 'permission', 'otpSecret', 'ssoId', 'authn']) assert.ok(columns.includes(column))
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x => x.name)
    const settingColumns = db.prepare('PRAGMA table_info("Setting")').all().map(x => x.name)
    for (const column of ['help', 'type', 'options', 'group', 'flag', 'index']) assert.ok(settingColumns.includes(column))
    for (const table of ['Role', 'Session', 'RevokedToken', 'LoginAttempt']) assert.ok(tables.includes(table))
    db.prepare('INSERT INTO User (username, passwordHash, updatedAt, roles) VALUES (?, ?, ?, ?)').run('test-user', 'hash', new Date().toISOString(), '[3]')
    db.prepare('INSERT INTO Role (name, permissionScopes) VALUES (?, ?)').run('reader', '[{"path":"/docs","permission":1}]')
    db.prepare('INSERT INTO Session (userId, deviceKey, lastActive) VALUES (1, ?, ?)').run('device-key', 1)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM Session').get().n, 1)
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
