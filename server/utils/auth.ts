import type { H3Event } from 'h3'
import CryptoJS from 'crypto-js'
import QRCode from 'qrcode'
import type { DatabaseAdapter } from './database.ts'
import { useDatabase } from './database.ts'

export const STATIC_HASH_SALT = 'https://github.com/alist-org/alist'
export const ROLE_GUEST = 1
export const ROLE_ADMIN = 2

export interface UserRow {
  id: number
  username: string
  passwordHash: string
  legacyRole: string
  pwdTs: number
  salt: string
  basePath: string
  roles: string
  permission: number
  otpSecret: string
  ssoId: string
  authn: string
  disabled: number | boolean
  createdAt: string
  updatedAt: string
}
export interface PermissionEntry { path: string; permission: number }
export interface RoleRow {
  id: number
  name: string
  description: string
  default: number | boolean
  permissionScopes: string
}
export interface AuthContext {
  db: DatabaseAdapter
  user: UserRow
  roles: RoleRow[]
  token: string
  deviceKey: string
  isGuest: boolean
  isAdmin: boolean
}

export function ok(data: unknown = null, message = 'success') {
  return { code: 200, message, data }
}
export function fail(message: string, code = 400, data: unknown = null) {
  return { code, message, data }
}

export function sha256(value: string): string {
  return CryptoJS.SHA256(value).toString(CryptoJS.enc.Hex)
}
export function staticHash(password: string): string {
  return sha256(`${password}-${STATIC_HASH_SALT}`)
}
export function hashPassword(staticPasswordHash: string, salt: string): string {
  return sha256(`${staticPasswordHash}-${salt}`)
}
export function passwordMatches(user: Pick<UserRow, 'passwordHash' | 'salt'>, supplied: string, alreadyHashed: boolean): boolean {
  if (!supplied) return false
  const staticValue = alreadyHashed ? supplied : staticHash(supplied)
  return constantTimeEqual(hashPassword(staticValue, user.salt), user.passwordHash)
}
export function randomString(length = 16): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, byte => alphabet[byte % alphabet.length]).join('')
}
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
function base64url(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}
function fromBase64url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4))
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}
export function signToken(user: Pick<UserRow, 'username' | 'pwdTs'>, secret: string, expiresHours = 48): string {
  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = base64url(JSON.stringify({ username: user.username, pwd_ts: user.pwdTs, iat: now, nbf: now, exp: now + expiresHours * 3600 }))
  const input = `${header}.${payload}`
  const signature = CryptoJS.HmacSHA256(input, secret).toString(CryptoJS.enc.Base64).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `${input}.${signature}`
}
export function verifyToken(token: string, secret: string): { username: string; pwd_ts: number; exp: number } | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const input = `${parts[0]!}.${parts[1]!}`
  const expected = CryptoJS.HmacSHA256(input, secret).toString(CryptoJS.enc.Base64).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  if (!constantTimeEqual(expected, parts[2]!)) return null
  try {
    const payload = JSON.parse(fromBase64url(parts[1]!))
    const now = Math.floor(Date.now() / 1000)
    if (!payload.username || !Number.isInteger(payload.exp) || payload.exp <= now || (payload.nbf && payload.nbf > now)) return null
    return { username: String(payload.username), pwd_ts: Number(payload.pwd_ts ?? 0), exp: Number(payload.exp) }
  } catch {
    return null
  }
}

export function deviceKeyFor(userId: number, clientId: string): string {
  return CryptoJS.MD5(`${userId}-${clientId}`).toString(CryptoJS.enc.Hex)
}
function maskIp(ip: string): string {
  if (ip.includes('.')) return ip.replace(/\.\d+$/, '.0')
  if (ip === '::1' || ip === '::') return '::'
  if (ip.includes(':')) return `${ip.split(':').slice(0, 4).join(':')}::`
  return ip
}

export function hasPermission(permission: number, bit: number): boolean {
  return ((permission >> bit) & 1) === 1
}
function parseRoles(value: string): number[] {
  try { const roles = JSON.parse(value); return Array.isArray(roles) ? roles.map(Number).filter(Number.isFinite) : [] } catch { return [] }
}
export function parsePermissionScopes(role: RoleRow): PermissionEntry[] {
  try {
    const value = JSON.parse(role.permissionScopes || '[]')
    return Array.isArray(value) ? value.filter(x => x && typeof x.path === 'string').map(x => ({ path: cleanPath(x.path), permission: Number(x.permission) || 0 })) : []
  } catch { return [] }
}
export function cleanPath(path: string): string {
  const parts: string[] = []
  for (const part of `/${path}`.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return `/${parts.join('/')}`
}
export function isSubPath(parent: string, child: string): boolean {
  const p = cleanPath(parent)
  const c = cleanPath(child)
  return p === '/' || c === p || c.startsWith(`${p}/`)
}
export function mergeRolePermissions(roles: RoleRow[], path: string): number {
  let permission = 0
  for (const role of roles) for (const scope of parsePermissionScopes(role)) if (isSubPath(scope.path, path)) permission |= scope.permission
  return permission
}
export function canReadPath(roles: RoleRow[], path: string): boolean {
  const target = cleanPath(path)
  if (target === '/') return roles.length > 0
  return roles.some(role => parsePermissionScopes(role).some(scope => isSubPath(scope.path, target) || isSubPath(target, scope.path)))
}

async function loadRoles(db: DatabaseAdapter, user: UserRow): Promise<RoleRow[]> {
  const ids = parseRoles(user.roles)
  if (!ids.length) return []
  const placeholders = ids.map(() => '?').join(',')
  const rows = await db.all<RoleRow>(`SELECT * FROM Role WHERE id IN (${placeholders})`, ids)
  const byId = new Map(rows.map(role => [role.id, role]))
  return ids.map(id => byId.get(id)).filter((role): role is RoleRow => !!role)
}

async function getSetting(db: DatabaseAdapter, key: string, fallback = ''): Promise<string> {
  const row = await db.first<{ value: string }>('SELECT value FROM Setting WHERE key = ?', [key])
  return row?.value ?? fallback
}

export async function ensureSession(db: DatabaseAdapter, user: UserRow, key: string, userAgent: string, ip: string, loginFlow: boolean): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000)
  const ttl = Number(await getSetting(db, 'device_session_ttl', '86400')) || 0
  if (ttl > 0) await db.run('DELETE FROM Session WHERE lastActive < ?', [now - ttl])
  const existing = await db.first<{ status: number }>('SELECT status FROM Session WHERE deviceKey = ? AND userId = ?', [key, user.id])
  if (existing && !loginFlow && existing.status === 1) return 'session is inactive, login please'
  if (!existing || existing.status === 1) {
    const maxDevices = Number(await getSetting(db, 'max_devices', '0')) || 0
    if (maxDevices > 0) {
      const count = await db.first<{ count: number }>('SELECT COUNT(*) as count FROM Session WHERE userId = ? AND status = 0', [user.id])
      if ((count?.count ?? 0) >= maxDevices) {
        const policy = await getSetting(db, 'device_evict_policy', 'deny')
        if (policy !== 'evict_oldest') return 'too many devices'
        const oldest = await db.first<{ deviceKey: string }>('SELECT deviceKey FROM Session WHERE userId = ? AND status = 0 ORDER BY lastActive ASC LIMIT 1', [user.id])
        if (oldest) await db.run('UPDATE Session SET status = 1 WHERE deviceKey = ?', [oldest.deviceKey])
      }
    }
  }
  if (existing) {
    await db.run('UPDATE Session SET status = 0, lastActive = ?, userAgent = ?, ip = ? WHERE deviceKey = ?', [now, userAgent.slice(0, 255), ip.slice(0, 64), key])
  } else {
    await db.run('INSERT INTO Session (userId, deviceKey, userAgent, ip, lastActive, status) VALUES (?, ?, ?, ?, ?, 0)', [user.id, key, userAgent.slice(0, 255), ip.slice(0, 64), now])
  }
  return null
}

export async function getAuthContext(event: H3Event, options: { loginFlow?: boolean; allowGuest?: boolean } = {}): Promise<AuthContext | { error: string; code: number }> {
  const db = await useDatabase(event)
  let token = getHeader(event, 'authorization') ?? ''
  if (token.startsWith('Bearer ')) token = token.slice(7)
  const adminToken = await getSetting(db, 'token', String(useRuntimeConfig(event).adminToken || ''))
  let user: UserRow | null = null
  if (token && adminToken && constantTimeEqual(token, adminToken)) {
    user = await db.first<UserRow>('SELECT * FROM User WHERE username = ?', ['admin'])
  } else if (!token) {
    user = await db.first<UserRow>('SELECT * FROM User WHERE username = ?', ['guest'])
    if (!user) return { error: 'Guest user is not initialized', code: 401 }
    if (user.disabled) return { error: 'Guest user is disabled, login please', code: 401 }
  } else {
    const secret = String(useRuntimeConfig(event).jwtSecret || '')
    if (!secret) return { error: 'JWT secret is not configured', code: 500 }
    const claims = verifyToken(token, secret)
    if (!claims) return { error: 'invalid token', code: 401 }
    const revoked = await db.first('SELECT tokenHash FROM RevokedToken WHERE tokenHash = ?', [sha256(token)])
    if (revoked) return { error: 'token is invalidated', code: 401 }
    user = await db.first<UserRow>('SELECT * FROM User WHERE username = ?', [claims.username])
    if (!user || user.pwdTs !== claims.pwd_ts) return { error: 'Password has been changed, login please', code: 401 }
    if (user.disabled) return { error: 'Current user is disabled, replace please', code: 401 }
  }
  if (!user) return { error: 'unauthorized', code: 401 }
  const roles = await loadRoles(db, user)
  const clientId = getHeader(event, 'client-id') || getQuery(event).client_id?.toString() || ''
  const deviceKey = deviceKeyFor(user.id, clientId)
  const ip = maskIp(getRequestIP(event, { xForwardedFor: true }) || '')
  await db.run('DELETE FROM RevokedToken WHERE expiresAt < ?', [Math.floor(Date.now() / 1000)])
  const sessionError = await ensureSession(db, user, deviceKey, getHeader(event, 'user-agent') || '', ip, !!options.loginFlow)
  if (sessionError) return { error: sessionError, code: sessionError === 'too many devices' ? 403 : 401 }
  return { db, user, roles, token, deviceKey, isGuest: roles.some(role => role.id === ROLE_GUEST || role.name === 'guest'), isAdmin: roles.some(role => role.id === ROLE_ADMIN || role.name === 'admin') }
}

export async function requireAuth(event: H3Event, opts: { allowGuest?: boolean } = {}): Promise<AuthContext | { error: string; code: number }> {
  const context = await getAuthContext(event, { allowGuest: opts.allowGuest })
  if ('error' in context) return context
  if (opts.allowGuest === false && context.isGuest) return { error: 'You are a guest', code: 403 }
  return context
}
export async function requireAdmin(event: H3Event): Promise<AuthContext | { error: string; code: number }> {
  const context = await requireAuth(event, { allowGuest: false })
  if ('error' in context) return context
  if (!context.isAdmin) return { error: 'You are not an admin', code: 403 }
  return context
}

export function newPassword(password: string) {
  const salt = randomString(16)
  return { salt, passwordHash: hashPassword(staticHash(password), salt), pwdTs: Math.floor(Date.now() / 1000) }
}

function decodeBase32(value: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = 0, buffer = 0
  const out: number[] = []
  for (const char of value.toUpperCase().replace(/=+$/g, '').replace(/\s/g, '')) {
    const idx = alphabet.indexOf(char)
    if (idx < 0) continue
    buffer = (buffer << 5) | idx
    bits += 5
    if (bits >= 8) { bits -= 8; out.push((buffer >> bits) & 255) }
  }
  return new Uint8Array(out)
}
function encodeBase32(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = 0, buffer = 0, out = ''
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte
    bits += 8
    while (bits >= 5) { bits -= 5; out += alphabet[(buffer >> bits) & 31] }
  }
  if (bits > 0) out += alphabet[(buffer << (5 - bits)) & 31]
  return out
}
export async function generateTotpSecret(): Promise<string> {
  const bytes = new Uint8Array(20)
  crypto.getRandomValues(bytes)
  return encodeBase32(bytes)
}
export async function verifyTotp(code: string, secret: string): Promise<boolean> {
  if (!/^\d{6}$/.test(code)) return false
  const key = await crypto.subtle.importKey('raw', decodeBase32(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  const now = Math.floor(Date.now() / 30000)
  for (let drift = -1; drift <= 1; drift++) {
    const counter = now + drift
    const msg = new Uint8Array(8)
    let n = counter
    for (let i = 7; i >= 0; i--) { msg[i] = n & 255; n = Math.floor(n / 256) }
    const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg))
    const offset = digest[digest.length - 1]! & 0x0f
    const binary = ((digest[offset]! & 0x7f) << 24) | ((digest[offset + 1]! & 0xff) << 16) | ((digest[offset + 2]! & 0xff) << 8) | (digest[offset + 3]! & 0xff)
    if ((binary % 1_000_000).toString().padStart(6, '0') === code) return true
  }
  return false
}
export async function createTotpQr(username: string, secret: string): Promise<string> {
  const label = encodeURIComponent(`Alist:${username}`)
  const uri = `otpauth://totp/${label}?secret=${secret}&issuer=Alist&algorithm=SHA1&digits=6&period=30`
  return QRCode.toDataURL(uri, { width: 400, margin: 2 })
}

export async function revokeToken(db: DatabaseAdapter, token: string) {
  if (!token) return
  const claims = token.split('.')[1]
  let exp = Math.floor(Date.now() / 1000) + 48 * 3600
  try { exp = Number(JSON.parse(fromBase64url(claims ?? '')).exp) || exp } catch { /* malformed token: retain short revocation */ }
  await db.run('INSERT OR REPLACE INTO RevokedToken (tokenHash, expiresAt) VALUES (?, ?)', [sha256(token), exp])
}

export async function getCurrentUserPayload(context: AuthContext) {
  const { user, roles } = context
  const permissions = new Map<string, number>()
  for (const role of roles) for (const scope of parsePermissionScopes(role)) permissions.set(scope.path, (permissions.get(scope.path) ?? 0) | scope.permission)
  return {
    id: user.id,
    username: user.username,
    password: '',
    base_path: user.basePath,
    role: parseRoles(user.roles),
    permission: user.permission,
    disabled: !!user.disabled,
    sso_id: user.ssoId,
    otp: !!user.otpSecret,
    role_names: roles.map(role => role.name),
    permissions: [...permissions].map(([path, permission]) => ({ path, permission }))
  }
}
