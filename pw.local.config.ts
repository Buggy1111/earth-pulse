import base from './playwright.config'
import { defineConfig } from '@playwright/test'
export default defineConfig({
  ...base,
  testDir: '/home/user/earth-pulse/e2e',
  outputDir: '/tmp/claude-0/-home-user-earth-pulse/70480684-4880-5e58-9075-a5042b5666cc/scratchpad/pw-out',
  use: { ...base.use, launchOptions: { ...base.use!.launchOptions, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' } },
})
