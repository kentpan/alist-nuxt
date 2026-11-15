export interface SqlResult<T = Record<string, unknown>> {
  rows: T[]
  changes: number
  lastInsertRowid?: number | bigint
}
export interface DatabaseAdapter {
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>
  first<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>
  run(sql: string, params?: unknown[]): Promise<SqlResult>
  batch(statements: Array<{ sql: string; params?: unknown[] }>): Promise<SqlResult[]>
}
type D1DatabaseLike = {
  prepare(sql: string): { bind(...values: unknown[]): any; all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>; first<T = Record<string, unknown>>(): Promise<T | null>; run(): Promise<{ meta?: { changes?: number; last_row_id?: number } }> }
  batch<T = unknown>(statements: unknown[]): Promise<T[]>
}
function isD1(value: unknown): value is D1DatabaseLike {
  return !!value && typeof (value as D1DatabaseLike).prepare === 'function' && typeof (value as D1DatabaseLike).batch === 'function'
}
export async function createDatabase(options: { d1?: unknown; databasePath: string }): Promise<DatabaseAdapter> {
  if (isD1(options.d1)) {
    const d1 = options.d1
    return {
      async all<T>(sql: string, params: unknown[] = []) {
        const result = await d1.prepare(sql).bind(...params).all<T>()
        return result.results ?? []
      },
      first<T>(sql: string, params: unknown[] = []) {
        return d1.prepare(sql).bind(...params).first<T>()
      },
      async run(sql: string, params: unknown[] = []) {
        const result = await d1.prepare(sql).bind(...params).run()
        return { rows: [], changes: result.meta?.changes ?? 0, lastInsertRowid: result.meta?.last_row_id }
      },
      async batch(items) {
        const results = await d1.batch(items.map(item => d1.prepare(item.sql).bind(...(item.params ?? []))))
        return results.map((item: any) => ({ rows: [], changes: item.meta?.changes ?? 0, lastInsertRowid: item.meta?.last_row_id }))
      }
    }
  }
  // Keep node:sqlite out of the Cloudflare execution path; load it only without a D1 binding.
  const { DatabaseSync } = await import('node:sqlite')
  const db = new DatabaseSync(options.databasePath)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')
  return {
    async all<T>(sql: string, params: unknown[] = []) {
      return db.prepare(sql).all(...params) as T[]
    },
    async first<T>(sql: string, params: unknown[] = []) {
      return (db.prepare(sql).get(...params) as T | undefined) ?? null
    },
    async run(sql: string, params: unknown[] = []) {
      const result = db.prepare(sql).run(...params)
      return { rows: [], changes: Number(result.changes), lastInsertRowid: result.lastInsertRowid }
    },
    async batch(items) {
      db.exec('BEGIN IMMEDIATE')
      try {
        const results = items.map(item => {
          const result = db.prepare(item.sql).run(...(item.params ?? []))
          return { rows: [], changes: Number(result.changes), lastInsertRowid: result.lastInsertRowid }
        })
        db.exec('COMMIT')
        return results
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    }
  }
}
export async function useDatabase(event: H3Event): Promise<DatabaseAdapter> {
  const config = useRuntimeConfig(event)
  const cloudflare = (event.context as any).cloudflare
  const d1 = cloudflare?.env?.DB ?? (event.context as any).env?.DB
  return createDatabase({ d1, databasePath: String(config.databasePath) })
}
