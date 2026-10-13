import { expect, test } from '@playwright/test'

test('renders the application without an uncaught JavaScript exception', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.locator('body')).not.toBeEmpty()
  await page.waitForFunction(() => document.querySelector('canvas') !== null, null, { timeout: 30_000 })
  expect(errors).toEqual([])
})
