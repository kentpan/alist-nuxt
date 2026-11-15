import { createDatabase } from '../server/utils/database.ts'
import { newPassword } from '../server/utils/auth.ts'

const databasePath = process.env.DATABASE_PATH || './data/alist-nuxt.db'
const db = await createDatabase({ databasePath })
const now = new Date().toISOString()

await db.run('INSERT OR IGNORE INTO Role (id, name, description, "default", permissionScopes) VALUES (1, ?, ?, 0, ?)', ['guest', 'Built-in guest role', JSON.stringify([{ path: '/', permission: 0 }])])
await db.run('INSERT OR IGNORE INTO Role (id, name, description, "default", permissionScopes) VALUES (2, ?, ?, 0, ?)', ['admin', 'Built-in administrator role', JSON.stringify([{ path: '/', permission: 65535 }])])
await db.run('INSERT OR IGNORE INTO Role (id, name, description, "default", permissionScopes) VALUES (3, ?, ?, 1, ?)', ['user', 'Default registered user role', JSON.stringify([{ path: '/', permission: 0 }])])
await db.run('INSERT OR IGNORE INTO User (username, passwordHash, role, pwdTs, salt, basePath, roles, permission, otpSecret, ssoId, authn, disabled, createdAt, updatedAt) VALUES (?, ?, ?, 0, ?, char(47), ?, 0, char(), char(), json_array(), 0, ?, ?)', ['guest', '', 'guest', '', '[1]', now, now])

const adminUsername = process.env.BOOTSTRAP_ADMIN_USERNAME || 'admin'
const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD || ''
if (adminPassword && adminPassword !== 'change-this-password-before-first-run') {
  const existing = await db.first<{ id: number }>('SELECT id FROM User WHERE username = ?', [adminUsername])
  if (!existing) {
    const password = newPassword(adminPassword)
    await db.run('INSERT INTO User (username, passwordHash, role, pwdTs, salt, basePath, roles, permission, otpSecret, ssoId, authn, disabled, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, char(47), ?, 65535, char(), char(), json_array(), 0, ?, ?)', [adminUsername, password.passwordHash, 'admin', password.pwdTs, password.salt, '[2]', now, now])
    process.stdout.write(`Created bootstrap administrator: ${adminUsername}\n`)
  } else {
    process.stdout.write(`Administrator ${adminUsername} already exists; leaving credentials unchanged.\n`)
  }
} else {
  process.stdout.write('No bootstrap administrator created. Set BOOTSTRAP_ADMIN_PASSWORD in your local .env, then rerun npm run db:seed.\n')
}

const settings = [
  ['allow_register', process.env.ALLOW_REGISTER === 'true' ? 'true' : 'false', 0],
  ['token_expires_in', process.env.TOKEN_EXPIRES_IN || '48', 1],
  ['max_devices', '0', 1],
  ['device_session_ttl', '86400', 1],
  ['device_evict_policy', 'deny', 1],
  ['default_role', '3', 1]
]
for (const [key, value, flag] of settings) {
  await db.run('INSERT OR IGNORE INTO Setting (key, value, updatedAt, flag) VALUES (?, ?, ?, ?)', [key, value, now, flag])
}
process.stdout.write('Core Alist roles, guest account, and default settings are ready.\n')
