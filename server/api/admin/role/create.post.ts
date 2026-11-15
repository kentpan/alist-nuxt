import { fail, ok, requireAdmin } from '../../../utils/auth'
import { cleanPath } from '../../../utils/auth'
export default defineEventHandler(async (event) => {
  const context = await requireAdmin(event)
  if ('error' in context) return fail(context.error, context.code)
  const body = await readBody<any>(event)
  const name = String(body?.name ?? '').trim()
  if (!name || name.length > 64) return fail('role name is required and must be at most 64 characters', 400)
  if (['admin', 'guest'].includes(name.toLowerCase())) return fail('built-in role name is reserved', 400)
  if (await context.db.first('SELECT id FROM Role WHERE name = ?', [name])) return fail('role already exists', 409)
  const scopes = Array.isArray(body.permission_scopes) ? body.permission_scopes.map((x: any) => ({ path: cleanPath(String(x.path ?? '/')), permission: Number(x.permission) || 0 })) : []
  const result = await context.db.run('INSERT INTO Role (name, description, "default", permissionScopes) VALUES (?, ?, ?, ?)', [name, String(body.description ?? ''), body.default ? 1 : 0, JSON.stringify(scopes)])
  return ok({ id: Number(result.lastInsertRowid ?? 0) })
})
