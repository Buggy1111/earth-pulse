/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // We register the SW from main.tsx (bundled module) instead of an injected
      // inline script — the site's CSP has no 'unsafe-inline' for script-src.
      injectRegister: null,
      includeAssets: [
        'icons/favicon-32.png',
        'icons/favicon-16.png',
        'icons/apple-touch-icon.png',
        'icons/icon.svg',
        'og-image.png',
      ],
      manifest: {
        name: 'Earth Pulse — the planet, live in 3D',
        short_name: 'Earth Pulse',
        description:
          'A free real-time 3D globe: live earthquakes, real satellites & the ISS, aurora, city lights along the day/night line, plus a full solar-system mode.',
        id: '/',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#02030a',
        background_color: '#02030a',
        categories: ['education', 'weather', 'utilities'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // precache the app shell + Draco decoder; big media is runtime-cached
        globPatterns: ['**/*.{js,css,html,wasm}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // Draco and 3D models change rarely. Keep their cache separate
            // from the frequently updated artwork so one cannot evict the other.
            urlPattern: /\/(models|draco)\/.*|\.(?:glb)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'ep-models-v3',
              expiration: {
                maxEntries: 35,
                maxAgeSeconds: 60 * 60 * 24 * 30,
                purgeOnQuotaError: true,
              },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Refresh imagery in the background so corrected paleomaps and
            // textures do not remain stale for an entire month.
            urlPattern: /\.(?:jpg|jpeg|webp)$/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'ep-images-v3',
              expiration: {
                maxEntries: 40,
                maxAgeSeconds: 60 * 60 * 24 * 7,
                purgeOnQuotaError: true,
              },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    globals: true,
    // e2e/ holds Playwright specs (real browser) — keep them out of vitest
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
  },
})
