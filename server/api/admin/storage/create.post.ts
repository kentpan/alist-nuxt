import { fail, ok, requireAdmin } from '../../../utils/auth'
import { useDatabase } from '../../../utils/database'
import { createLocalStorageAdapter, normalizeVirtualPath } from '../../../utils/storage'

export default defineEventHandler(async (event) => {
  const context = await requireAdmin(event)
  if ('error' in context) return fail(context.error, context.code)
  const body = await readBody<{ mount_path?: string; driver?: string; addition?: Record<string, unknown>; order?: number }>(event)
  const driver = String(body?.driver ?? 'local')
  if (driver !== 'local') return fail('Only the local driver is available in the current migration stage', 400)
  const mountPath = normalizeVirtualPath(String(body?.mount_path ?? '/'))
  const addition = body?.addition ?? {}
  const rootPath = String(addition.root_folder_path ?? addition.rootFolderPath ?? '')
  if (!rootPath.trim()) return fail('addition.root_folder_path is required', 400)
  try {
    await createLocalStorageAdapter({ mountPath, rootPath, showHidden: addition.show_hidden === true })
    const now = new Date().toISOString()
    await context.db.run('INSERT INTO Storage (mountPath, driver, addition, "order", disabled, createdAt, updatedAt) VALUES (?, ?, ?, ?, 0, ?, ?)', [mountPath, driver, JSON.stringify(addition), Number(body.order ?? 0), now, now])
    return ok({ mount_path: mountPath, driver })
  } catch (error: any) {
    return fail(error?.message || 'Unable to create storage', 400)
  }
})
