import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const API_TARGET = process.env.BC_API_TARGET ?? 'http://localhost:8787'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      host: true,
      port: 5173,
      proxy: {
        '/api': {
          target: API_TARGET,
          changeOrigin: true,
        },
      },
    },
    preview: {
      host: true,
      port: 4173,
      proxy: {
        '/api': {
          target: API_TARGET,
          changeOrigin: true,
        },
      },
    },
    plugins: [
      vue(),
      VitePWA({
        // injectManifest: full control over the service worker (see src/sw.ts)
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        registerType: 'prompt',
        injectRegister: null,
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest,woff2}'],
          globIgnores: ['**/node_modules/**', 'sw.js', 'workbox-*.js'],
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        },
        manifest: {
          id: '/',
          name: 'Beer Compass – Brauerei-Findbuch',
          short_name: 'Beer Compass',
          description:
            'Offline-first Findbuch für Brauereien, Ausschänke und Craft-Bier-Hotspots mit GPS-Positionsanzeige.',
          lang: 'de',
          dir: 'ltr',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          display_override: ['standalone', 'minimal-ui'],
          orientation: 'portrait',
          theme_color: '#1b1206',
          background_color: '#1b1206',
          categories: ['navigation', 'food', 'travel'],
          icons: [
            {
              src: '/icons/icon-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/icons/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/icons/icon-192-maskable.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'maskable',
            },
            {
              src: '/icons/icon-512-maskable.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
          // The app has only one view now (compass + list), so there is no
          // shortcut per section anymore.
          shortcuts: [
            {
              name: 'Brauereien in der Nähe',
              short_name: 'Kompass',
              url: '/',
              icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
            },
          ],
        },
        devOptions: {
          enabled: false,
          type: 'module',
        },
      }),
    ],
    define: {
      __APP_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    },
    build: {
      target: 'es2022',
      cssCodeSplit: false,
      sourcemap: mode !== 'production',
      reportCompressedSize: false,
    },
    worker: {
      format: 'es',
    },
    envPrefix: ['VITE_', 'BC_'],
    logLevel: (env.BC_LOG_LEVEL ?? 'info') as 'info',
  }
})
