import { fail, ok, requireAdmin } from '../../../utils/auth'
import { driverCatalog } from '../../../utils/driver-catalog'
export default defineEventHandler(async (event) => {
  const context = await requireAdmin(event)
  if ('error' in context) return fail(context.error, context.code)
  return ok(driverCatalog.map(item => item.name))
})
