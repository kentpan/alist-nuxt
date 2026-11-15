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
  await page.getByText('browser-test-folder', { exact: true }).waitFor()

  await page.locator('input[type="file"]').setInputFiles({
    name: 'browser-test.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Browser interaction test')
  })
  await page.getByText('browser-test.txt', { exact: true }).waitFor()

  await page.getByText('browser-test.txt', { exact: true }).click()
  await page.getByLabel('新名称').fill('browser-renamed.txt')
  await page.getByRole('button', { name: '重命名' }).click()
  await page.getByText('browser-renamed.txt', { exact: true }).waitFor()
  await page.getByText('browser-renamed.txt', { exact: true }).click()

  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: '删除' }).click()
  await page.getByText('browser-renamed.txt', { exact: true }).waitFor({ state: 'detached' })

  assert.deepEqual(pageErrors, [], `Browser runtime errors: ${pageErrors.join('; ')}`)
  process.stdout.write('Stage 4 browser test passed: login, folder creation, upload, rename and delete.\n')
} finally {
  await browser.close()
}
