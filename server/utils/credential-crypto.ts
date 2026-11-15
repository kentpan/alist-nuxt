const PREFIX = 'enc:v1:'
const encoder = new TextEncoder()
const decoder = new TextDecoder()

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4))
  return Uint8Array.from(binary, char => char.charCodeAt(0))
}

async function encryptionKey(secret: string): Promise<CryptoKey> {
  if (!secret || secret.length < 32) throw new Error('STORAGE_CREDENTIALS_KEY must contain at least 32 characters before storing WebDAV credentials')
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(secret))
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

export async function encryptCredential(value: string, secret: string): Promise<string> {
  if (!value || value.startsWith(PREFIX)) return value
  const key = await encryptionKey(secret)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(value))
  return `${PREFIX}${encodeBase64Url(iv)}:${encodeBase64Url(new Uint8Array(ciphertext))}`
}

export async function decryptCredential(value: string, secret: string): Promise<string> {
  if (!value || !value.startsWith(PREFIX)) return value
  const parts = value.slice(PREFIX.length).split(':')
  if (parts.length !== 2) throw new Error('Stored WebDAV credential has an invalid encrypted format')
  const key = await encryptionKey(secret)
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decodeBase64Url(parts[0]!) }, key, decodeBase64Url(parts[1]!))
  return decoder.decode(plaintext)
}

export async function protectWebDavAddition(addition: Record<string, unknown>, secret: string): Promise<Record<string, unknown>> {
  const username = String(addition.username ?? '')
  const password = String(addition.password ?? '')
  if (!username && !password) return { ...addition }
  if (!secret || secret.length < 32) throw new Error('Set NUXT_STORAGE_CREDENTIALS_KEY to a random secret of at least 32 characters before saving WebDAV credentials')
  return {
    ...addition,
    ...(username ? { username: await encryptCredential(username, secret) } : {}),
    ...(password ? { password: await encryptCredential(password, secret) } : {})
  }
}

export async function revealWebDavAddition(addition: Record<string, unknown>, secret: string): Promise<Record<string, unknown>> {
  const username = String(addition.username ?? '')
  const password = String(addition.password ?? '')
  return {
    ...addition,
    ...(username ? { username: await decryptCredential(username, secret) } : {}),
    ...(password ? { password: await decryptCredential(password, secret) } : {})
  }
}
