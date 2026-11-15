import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDatabase } from '../server/utils/database.ts'

test('Node adapter uses isolated node:sqlite and supports query/run/batch', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'alist-node-adapter-'))
  try {
    const db = await createDatabase({ databasePath: join(dir, 'local.db') })
    await db.run('CREATE TABLE sample (id INTEGER PRIMARY KEY, value TEXT NOT NULL)')
    await db.run('INSERT INTO sample(value) VALUES (?)', ['node'])
    assert.equal((await db.first<{ value: string }>('SELECT value FROM sample WHERE id = ?', [1]))?.value, 'node')
    await db.batch([{ sql: 'INSERT INTO sample(value) VALUES (?)', params: ['batch-a'] }, { sql: 'INSERT INTO sample(value) VALUES (?)', params: ['batch-b'] }])
    assert.equal((await db.all('SELECT value FROM sample ORDER BY id')).length, 3)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('D1 adapter selects the supplied D1 binding', async () => {
  const calls: string[] = []
  const d1 = {
    prepare(sql: string) {
      calls.push(sql)
      return {
        bind(...params: unknown[]) {
          return {
            async all() { return { results: [{ sql, params }] } },
            async first() { return { sql, params } },
            async run() { return { meta: { changes: 1, last_row_id: 9 } } }
          }
        }
      }
    },
    async batch(items: any[]) { return items.map(() => ({ meta: { changes: 1, last_row_id: 10 } })) }
  }
  const db = await createDatabase({ d1, databasePath: '/this/path/must/not/be/opened.db' })
  assert.deepEqual(await db.all('SELECT ?', [7]), [{ sql: 'SELECT ?', params: [7] }])
  assert.deepEqual(await db.first('SELECT ?', [8]), { sql: 'SELECT ?', params: [8] })
  assert.equal((await db.run('UPDATE sample SET value = ?', ['d1'])).changes, 1)
  assert.equal((await db.batch([{ sql: 'DELETE FROM sample' }]))[0].changes, 1)
  assert.equal(calls.length, 4)
})
