import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const databasePath = process.env.DATABASE_PATH || './data/ci.db'
const rootPath = resolve(process.env.LOCAL_STORAGE_ROOT || './data/storage')
mkdirSync(rootPath, { recursive: true })
const db = new DatabaseSync(databasePath)
const now = new Date().toISOString()
db.prepare('INSERT OR REPLACE INTO Storage (mountPath, driver, addition, "order", disabled, createdAt, updatedAt) VALUES (?, ?, ?, ?, 0, ?, ?)')
  .run('/', 'local', JSON.stringify({ root_folder_path: rootPath, show_hidden: false }), 0, now, now)
db.close()
process.stdout.write(`Seeded isolated local storage at ${rootPath}\n`)
