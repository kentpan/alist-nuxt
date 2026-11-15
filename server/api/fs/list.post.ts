import { fail, hasPermission, mergeRolePermissions, ok } from '../../utils/auth'
import { fileObject, fsContext, isFsError, readFsInput } from '../../utils/fs-api'
import { localList } from '../../utils/storage'
export default defineEventHandler(async (event) => {
  const body = await readFsInput(event)
  const ctx = await fsContext(event, String(body.path ?? '/'))
  if (isFsError(ctx)) return ctx.response
  try {
    const items = await localList(ctx.resolved)
    const total = items.length
    const page = Math.max(1, Number(body.page ?? 1) || 1)
    const perPageRaw = Number(body.per_page ?? 200) || 200
    const perPage = perPageRaw < 0 ? total || 1 : Math.min(500, Math.max(1, perPageRaw))
    const start = (page - 1) * perPage
    const content = items.slice(start, start + perPage).map(item => fileObject(`${ctx.virtualPath.replace(/\/$/, '')}/${item.name}` || '/', item.name, item.size, item.isDir, item.modified, item.created))
    const permission = mergeRolePermissions(ctx.auth.roles, ctx.virtualPath)
    return ok({ content, total, filtered_total: total, page, per_page: perPage, pages_total: Math.ceil(total / perPage), has_more: start + perPage < total, readme: '', header: '', write: hasPermission(permission, 3), provider: ctx.resolved.storage.driver.toLowerCase() })
  } catch (error: any) { return fail(error.message || 'list failed', error.statusCode ?? 500) }
})
