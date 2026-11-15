import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const base = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000'
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
const pageErrors = []
page.on('pageerror', error => pageErrors.push(error.message))

try {
  await page.goto(base, { waitUntil: 'networkidle' })
  await page.locator('input[autocomplete="username"]').fill('admin')
  await page.locator('input[autocomplete="current-password"]').fill(process.env.BOOTSTRAP_ADMIN_PASSWORD || '')
  await page.getByRole('button', { name: '登录' }).click()
  await page.getByText('文件管理', { exact: true }).waitFor({ timeout: 10000 })

  page.once('dialog', dialog => dialog.accept('browser-test-folder'))
  await page.getByRole('button', { name: '新建文件夹' }).click()
  try {
    await page.getByText('browser-test-folder', { exact: true }).waitFor({ timeout: 5000 })
  } catch {
    throw new Error(`Folder creation did not appear in the file list. UI text: ${await page.locator('body').innerText()}`)
  }

  await page.locator('input[type="file"]').setInputFiles({
    name: 'browser-test.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Browser interaction test')
  })
  await page.getByText('browser-test.txt', { exact: true }).waitFor()

  await page.getByText('browser-test.txt', { exact: true }).click()
  await page.getByText('文件预览：browser-test.txt', { exact: true }).waitFor({ timeout: 10000 })
  await page.getByText('Browser interaction test', { exact: true }).waitFor({ timeout: 10000 })
  await page.getByLabel('新名称').fill('browser-renamed.txt')
  await page.getByRole('button', { name: '重命名' }).click()
  await page.getByText('browser-renamed.txt', { exact: true }).waitFor()
  await page.getByRole('button', { name: '选择' }).last().click()

  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: '删除' }).click()
  await page.getByText('browser-renamed.txt', { exact: true }).waitFor({ state: 'detached' })

  const authToken = await page.evaluate(() => {
    const entry = document.cookie.split('; ').find(value => value.startsWith('alist_token='))
    return entry ? decodeURIComponent(entry.slice('alist_token='.length)) : ''
  })
  assert.ok(authToken, 'Alist auth cookie should be available for admin storage API')
  const storageList = await page.evaluate(async token => {
    const response = await fetch('/api/admin/storage/list', { headers: { authorization: token } })
    return response.json()
  }, authToken)
  const localStorage = storageList.data?.content?.find(item => item.mount_path === '/local')
  assert.ok(localStorage?.id, 'seeded Local storage should be listed')
  const deleted = await page.evaluate(async ({ token, id }) => {
    const response = await fetch('/api/admin/storage/delete', {
      method: 'POST',
      headers: { authorization: token, 'content-type': 'application/json' },
      body: JSON.stringify({ id })
    })
    return response.json()
  }, { token: authToken, id: localStorage.id })
  assert.equal(deleted.code, 200, JSON.stringify(deleted))
  await page.getByRole('button', { name: '刷新' }).click()
  await page.getByText('还没有配置存储', { exact: true }).waitFor()
  await page.locator('select').selectOption('WebDav')
  await page.getByLabel('WebDAV 地址（HTTPS）').fill('https://dav.example.invalid/remote.php/dav/')
  await page.getByLabel('用户名').fill('browser-test-user')
  await page.getByLabel('密码').fill('browser-test-password')
  assert.equal(await page.locator('select').inputValue(), 'WebDav')
  assert.equal(await page.getByLabel('密码').inputValue(), 'browser-test-password')

  assert.deepEqual(pageErrors, [], `Browser runtime errors: ${pageErrors.join('; ')}`)
  process.stdout.write('Stage 5 browser test passed: login, folder creation, upload, signed text preview, rename and delete.\n')
} finally {
  await browser.close()
}
