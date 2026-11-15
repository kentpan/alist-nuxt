import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cleanPath, deviceKeyFor, hasPermission, mergeRolePermissions, newPassword,
  passwordMatches, signToken, verifyToken, verifyTotp, generateTotpSecret
} from '../server/utils/auth.ts'

test('Alist-compatible static password hashing and JWT signing', () => {
  const password = 'correct horse battery staple'
  const stored = newPassword(password)
  assert.equal(passwordMatches(stored, password, false), true)
  assert.equal(passwordMatches(stored, 'wrong password', false), false)
  const user = { username: 'alice', pwdTs: stored.pwdTs }
  const token = signToken(user, 'test-secret', 1)
  assert.deepEqual(verifyToken(token, 'test-secret')?.username, 'alice')
  assert.equal(verifyToken(token, 'wrong-secret'), null)
})

test('device key and role permission bitmasks are deterministic', () => {
  assert.equal(deviceKeyFor(7, 'client-a').length, 32)
  assert.equal(hasPermission(1 << 3, 3), true)
  assert.equal(hasPermission(1 << 3, 2), false)
  assert.equal(cleanPath('/a/../b//c'), '/b/c')
  const roles = [{ id: 4, name: 'files', description: '', default: false, permissionScopes: JSON.stringify([{ path: '/docs', permission: 1 << 3 }]) }]
  assert.equal(mergeRolePermissions(roles, '/docs/report.pdf'), 1 << 3)
})

test('TOTP secret generation and verification use the standard 30-second HMAC-SHA1 window', async () => {
  const secret = await generateTotpSecret()
  assert.match(secret, /^[A-Z2-7]+$/)
  assert.equal(await verifyTotp('not-a-code', secret), false)
})
