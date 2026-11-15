import { fail, ok } from '../../utils/auth'
import { fsContext, isFsError, FS_PERMISSIONS } from '../../utils/fs-api'
import { localList, localRename } from '../../utils/storage'
export default defineEventHandler(async (event) => {
  const body = await readBody<any>(event)
  const ctx = await fsContext(event, String(body?.path ?? ''), FS_PERMISSIONS.rename)
  if (isFsError(ctx)) return ctx.response
  let regex: RegExp
  try { regex = new RegExp(String(body?.src ?? ''), body?.replace ? 'g' : '') }
  catch { return fail('invalid source regular expression', 400) }
  if (body?.recursive) return fail('recursive regex rename is not implemented yet', 501)
  const replacement = String(body?.dst ?? '')
  try {
    const entries = await localList(ctx.resolved)
    let renamed = 0
    for (const item of entries) {
      const next = item.name.replace(regex, replacement)
      if (next && next !== item.name) {
        const childPath = `${ctx.virtualPath.replace(/\/$/, '')}/${item.name}`
        const child = await fsContext(event, childPath, FS_PERMISSIONS.rename)
        if (isFsError(child)) return child.response
        await localRename(child.resolved, next, !!body.overwrite)
        renamed++
      }
    }
    return ok({ renamed })
  } catch (error: any) { return fail(error.message || 'regex rename failed', error.statusCode ?? 500) }
})
