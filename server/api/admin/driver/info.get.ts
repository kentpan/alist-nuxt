import { fail, ok, requireAdmin } from '../../../utils/auth'
import { driverCatalog } from '../../../utils/driver-catalog'
export default defineEventHandler(async (event) => {
  const context = await requireAdmin(event)
  if ('error' in context) return fail(context.error, context.code)
  const name = String(getQuery(event).driver ?? getQuery(event).name ?? '')
  const driver = driverCatalog.find(item => item.name.toLowerCase() === name.toLowerCase())
  if (!driver) return fail('driver not found', 404)
  if (driver.name === 'Local') return ok({ name: 'Local', supported: true, runtime: 'node', fields: [{ name: 'root_path', type: 'string', required: true }, { name: 'show_hidden', type: 'bool', required: false }] })
  return ok({ name: driver.name, supported: false, runtime: 'pending', source_dir: driver.source_dir, fields: [] })
})
