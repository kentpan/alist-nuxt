import test from 'node:test'
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { createDownloadSignature, verifyDownloadSignature } from '../server/utils/download-sign.ts'

if (!globalThis.crypto) globalThis.crypto = webcrypto

test('signed media URLs are path-bound, expiring and tamper resistant', async () => {
  const secret = 'ci-stage5-signing-secret-with-sufficient-entropy'
  const expires = 2_000_000_000
  const signature = await createDownloadSignature('/local/video.mp4', secret, expires)
  assert.equal(await verifyDownloadSignature('/local/video.mp4', secret, expires, signature, 1_999_999_999), true)
  assert.equal(await verifyDownloadSignature('/local/other.mp4', secret, expires, signature, 1_999_999_999), false)
  assert.equal(await verifyDownloadSignature('/local/video.mp4', secret, expires, signature.slice(0, -1) + 'A', 1_999_999_999), false)
  assert.equal(await verifyDownloadSignature('/local/video.mp4', secret, 1_999_999_998, signature, 1_999_999_999), false)
  assert.equal(await verifyDownloadSignature('/local/video.mp4', secret, 2_100_000_000, signature, 1_999_999_999), false)
})

test('signature verifier rejects malformed encodings, weak secrets and expired boundaries', async () => {
  const secret = 'ci-stage5-signing-secret-with-sufficient-entropy'
  const expires = 2_000_000_000
  const signature = await createDownloadSignature('/local/a.bin', secret, expires)
  assert.equal(await verifyDownloadSignature('/local/a.bin', secret, expires, signature, expires), true)
  assert.equal(await verifyDownloadSignature('/local/a.bin', secret, expires, signature, expires + 1), false)
  assert.equal(await verifyDownloadSignature('/local/a.bin', 'short', expires, signature, expires - 1), false)
  assert.equal(await verifyDownloadSignature('/local/a.bin', secret, expires, 'not-base64-url!', expires - 1), false)
  assert.equal(await verifyDownloadSignature('/local/a.bin', secret, 'NaN', signature, expires - 1), false)
  assert.equal(await verifyDownloadSignature('/local/a.bin', secret, expires + 86401, signature, expires - 1), false)
})

test('signature verifier rejects missing signatures without throwing', async () => {
  assert.equal(await verifyDownloadSignature('/local/file', 'ci-stage5-signing-secret-with-sufficient-entropy', 2_000_000_000, '', 1_999_999_999), false)
})

test('signature is not reusable for another virtual path', async () => {
  const secret = 'ci-stage5-signing-secret-with-sufficient-entropy'
  const expires = 2_000_000_000
  const signature = await createDownloadSignature('/remote/one.txt', secret, expires)
  assert.equal(await verifyDownloadSignature('/remote/two.txt', secret, expires, signature, expires - 1), false)
})

test('signed media URLs enforce the 24 hour maximum lifetime', async () => {
  const secret = 'ci-stage5-signing-secret-with-sufficient-entropy'
  const expires = 2_000_000_000
  const signature = await createDownloadSignature('/local/long-lived.bin', secret, expires)
  assert.equal(await verifyDownloadSignature('/local/long-lived.bin', secret, expires, signature, expires - 86400), true)
  assert.equal(await verifyDownloadSignature('/local/long-lived.bin', secret, expires, signature, expires - 86401), false)
})
