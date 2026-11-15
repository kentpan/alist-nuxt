const encoder = new TextEncoder()

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)
  const binary = atob(base64)
  return Uint8Array.from(binary, char => char.charCodeAt(0))
}

async function hmacKey(secret: string, usage: KeyUsage[]) {
  if (!secret || secret.length < 16) throw new Error('JWT secret must contain at least 16 characters')
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, usage)
}

function message(path: string, expires: number) {
  return encoder.encode(`alist-download-v1\n${path}\n${expires}`)
}

export async function createDownloadSignature(path: string, secret: string, expires: number): Promise<string> {
  const key = await hmacKey(secret, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, message(path, expires))
  return toBase64Url(new Uint8Array(signature))
}

export async function verifyDownloadSignature(path: string, secret: string, expiresValue: unknown, signatureValue: unknown, now = Math.floor(Date.now() / 1000)): Promise<boolean> {
  const expires = Number(expiresValue)
  const signature = String(signatureValue ?? '')
  if (!Number.isSafeInteger(expires) || expires < now || expires > now + 24 * 60 * 60 || !signature) return false
  try {
    const key = await hmacKey(secret, ['verify'])
    return await crypto.subtle.verify('HMAC', key, fromBase64Url(signature), message(path, expires))
  } catch {
    return false
  }
}
