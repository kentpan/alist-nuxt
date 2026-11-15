import { fail, ok, requireAdmin } from '../../../utils/auth'
import { driverCatalog } from '../../../utils/driver-catalog'
const localInfo = {
  config: { name: 'Local', only_local: true, description: 'Local filesystem storage; available only in Node.js runtime.' },
  common: ['mount_path', 'order', 'remark', 'cache_expiration', 'web_proxy', 'webdav_policy', 'down_proxy_url'],
  additional: [
    { name: 'root_path', type: 'string', required: true, default: '', description: 'Absolute directory path confined to the configured local storage root.' },
    { name: 'show_hidden', type: 'bool', required: false, default: false, description: 'Whether hidden files and directories are visible.' }
  ],
  supported: true,
  runtime: 'node'
}
const webDavInfo = {
  config: { name: 'WebDav', description: 'Remote WebDAV storage using the platform fetch API.' },
  common: ['mount_path', 'order', 'remark', 'cache_expiration', 'webdav_policy'],
  additional: [
    { name: 'url', type: 'string', required: true, default: '', description: 'HTTPS WebDAV collection endpoint.' },
    { name: 'username', type: 'string', required: false, default: '', description: 'WebDAV username.' },
    { name: 'password', type: 'password', required: false, default: '', description: 'WebDAV password; stored in storage configuration JSON.' }
  ],
  supported: true,
  runtime: 'node-edge'
}
export default defineEventHandler(async (event) => {
  const context = await requireAdmin(event)
  if ('error' in context) return fail(context.error, context.code)
  const items = driverCatalog.map(driver => [driver.name, driver.name === 'Local' ? localInfo : driver.name === 'WebDav' ? webDavInfo : {
    config: { name: driver.name, description: `Catalogued from the pinned Alist backend source (${driver.source_dir}).` },
    common: ['mount_path', 'order', 'remark'],
    additional: [],
    supported: false,
    runtime: 'pending'
  }])
  return ok(Object.fromEntries(items))
})
