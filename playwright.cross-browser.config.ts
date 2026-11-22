import { defineConfig, devices } from '@playwright/test'

/** Browser-engine smoke checks; the main WebGL E2E suite remains Chromium-only. */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/browser-smoke.spec.ts',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:5173' },
  projects: [
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
