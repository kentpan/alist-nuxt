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
