import test from 'node:test'
import assert from 'node:assert/strict'
import { decryptCredential, encryptCredential, protectWebDavAddition, revealWebDavAddition, rotateWebDavAddition } from '../server/utils/credential-crypto.ts'

const secret = 'stage6-test-only-key-with-at-least-32-characters'

test('WebDAV credentials are encrypted with AES-GCM and round-trip', async () => {
  const protectedAddition = await protectWebDavAddition({ url: 'https://dav.example/root', username: 'alice', password: 's3cret' }, secret)
  assert.match(String(protectedAddition.username), /^enc:v1:/)
  assert.match(String(protectedAddition.password), /^enc:v1:/)
  assert.notEqual(protectedAddition.username, 'alice')
  assert.notEqual(protectedAddition.password, 's3cret')
  const revealed = await revealWebDavAddition(protectedAddition, secret)
  assert.equal(revealed.username, 'alice')
  assert.equal(revealed.password, 's3cret')
})

test('credential encryption is idempotent and leaves empty and legacy fields unchanged', async () => {
  const encrypted = await encryptCredential('secret-value', secret)
  assert.equal(await encryptCredential(encrypted, secret), encrypted)
  assert.equal(await decryptCredential('', secret), '')
  assert.equal(await decryptCredential('legacy-plaintext', secret), 'legacy-plaintext')
  const addition = await protectWebDavAddition({ url: 'https://dav.example/root', username: '', password: '' }, '')
  assert.equal(addition.password, '')
})

test('credential encryption requires a strong configured key and authenticates ciphertext', async () => {
  await assert.rejects(encryptCredential('secret-value', ''), /at least 32 characters/)
  const encrypted = await encryptCredential('secret-value', secret)
  await assert.rejects(decryptCredential(encrypted, 'wrong-key-that-is-long-enough-for-aes-gcm'), /decrypt|operation|tag/i)
})

test('WebDAV credentials can be rotated from a legacy plaintext or old AES-GCM key', async () => {
  const oldKey = 'stage6-old-key-with-at-least-32-characters-long'
  const newKey = 'stage6-new-key-with-at-least-32-characters-long'
  const oldAddition = await protectWebDavAddition({ username: 'old-user', password: 'old-password' }, oldKey)
  const rotated = await rotateWebDavAddition(oldAddition, oldKey, newKey)
  assert.notEqual(rotated.password, oldAddition.password)
  assert.equal((await revealWebDavAddition(rotated, newKey)).password, 'old-password')
  await assert.rejects(revealWebDavAddition(rotated, oldKey), /decrypt|operation|tag/i)
  const migratedLegacy = await rotateWebDavAddition({ username: 'legacy-user', password: 'legacy-password' }, '', newKey)
  assert.equal((await revealWebDavAddition(migratedLegacy, newKey)).username, 'legacy-user')
})
