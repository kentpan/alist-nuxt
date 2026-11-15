import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { revealWebDavAddition } from '../server/utils/credential-crypto.ts'

test('credential rotation CLI defaults to dry-run and applies legacy encryption transactionally', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'alist-webdav-rotation-'))
  const databasePath = join(dir, 'test.db')
  const newKey = 'stage6-cli-rotation-key-with-at-least-32-characters'
  const db = new DatabaseSync(databasePath)
  db.exec('CREATE TABLE Storage (id INTEGER PRIMARY KEY, driver TEXT, addition TEXT, updatedAt TEXT)')
  db.prepare('INSERT INTO Storage (id, driver, addition, updatedAt) VALUES (?, ?, ?, ?)').run(1, 'WebDav', JSON.stringify({ url: 'https://dav.invalid/', username: 'legacy-user', password: 'legacy-password' }), '')
  db.close()
  const script = new URL('../scripts/rotate-webdav-credentials.mjs', import.meta.url)
  try {
    const dryRun = spawnSync(process.execPath, [script.pathname], {
      encoding: 'utf8',
      env: { ...process.env, DATABASE_PATH: databasePath, NUXT_STORAGE_CREDENTIALS_KEY: newKey, OLD_STORAGE_CREDENTIALS_KEY: '' }
    })
    assert.equal(dryRun.status, 0, dryRun.stderr)
    assert.match(dryRun.stdout, /Dry run: 1 of 1/)
    const afterDryRun = new DatabaseSync(databasePath)
    const plaintext = JSON.parse(afterDryRun.prepare('SELECT addition FROM Storage WHERE id = 1').get().addition)
    assert.equal(plaintext.password, 'legacy-password')
    afterDryRun.close()

    const apply = spawnSync(process.execPath, [script.pathname, '--apply'], {
      encoding: 'utf8',
      env: { ...process.env, DATABASE_PATH: databasePath, NUXT_STORAGE_CREDENTIALS_KEY: newKey, OLD_STORAGE_CREDENTIALS_KEY: '' }
    })
    assert.equal(apply.status, 0, apply.stderr)
    const afterApply = new DatabaseSync(databasePath)
    const encrypted = JSON.parse(afterApply.prepare('SELECT addition FROM Storage WHERE id = 1').get().addition)
    afterApply.close()
    assert.match(encrypted.password, /^enc:v1:/)
    assert.equal((await revealWebDavAddition(encrypted, newKey)).password, 'legacy-password')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
