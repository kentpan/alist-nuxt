import type { DatabaseAdapter } from './database.ts'
import { cleanPath, isSubPath } from './auth.ts'
import { createWebDavAdapter } from './drivers/webdav.ts'

export interface StorageFile {
  name: string
  path: string
  size: number
  is_dir: boolean
  modified: string
  created: string
}

export interface LocalStorageAdapter {
  mountPath: string
  list(virtualPath: string): Promise<StorageFile[]>
  get(virtualPath: string): Promise<StorageFile>
  makeDir(virtualPath: string): Promise<void>
  put(virtualPath: string, data: Uint8Array, overwrite?: boolean): Promise<StorageFile>
  putStream(virtualPath: string, readable: any, overwrite?: boolean): Promise<StorageFile>
  rename(virtualPath: string, newName: string): Promise<void>
  move(virtualPath: string, destinationDir: string): Promise<void>
  copy(virtualPath: string, destinationDir: string, overwrite?: boolean): Promise<void>
  remove(virtualPath: string): Promise<void>
  openRead(virtualPath: string): Promise<{ stream: any; file: StorageFile }>
}

export function normalizeVirtualPath(value: string): string {
  if (typeof value !== 'string' || value.includes('\0')) throw new Error('Invalid path')
  const segments = value.replace(/\\/g, '/').split('/').filter(Boolean)
  if (segments.some(part => part === '.' || part === '..')) throw new Error('Path traversal is not allowed')
  return segments.length ? `/${segments.join('/')}` : '/'
}

function isWithinMount(pathValue: string, mountPath: string): boolean {
  return mountPath === '/' || pathValue === mountPath || pathValue.startsWith(`${mountPath}/`)
}

export async function createLocalStorageAdapter(options: {
  mountPath: string
  rootPath: string
  showHidden?: boolean
}): Promise<LocalStorageAdapter> {
  const fs = await import('node:fs/promises')
  const nodeFs = await import('node:fs')
  const path = await import('node:path')
  const mountPath = normalizeVirtualPath(options.mountPath)
  if (!options.rootPath?.trim()) throw new Error('Local storage root_folder_path is required')
  await fs.mkdir(options.rootPath, { recursive: true })
  const root = await fs.realpath(options.rootPath)
  const showHidden = options.showHidden === true

  async function resolve(virtualPath: string): Promise<string> {
    const normalized = normalizeVirtualPath(virtualPath)
    if (!isWithinMount(normalized, mountPath)) throw new Error('Path is outside the storage mount')
    const relative = mountPath === '/' ? normalized.slice(1) : normalized === mountPath ? '' : normalized.slice(mountPath.length + 1)
    const segments = relative ? relative.split('/') : []
    const fullPath = path.resolve(root, ...segments)
    const rel = path.relative(root, fullPath)
    if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) throw new Error('Path traversal is not allowed')
    let cursor = root
    for (const segment of segments) {
      cursor = path.join(cursor, segment)
      try {
        const stat = await fs.lstat(cursor)
        if (stat.isSymbolicLink()) throw new Error('Symbolic links are not supported by the local storage driver')
      } catch (error: any) {
        if (error?.code === 'ENOENT') break
        throw error
      }
    }
    try {
      const real = await fs.realpath(fullPath)
      const relativeReal = path.relative(root, real)
      if (relativeReal === '..' || relativeReal.startsWith(`..${path.sep}`) || path.isAbsolute(relativeReal)) throw new Error('Resolved path escaped the storage root')
    } catch (error: any) {
      if (error?.code !== 'ENOENT') throw error
      const parent = path.dirname(fullPath)
      const realParent = await fs.realpath(parent)
      const relativeParent = path.relative(root, realParent)
      if (relativeParent === '..' || relativeParent.startsWith(`..${path.sep}`) || path.isAbsolute(relativeParent)) throw new Error('Resolved parent escaped the storage root')
    }
    return fullPath
  }

  async function info(virtualPath: string, fullPath?: string): Promise<StorageFile> {
    const target = fullPath ?? await resolve(virtualPath)
    const stat = await fs.lstat(target)
    if (stat.isSymbolicLink()) throw new Error('Symbolic links are not supported by the local storage driver')
    return {
      name: path.basename(target) || '/',
      path: normalizeVirtualPath(virtualPath),
      size: stat.isDirectory() ? 0 : stat.size,
      is_dir: stat.isDirectory(),
      modified: stat.mtime.toISOString(),
      created: stat.birthtime.toISOString()
    }
  }

  return {
    mountPath,
    async list(virtualPath) {
      const directory = await resolve(virtualPath)
      const stat = await fs.stat(directory)
      if (!stat.isDirectory()) throw new Error('Path is not a directory')
      const entries = await fs.readdir(directory, { withFileTypes: true })
      const output: StorageFile[] = []
      for (const entry of entries) {
        if (!showHidden && entry.name.startsWith('.')) continue
        const childPath = normalizeVirtualPath(`${normalizeVirtualPath(virtualPath)}/${entry.name}`)
        try {
          const child = path.join(directory, entry.name)
          const childStat = await fs.lstat(child)
          if (childStat.isSymbolicLink()) continue
          output.push(await info(childPath, child))
        } catch (error: any) {
          if (error?.code !== 'ENOENT') throw error
        }
      }
      output.sort((a, b) => Number(b.is_dir) - Number(a.is_dir) || a.name.localeCompare(b.name))
      return output
    },
    async get(virtualPath) {
      return info(virtualPath)
    },
    async makeDir(virtualPath) {
      const target = await resolve(virtualPath)
      await fs.mkdir(target)
    },
    async put(virtualPath, data, overwrite = false) {
      const target = await resolve(virtualPath)
      await fs.writeFile(target, data, { flag: overwrite ? 'w' : 'wx' })
      return info(virtualPath, target)
    },
    async putStream(virtualPath, readable, overwrite = false) {
      const target = await resolve(virtualPath)
      const temporary = `${target}.upload-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const { pipeline } = await import('node:stream/promises')
      try {
        await pipeline(readable, nodeFs.createWriteStream(temporary, { flags: 'wx' }))
        if (overwrite) {
          await fs.rename(temporary, target)
        } else {
          await fs.link(temporary, target)
          await fs.unlink(temporary)
        }
        return info(virtualPath, target)
      } catch (error) {
        await fs.rm(temporary, { force: true }).catch(() => {})
        throw error
      }
    },
    async rename(virtualPath, newName) {
      if (!newName || newName === '.' || newName === '..' || /[\\/\\0]/.test(newName)) throw new Error('Invalid file name')
      const source = await resolve(virtualPath)
      const destination = path.join(path.dirname(source), newName)
      await resolve(normalizeVirtualPath(`${path.posix.dirname(normalizeVirtualPath(virtualPath))}/${newName}`))
      await fs.rename(source, destination)
    },
    async move(virtualPath, destinationDir) {
      const source = await resolve(virtualPath)
      const destination = await resolve(destinationDir)
      const target = path.join(destination, path.basename(source))
      await resolve(normalizeVirtualPath(`${normalizeVirtualPath(destinationDir)}/${path.basename(source)}`))
      try {
        await fs.rename(source, target)
      } catch (error: any) {
        if (error?.code !== 'EXDEV') throw error
        await fs.cp(source, target, { recursive: true, errorOnExist: true, force: false })
        await fs.rm(source, { recursive: true, force: false })
      }
    },
    async copy(virtualPath, destinationDir, overwrite = false) {
      const source = await resolve(virtualPath)
      const destination = await resolve(destinationDir)
      const target = path.join(destination, path.basename(source))
      await resolve(normalizeVirtualPath(`${normalizeVirtualPath(destinationDir)}/${path.basename(source)}`))
      await fs.cp(source, target, { recursive: true, errorOnExist: !overwrite, force: overwrite })
    },
    async remove(virtualPath) {
      const target = await resolve(virtualPath)
      await fs.rm(target, { recursive: true, force: false })
    },
    async openRead(virtualPath) {
      const target = await resolve(virtualPath)
      const stat = await fs.stat(target)
      if (!stat.isFile()) throw new Error('Path is not a file')
      return { stream: nodeFs.createReadStream(target), file: await info(virtualPath, target) }
    }
  }
}

export async function resolveStorageForPath(db: {
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>
}, virtualPath: string): Promise<LocalStorageAdapter> {
  const normalized = normalizeVirtualPath(virtualPath)
  const storages = await db.all<{ mountPath: string; driver: string; addition: string; disabled: number | boolean }>(
    'SELECT mountPath, driver, addition, disabled FROM Storage WHERE disabled = 0 ORDER BY LENGTH(mountPath) DESC'
  )
  const storage = storages.find(item => {
    const mount = normalizeVirtualPath(item.mountPath)
    return isWithinMount(normalized, mount)
  })
  if (!storage) throw new Error('No enabled storage is mounted at this path')
  if (storage.driver.toLowerCase() !== 'local') throw new Error(`Storage driver "${storage.driver}" is not implemented in this stage`)
  let addition: Record<string, unknown>
  try { addition = JSON.parse(storage.addition || '{}') } catch { throw new Error('Storage addition must be valid JSON') }
  const rootPath = String(addition.root_path ?? addition.rootPath ?? addition.root_folder_path ?? addition.rootFolderPath ?? '')
  return createLocalStorageAdapter({
    mountPath: storage.mountPath,
    rootPath,
    showHidden: addition.show_hidden === true || addition.showHidden === true
  })
}


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
  remote?: ReturnType<typeof createWebDavAdapter>
}

const SUPPORTED_DRIVERS = new Set(['Local', 'local', 'WebDav', 'webdav'])
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
  const rootValue = String(addition.root_path ?? addition.rootPath ?? addition.root_folder_path ?? addition.rootFolderPath ?? '')
  if (!rootValue) throw new StorageError('Local storage requires addition.root_path', 400)
  const { fs, path } = await nodeModules()
  const configuredRoot = path.isAbsolute(rootValue) ? rootValue : path.resolve(process.cwd(), rootValue)
  try {
    await fs.mkdir(configuredRoot, { recursive: true })
    const root = await fs.realpath(configuredRoot)
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
  if (!SUPPORTED_DRIVERS.has(storage.driver) && !SUPPORTED_DRIVERS.has(storage.driver.toLowerCase())) throw new StorageError(`Driver ${storage.driver} is catalogued but not implemented in this runtime`, 501)
  let addition: Record<string, unknown>
  try { addition = JSON.parse(storage.addition || '{}') } catch { throw new StorageError(`Storage ${storage.mountPath} has invalid addition JSON`, 500) }
  const mountPath = normalizeMountPath(storage.mountPath)
  const relativePath = normalized === mountPath ? '' : (mountPath === '/' ? normalized.slice(1) : normalized.slice(mountPath.length).replace(/^\\//, ''))
  if (storage.driver.toLowerCase() === 'webdav') {
    const url = String(addition.url ?? addition.address ?? '')
    if (!url) throw new StorageError('WebDAV storage requires addition.url', 400)
    try {
      const remote = createWebDavAdapter({
        mountPath,
        url,
        username: String(addition.username ?? ''),
        password: String(addition.password ?? '')
      })
      return { storage, virtualPath: normalized, relativePath, rootPath: '', actualPath: '', remote }
    } catch (error: any) {
      throw new StorageError(error.message || 'Invalid WebDAV configuration', 400)
    }
  }
  if (storage.driver.toLowerCase() !== 'local') throw new StorageError(`Driver ${storage.driver} is catalogued but not implemented in this runtime`, 501)
  const rootValue = String(addition.root_path ?? addition.rootPath ?? addition.root_folder_path ?? addition.rootFolderPath ?? '')
  if (!rootValue) throw new StorageError(`Local storage ${storage.mountPath} requires addition.root_path`, 400)
  const { fs, path } = await nodeModules()
  const configuredRoot = path.isAbsolute(rootValue) ? rootValue : path.resolve(process.cwd(), rootValue)
  let rootPath: string
  try {
    rootPath = await fs.realpath(configuredRoot)
    const stat = await fs.stat(rootPath)
    if (!stat.isDirectory()) throw new StorageError('Local storage root_path is not a directory', 400)
  } catch (error) {
    if (error instanceof StorageError) throw error
    throw new StorageError(`Local storage root_path is unavailable: ${rootValue}`, 400)
  }
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
