/**
 * Service-Worker-Registrierung.
 *
 * `registerType: 'prompt'` (vite.config.ts): a new service worker is
 * installed but waits for `skipWaiting()` - the running app is **not**
 * interrupted. Only after the user confirms it is activated and reloaded.
 */
import { ref, type Ref } from 'vue'

export interface SwState {
  /** Service worker registered and the app shell is available offline. */
  ready: Ref<boolean>
  /** An update is waiting for confirmation. */
  updateAvailable: Ref<boolean>
  /** Error during registration (e.g. no HTTPS, private mode). */
  error: Ref<string | null>
  register(): Promise<void>
  applyUpdate(): Promise<void>
}

export function useServiceWorker(): SwState {
  const ready = ref(false)
  const updateAvailable = ref(false)
  const error = ref<string | null>(null)
  let waitingWorker: ServiceWorker | null = null
  let registered = false
  /** Reload only on self requested activation (see `controllerchange`). */
  let reloadRequested = false

  async function applyUpdate(): Promise<void> {
    const worker = waitingWorker ?? (await navigator.serviceWorker?.getRegistration())?.waiting
    if (!worker) return
    updateAvailable.value = false
    reloadRequested = true
    worker.postMessage({ type: 'SKIP_WAITING' })
    // The reload happens via the `controllerchange` listener in the service worker.
  }

  async function register(): Promise<void> {
    if (!('serviceWorker' in navigator) || registered) return
    registered = true

    if (!window.isSecureContext) {
      error.value = 'insecure_context'
      return
    }

    try {
      // In dev the worker deliberately does not run (HMR compatibility).
      if (import.meta.env.DEV) return

      // `type: 'classic'` fits because the injected workbox bundle is
      // self contained (no import/export statements) - that also keeps
      // older Android Chrome versions happy.
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        type: 'classic',
        updateViaCache: 'none',
      })

      const track = (worker: ServiceWorker | null) => {
        if (!worker) return
        waitingWorker = worker
        updateAvailable.value = true
      }

      if (registration.waiting) track(registration.waiting)

      registration.addEventListener('updatefound', () => {
        const installing = registration.installing
        if (!installing) return
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            track(registration.waiting)
          }
        })
      })

      // Reload when the controller changes (after skipWaiting).
      //
      // Important: on the **first** visit the worker takes over the page itself
      // (`clients.claim()` in the `activate` handler) - that fires a
      // `controllerchange` too. Without this guard the app would therefore
      // reload itself right after startup (lost selection, open
      // settings, duplicate data fetch). The new worker then simply counts from
      // the next call on.
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!reloadRequested) return
        reloadRequested = false
        window.location.reload()
      })

      await navigator.serviceWorker.ready
      ready.value = true

      // Regularly check for a new app version.
      if (document.visibilityState === 'visible') registration.update().catch(() => undefined)
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause)
    }
  }

  return { ready, updateAvailable, error, applyUpdate, register }
}
