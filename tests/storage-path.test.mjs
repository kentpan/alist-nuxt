import test from 'node:test'
import assert from 'node:assert/strict'
import { joinUserPath, normalizeMountPath, getFileType, validateNameComponent } from '../server/utils/storage.ts'

test('virtual paths stay inside the user base path', () => {
  assert.equal(joinUserPath('/', '/local/a.txt'), '/local/a.txt')
  assert.equal(joinUserPath('/users/alice', 'docs/a.txt'), '/users/alice/docs/a.txt')
  assert.throws(() => joinUserPath('/users/alice', '../bob/secret'))
  assert.throws(() => joinUserPath('/users/alice', 'docs/../../secret'))
})

test('mount paths are normalized and traversal is rejected', () => {
  assert.equal(normalizeMountPath('/local/'), '/local')
  assert.equal(normalizeMountPath('local'), '/local')
  assert.throws(() => normalizeMountPath('/local/../secret'))
})

test('file type categories match Alist image, video, audio, text and directory groups', () => {
  assert.equal(getFileType('folder', true), 1)
  assert.equal(getFileType('movie.mp4'), 2)
  assert.equal(getFileType('track.mp3'), 3)
  assert.equal(getFileType('readme.md'), 4)
  assert.equal(getFileType('photo.webp'), 5)
  assert.equal(getFileType('unknown.bin'), 0)
})

test('local storage names cannot escape their parent directory', () => {
  for (const name of ['', '.', '..', '../x', 'a/b', 'a\\b']) assert.throws(() => validateNameComponent(name))
  assert.doesNotThrow(() => validateNameComponent('safe-name.txt'))
})
