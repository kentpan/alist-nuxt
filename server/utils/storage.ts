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
  if (storage.driver !== 'local') throw new Error(`Storage driver "${storage.driver}" is not implemented in this stage`)
  let addition: Record<string, unknown>
  try { addition = JSON.parse(storage.addition || '{}') } catch { throw new Error('Storage addition must be valid JSON') }
  const rootPath = String(addition.root_folder_path ?? addition.rootFolderPath ?? '')
  return createLocalStorageAdapter({
    mountPath: storage.mountPath,
    rootPath,
    showHidden: addition.show_hidden === true || addition.showHidden === true
  })
}
