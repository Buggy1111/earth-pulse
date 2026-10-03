import { test } from '@playwright/test'
test.use({ viewport: { width: 1440, height: 900 } })
test('shot', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => !!(window as Record<string, unknown>).__earthPulseGlobe, null, { timeout: 40000 })
  await page.waitForTimeout(4000)
  await page.getByText('Orionids').first().click()
  await page.waitForTimeout(800)
  await page.screenshot({ path: '/tmp/claude-0/-home-user-earth-pulse/70480684-4880-5e58-9075-a5042b5666cc/scratchpad/meteor.png' })
})
