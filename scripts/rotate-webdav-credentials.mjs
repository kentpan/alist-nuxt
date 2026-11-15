#!/usr/bin/env node
import { DatabaseSync } from 'node:sqlite'
import { rotateWebDavAddition } from '../server/utils/credential-crypto.ts'

const databasePath = process.env.DATABASE_PATH || './data/alist-nuxt.db'
const oldKey = process.env.OLD_STORAGE_CREDENTIALS_KEY || ''
const newKey = process.env.NUXT_STORAGE_CREDENTIALS_KEY || process.env.STORAGE_CREDENTIALS_KEY || ''
const apply = process.argv.includes('--apply') || process.env.APPLY === 'true'

if (newKey.length < 32) {
  process.stderr.write('NUXT_STORAGE_CREDENTIALS_KEY must contain at least 32 characters.\n')
  process.exit(1)
}

const db = new DatabaseSync(databasePath)
try {
  const rows = db.prepare("SELECT id, addition FROM Storage WHERE lower(driver) = 'webdav'").all()
  const updates = []
  for (const row of rows) {
    let addition
    try { addition = JSON.parse(row.addition || '{}') }
    catch { throw new Error(`Storage ${row.id} has invalid addition JSON; no changes were written`) }
    const rotated = await rotateWebDavAddition(addition, oldKey, newKey)
    if (JSON.stringify(rotated) !== JSON.stringify(addition)) updates.push({ id: row.id, addition: JSON.stringify(rotated) })
  }

  if (!apply) {
    process.stdout.write(`Dry run: ${updates.length} of ${rows.length} WebDAV storage entries would be encrypted/rotated. Re-run with --apply to write changes.\n`)
  } else {
    db.exec('BEGIN IMMEDIATE')
    try {
      const update = db.prepare('UPDATE Storage SET addition = ?, updatedAt = ? WHERE id = ?')
      const now = new Date().toISOString()
      for (const row of updates) update.run(row.addition, now, row.id)
      db.exec('COMMIT')
      process.stdout.write(`Updated ${updates.length} of ${rows.length} WebDAV storage entries.\n`)
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }
} finally {
  db.close()
}
