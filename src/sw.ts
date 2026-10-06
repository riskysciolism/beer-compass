/// <reference lib="webworker" />
/**
 * Service Worker (Workbox, `injectManifest`).
 *
 * Strategien:
 * - **App shell**: fully precached via `precacheAndRoute`. That way
 * the app starts in airplane mode after the first load.
 * - **Navigation** (alle URLs): `createHandlerBoundToURL('index.html')`,
 * so deep links and manifest shortcuts work offline as well.
 * - **`/data/*.json`** (statisch ausgelieferte Beispieldaten): `NetworkFirst` mit
 * Cache-Fallback - so kommt eine neu ausgelieferte Datei auch an, offline bleibt
 * die alte verfügbar. `HEAD`-Anfragen der Versionsprüfung laufen ungecacht am
 * Worker vorbei.
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
import { NetworkFirst, NetworkOnly } from 'workbox-strategies'

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

/**
 * `/data/*.json` (statically served sample data, used when there is no
 * backend): **NetworkFirst**, so that a newly deployed dataset is actually
 * picked up. `CacheFirst` would pin the file in the worker forever as soon as
 * it had been read once, and no update would ever arrive again.
 *
 * Without a network (or when it takes longer than `networkTimeoutSeconds`) the
 * cached file is used - the app then simply sees the older version.
 */
registerRoute(
  ({ url }) => url.pathname.startsWith('/data/') && url.pathname.endsWith('.json'),
  new NetworkFirst({
    cacheName: 'bc-data-files',
    networkTimeoutSeconds: 3,
    // Only responses with status 200 (and opaque ones) end up in the cache, so a
    // 304 cannot poison an entry.
    plugins: [
      new ExpirationPlugin({
        maxEntries: 12,
        maxAgeSeconds: 30 * 24 * 60 * 60,
        purgeOnQuotaError: true,
      }),
    ],
  }),
  'GET',
)

/**
 * The version check sends `HEAD` requests to compare the ETag. Those must reach
 * the network unmodified - an answer from the cache would report the state of
 * an old file and no update would ever be noticed.
 */
registerRoute(({ url }) => url.pathname.startsWith('/data/'), new NetworkOnly(), 'HEAD')

/* --------------------------------------------------------------- Live-API --- */

registerRoute(({ url }) => url.pathname.startsWith('/api/'), new NetworkOnly())

clientsClaim()

/* ------------------------------------------------------------ Aktivierung --- */

self.addEventListener('message', (event: ExtendableMessageEvent) => {
  // It is only sent once the user has confirmed the update.
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting()
})
