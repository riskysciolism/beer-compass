/// <reference lib="webworker" />
/**
 * Service Worker (Workbox, `injectManifest`).
 *
 * Strategien:
 * - **App shell**: fully precached via `precacheAndRoute`. That way
 * the app starts in airplane mode after the first load.
 * - **Navigation** (alle URLs): `createHandlerBoundToURL('index.html')`,
 * so deep links and manifest shortcuts work offline as well.
 * - **`/data/*.json`** (statisch ausgelieferte Beispieldaten): `CacheFirst` –
 * once loaded, the file is permanently available.
 * - **`/api/*`**: `NetworkOnly`. The service worker must not disturb conditional
 * requests (`If-None-Match`) and the 304 path; the app reads its data
 * from IndexedDB anyway, the browser HTTP cache is enough as an
 * accelerator. POST (echo endpoint) passes through workbox anyway.
 */
import { clientsClaim } from 'workbox-core'
import { ExpirationPlugin } from 'workbox-expiration'
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkOnly } from 'workbox-strategies'

declare const self: ServiceWorkerGlobalScope

/* ------------------------------------------------------------- App-Shell --- */

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/api\//, /^\/data\//],
  }),
)

/* ---------------------------------------------------- Statische Beispieldaten */

registerRoute(
  ({ url }) => url.pathname.startsWith('/data/') && url.pathname.endsWith('.json'),
  new CacheFirst({
    cacheName: 'bc-data-files',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 12,
        maxAgeSeconds: 30 * 24 * 60 * 60,
        purgeOnQuotaError: true,
      }),
    ],
  }),
)

/* --------------------------------------------------------------- Live-API --- */

registerRoute(({ url }) => url.pathname.startsWith('/api/'), new NetworkOnly())

clientsClaim()

/* ------------------------------------------------------------ Aktivierung --- */

self.addEventListener('message', (event: ExtendableMessageEvent) => {
  // It is only sent once the user has confirmed the update.
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting()
})
