import type { DatabaseAdapter } from './database.ts'
import { cleanPath, isSubPath } from './auth.ts'

export interface StorageRow {
  id: number
  mountPath: string
  driver: string
  addition: string
  order: number
  disabled: number | boolean
  cacheExpiration: number
  status: string
  remark: string
  modified: string
  disableIndex: number | boolean
  enableSign: number | boolean
  orderBy: string
  orderDirection: string
  extractFolder: string
  webProxy: number | boolean
  webdavPolicy: string
  proxyRange: number | boolean
  downProxyUrl: string
  downProxySign: number | boolean
}

export interface ResolvedStorage {
  storage: StorageRow
  virtualPath: string
  relativePath: string
  rootPath: string
  actualPath: string
}

const SUPPORTED_DRIVERS = new Set(['Local'])
let nodeModulesPromise: Promise<{ fs: typeof import('node:fs/promises'); path: typeof import('node:path') }> | undefined

async function nodeModules() {
  nodeModulesPromise ??= Promise.all([import('node:fs/promises'), import('node:path')]).then(([fs, path]) => ({ fs, path }))
  return nodeModulesPromise
}

export function supportedDriverNames(): string[] {
  return [...SUPPORTED_DRIVERS]
}

export function normalizeMountPath(value: string): string {
  if (String(value).split('/').some(part => part === '..')) throw new Error('mount_path contains an invalid path segment')
  const path = cleanPath(value)
  return path
}

export function joinUserPath(basePath: string, requestPath: string): string {
  const raw = String(requestPath || '/')
  if (raw.split(/[\\/]/).some(part => part === '..')) throw new Error('relative path segments are not allowed')
  const base = cleanPath(basePath || '/')
  const tail = raw.replace(/^[/\\]+/, '')
  const combined = cleanPath(`${base}/${tail}`)
  if (!isSubPath(base, combined)) throw new Error('path is outside the user base path')
  return combined
}

export async function validateLocalAddition(addition: Record<string, unknown>): Promise<void> {
  const rootValue = String(addition.root_path ?? addition.rootPath ?? '')
  if (!rootValue) throw new StorageError('Local storage requires addition.root_path', 400)
  const { fs, path } = await nodeModules()
  if (!path.isAbsolute(rootValue)) throw new StorageError('Local storage root_path must be absolute', 400)
  try {
    const root = await fs.realpath(rootValue)
    if (!(await fs.stat(root)).isDirectory()) throw new StorageError('Local storage root_path is not a directory', 400)
  } catch (error) {
    if (error instanceof StorageError) throw error
    throw new StorageError(`Local storage root_path is unavailable: ${rootValue}`, 400)
  }
}

export async function resolveStorage(db: DatabaseAdapter, virtualPath: string): Promise<ResolvedStorage> {
  const normalized = cleanPath(virtualPath)
  const rows = await db.all<StorageRow>('SELECT * FROM Storage WHERE disabled = 0 ORDER BY LENGTH(mountPath) DESC, "order" ASC, id ASC')
  const storage = rows.find(row => isSubPath(normalizeMountPath(row.mountPath), normalized))
  if (!storage) throw new StorageError(`No enabled storage is mounted at ${normalized}`, 404)
  if (!SUPPORTED_DRIVERS.has(storage.driver)) throw new StorageError(`Driver ${storage.driver} is catalogued but not implemented in this runtime`, 501)
  let addition: Record<string, unknown>
  try { addition = JSON.parse(storage.addition || '{}') } catch { throw new StorageError(`Storage ${storage.mountPath} has invalid addition JSON`, 500) }
  const rootValue = String(addition.root_path ?? addition.rootPath ?? '')
  if (!rootValue) throw new StorageError(`Local storage ${storage.mountPath} requires addition.root_path`, 400)
  const { fs, path } = await nodeModules()
  if (!path.isAbsolute(rootValue)) throw new StorageError('Local storage root_path must be absolute', 400)
  let rootPath: string
  try {
    rootPath = await fs.realpath(rootValue)
    const stat = await fs.stat(rootPath)
    if (!stat.isDirectory()) throw new StorageError('Local storage root_path is not a directory', 400)
  } catch (error) {
    if (error instanceof StorageError) throw error
    throw new StorageError(`Local storage root_path is unavailable: ${rootValue}`, 400)
  }
  const mountPath = normalizeMountPath(storage.mountPath)
  const relativePath = normalized === mountPath ? '' : (mountPath === '/' ? normalized.slice(1) : normalized.slice(mountPath.length).replace(/^\//, ''))
  const actualPath = await safeLocalPath(rootPath, relativePath, true)
  return { storage, virtualPath: normalized, relativePath, rootPath, actualPath }
}

export class StorageError extends Error {
  statusCode: number
  constructor(message: string, statusCode = 400) {
    super(message)
    this.name = 'StorageError'
    this.statusCode = statusCode
  }
}

async function safeLocalPath(rootPath: string, relativePath: string, allowMissing: boolean): Promise<string> {
  const { fs, path } = await nodeModules()
  const target = path.resolve(rootPath, relativePath.replace(/^[/\\]+/, ''))
  if (target !== rootPath && !target.startsWith(`${rootPath}${path.sep}`)) throw new StorageError('Path escapes the storage root', 403)
  let probe = target
  if (allowMissing) {
    while (true) {
      try { probe = await fs.realpath(probe); break }
      catch (error: any) {
        if (error?.code !== 'ENOENT' && error?.code !== 'ENOTDIR') throw error
        const parent = path.dirname(probe)
        if (parent === probe) throw new StorageError('Unable to resolve a safe parent directory', 403)
        probe = parent
      }
    }
  } else {
    probe = await fs.realpath(target)
  }
  if (probe !== rootPath && !probe.startsWith(`${rootPath}${path.sep}`)) throw new StorageError('Symlink escapes the storage root', 403)
  return target
}

export async function localStat(resolved: ResolvedStorage) {
  const { fs } = await nodeModules()
  const actualPath = await safeLocalPath(resolved.rootPath, resolved.relativePath, false)
  return { actualPath, stat: await fs.stat(actualPath) }
}

export async function localList(resolved: ResolvedStorage): Promise<Array<{ name: string; size: number; isDir: boolean; modified: Date; created: Date }>> {
  const { fs, path } = await nodeModules()
  const dirPath = await safeLocalPath(resolved.rootPath, resolved.relativePath, false)
  const addition = JSON.parse(resolved.storage.addition || '{}') as Record<string, unknown>
  const showHidden = addition.show_hidden === true || addition.showHidden === true
  const entries = await fs.readdir(dirPath, { withFileTypes: true })
  const result: Array<{ name: string; size: number; isDir: boolean; modified: Date; created: Date }> = []
  for (const entry of entries) {
    if (!showHidden && entry.name.startsWith('.')) continue
    const childRelative = path.posix.join(resolved.relativePath, entry.name)
    try {
      const childPath = await safeLocalPath(resolved.rootPath, childRelative, false)
      const stat = await fs.stat(childPath)
      result.push({ name: entry.name, size: stat.isDirectory() ? 0 : stat.size, isDir: stat.isDirectory(), modified: stat.mtime, created: stat.birthtime })
    } catch (error: any) {
      if (error?.code === 'ENOENT' || error?.code === 'EACCES') continue
      if (error instanceof StorageError && error.statusCode === 403) continue
      throw error
    }
  }
  const orderBy = resolved.storage.orderBy || 'name'
  const direction = resolved.storage.orderDirection === 'desc' ? -1 : 1
  result.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    let cmp = 0
    if (orderBy === 'size') cmp = a.size - b.size
    else if (orderBy === 'modified') cmp = a.modified.getTime() - b.modified.getTime()
    else cmp = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    return cmp * direction
  })
  return result
}

export async function localMkdir(resolved: ResolvedStorage): Promise<void> {
  const { fs } = await nodeModules()
  const target = await safeLocalPath(resolved.rootPath, resolved.relativePath, true)
  await fs.mkdir(target, { recursive: false })
}

export async function localRename(resolved: ResolvedStorage, newName: string, overwrite = false): Promise<void> {
  const { fs, path } = await nodeModules()
  validateNameComponent(newName)
  if (resolved.relativePath && resolved.relativePath.split('/').pop() === newName) return
  if (!resolved.relativePath) throw new StorageError('cannot rename a storage root', 403)
  const source = await safeLocalPath(resolved.rootPath, resolved.relativePath, false)
  const destinationRelative = path.posix.join(path.posix.dirname(resolved.relativePath), newName)
  const destination = await safeLocalPath(resolved.rootPath, destinationRelative, true)
  if (!overwrite) {
    try { await fs.lstat(destination); throw new StorageError(`file [${newName}] exists`, 409) }
    catch (error: any) { if (error?.code !== 'ENOENT') throw error }
  }
  if (overwrite) await fs.rm(destination, { recursive: true, force: true })
  await fs.rename(source, destination)
}

export async function localMove(db: DatabaseAdapter, sourcePath: string, destinationDir: string, name: string, overwrite = false): Promise<void> {
  const { fs, path } = await nodeModules()
  validateNameComponent(name)
  const source = await resolveStorage(db, sourcePath)
  const destination = await resolveStorage(db, path.posix.join(destinationDir, name))
  if (source.storage.id !== destination.storage.id) {
    await localCopy(db, sourcePath, destinationDir, name, overwrite)
    await localRemove(source)
    return
  }
  if (!source.relativePath) throw new StorageError('cannot copy a storage root', 403)
  const src = await safeLocalPath(source.rootPath, source.relativePath, false)
  const dst = await safeLocalPath(destination.rootPath, destination.relativePath, true)
  if (!overwrite) {
    try { await fs.lstat(dst); throw new StorageError(`file [${name}] exists`, 409) }
    catch (error: any) { if (error?.code !== 'ENOENT') throw error }
  }
  if (overwrite) await fs.rm(dst, { recursive: true, force: true })
  await fs.rename(src, dst)
}

export async function localCopy(db: DatabaseAdapter, sourcePath: string, destinationDir: string, name: string, overwrite = false): Promise<void> {
  const { fs, path } = await nodeModules()
  validateNameComponent(name)
  const source = await resolveStorage(db, sourcePath)
  const destination = await resolveStorage(db, path.posix.join(destinationDir, name))
  if (!source.relativePath) throw new StorageError('cannot copy a storage root', 403)
  const src = await safeLocalPath(source.rootPath, source.relativePath, false)
  const dst = await safeLocalPath(destination.rootPath, destination.relativePath, true)
  if (!overwrite) {
    try { await fs.lstat(dst); throw new StorageError(`file [${name}] exists`, 409) }
    catch (error: any) { if (error?.code !== 'ENOENT') throw error }
  }
  if (overwrite) await fs.rm(dst, { recursive: true, force: true })
  await fs.cp(src, dst, { recursive: true, errorOnExist: !overwrite, force: overwrite, dereference: false })
}

export async function localRemove(resolved: ResolvedStorage): Promise<void> {
  const { fs } = await nodeModules()
  if (!resolved.relativePath) throw new StorageError('cannot remove a storage root', 403)
  const target = await safeLocalPath(resolved.rootPath, resolved.relativePath, false)
  await fs.rm(target, { recursive: true, force: false })
}

export async function localWritePath(resolved: ResolvedStorage): Promise<string> {
  return safeLocalPath(resolved.rootPath, resolved.relativePath, true)
}

export async function localReadPath(resolved: ResolvedStorage): Promise<string> {
  const { actualPath } = await localStat(resolved)
  return actualPath
}

export async function localSearch(resolved: ResolvedStorage, keyword: string, maxResults = 500) {
  const { fs, path } = await nodeModules()
  const root = await safeLocalPath(resolved.rootPath, resolved.relativePath, false)
  const found: Array<{ path: string; name: string; size: number; is_dir: boolean; modified: Date }> = []
  const addition = JSON.parse(resolved.storage.addition || '{}') as Record<string, unknown>
  const showHidden = addition.show_hidden === true || addition.showHidden === true
  const queue = [root]
  while (queue.length && found.length < maxResults) {
    const current = queue.shift()!
    const entries = await fs.readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      const child = path.join(current, entry.name)
      const rel = path.relative(resolved.rootPath, child).split(path.sep).join('/')
      const virtual = path.posix.join(resolved.storage.mountPath, rel)
      if (!showHidden && entry.name.startsWith('.')) continue
      if (entry.isDirectory()) queue.push(child)
      if (entry.name.toLowerCase().includes(keyword.toLowerCase())) {
        try {
          const safe = await safeLocalPath(resolved.rootPath, rel, false)
          const stat = await fs.stat(safe)
          found.push({ path: virtual, name: entry.name, size: stat.isDirectory() ? 0 : stat.size, is_dir: stat.isDirectory(), modified: stat.mtime })
          if (found.length >= maxResults) break
        } catch { /* ignore inaccessible entries */ }
      }
    }
  }
  return found
}

export function validateNameComponent(name: string): void {
  if (!name || name === '.' || name === '..' || /[\\/\0]/.test(name)) throw new StorageError('invalid name component', 400)
}

export function getFileType(name: string, isDir = false): number {
  if (isDir) return 1
  const ext = name.toLowerCase().split('.').pop() || ''
  if (['mp4','mkv','avi','mov','wmv','flv','webm','m4v','mpeg','mpg'].includes(ext)) return 2
  if (['mp3','flac','wav','aac','m4a','ogg','opus','wma'].includes(ext)) return 3
  if (['txt','md','json','xml','yaml','yml','csv','log','ini','js','ts','css','html','sh','py','go','rs'].includes(ext)) return 4
  if (['jpg','jpeg','png','gif','bmp','webp','svg','heic','tif','tiff','avif'].includes(ext)) return 5
  return 0
}

export function encodeVirtualPath(value: string): string {
  return value.split('/').map(segment => encodeURIComponent(segment)).join('/')
}
