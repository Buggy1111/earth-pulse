import { defineConfig, devices } from '@playwright/test'

/** End-to-end tests run against the real app in a real (headless) browser —
 * the only way to exercise the WebGL globe, the Starlink worker + InstancedMesh
 * and the AR overlay, none of which jsdom can touch. WebGL needs SwiftShader in
 * headless Chromium. The dev server is reused if one is already running. */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:5173',
    launchOptions: {
      args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox'],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
