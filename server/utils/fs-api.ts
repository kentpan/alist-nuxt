import type { H3Event } from 'h3'
import { canReadPath, fail, hasPermission, mergeRolePermissions, requireAuth } from './auth'
import { joinUserPath, resolveStorage, StorageError, type ResolvedStorage } from './storage'

export const FS_PERMISSIONS = { write: 3, rename: 4, move: 5, copy: 6, remove: 7 }

export async function fsContext(event: H3Event, requestPath: string, permissionBit?: number) {
  const auth = await requireAuth(event)
  if ('error' in auth) return { response: fail(auth.error, auth.code) } as const
  let virtualPath: string
  try { virtualPath = joinUserPath(auth.user.basePath || '/', requestPath || '/') }
  catch (error: any) { return { response: fail(error.message, 403) } as const }
  if (!canReadPath(auth.roles, virtualPath)) return { response: fail('permission denied for path', 403) } as const
  if (permissionBit !== undefined && !hasPermission(mergeRolePermissions(auth.roles, virtualPath), permissionBit)) return { response: fail('operation is not permitted for this path', 403) } as const
  try {
    const resolved = await resolveStorage(auth.db, virtualPath, useRuntimeConfig(event).storageCredentialsKey)
    if (!(event as any).node?.req && !resolved.remote) return { response: fail('Local filesystem storage is supported only by the Node runtime', 501) } as const
    return { auth, virtualPath, resolved } as const
  } catch (error: any) {
    if (error instanceof StorageError) return { response: fail(error.message, error.statusCode) } as const
    return { response: fail(error?.message || 'storage resolution failed', 500) } as const
  }
}

export function isFsError(value: any): value is { response: any } {
  return !!value && 'response' in value
}

export function parseFsDate(value: Date): string {
  return value.toISOString()
}

export function fileObject(path: string, name: string, size: number, isDir: boolean, modified: Date, created: Date) {
  return {
    id: path,
    name,
    size,
    is_dir: isDir,
    modified: parseFsDate(modified),
    created: parseFsDate(created),
    sign: '',
    thumb: '',
    type: getFileType(name, isDir),
    hashinfo: '',
    hash_info: {},
    label_list: [],
    path,
    virtual_path: path,
    storage_class: ''
  }
}
import { getFileType } from './storage'

export async function readFsInput(event: H3Event): Promise<any> {
  if (event.method === 'GET' || event.method === 'HEAD') return getQuery(event)
  return await readBody<any>(event).catch(() => getQuery(event))
}
