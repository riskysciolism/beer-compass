/**
 * Determines the *actual* connection status.
 *
 * In Chrome `navigator.onLine` only reports whether a network interface exists -
 * in airplane mode, in a mobile dead zone or behind a captive portal the value
 * is still `true`. Therefore an additional small real request is made.
 */
import { healthUrl } from '@/config'

export type OnlineState = 'online' | 'offline' | 'unknown'

export interface OnlineProbe {
  online: boolean
  latencyMs: number
  checkedAt: number
}

let lastProbe: OnlineProbe | undefined
let inFlight: Promise<OnlineProbe> | undefined

/** Only `navigator.onLine`, without network access. */
export function navigatorSaysOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine
}

/**
 * Real reachability check. If the call is already blocked by a pending
 * request, an existing result is reused.
 */
export async function probeOnline(timeoutMs = 4000): Promise<OnlineProbe> {
  if (inFlight) return inFlight
  const startedAt = Date.now()

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  inFlight = (async (): Promise<OnlineProbe> => {
    try {
      const response = await fetch(healthUrl, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
        headers: { accept: 'application/json' },
      })
      // One response is enough; the status code is secondary for reachability.
      const probe: OnlineProbe = {
        online: response.ok || response.status < 500,
        latencyMs: Date.now() - startedAt,
        checkedAt: Date.now(),
      }
      lastProbe = probe
      return probe
    } catch {
      const probe: OnlineProbe = {
        online: false,
        latencyMs: Date.now() - startedAt,
        checkedAt: Date.now(),
      }
      lastProbe = probe
      return probe
    } finally {
      clearTimeout(timer)
      inFlight = undefined
    }
  })()

  return inFlight
}

export function lastProbeResult(): OnlineProbe | undefined {
  return lastProbe
}

/** Cheaply checks whether a connection probably exists. */
export function looksOnline(): OnlineState {
  if (!navigatorSaysOnline()) return 'offline'
  if (lastProbe) return lastProbe.online ? 'online' : 'offline'
  return 'unknown'
}

/**
 * Observes the browser status and runs a real
 * check (otherwise `navigator.onLine` would lie behind a captive portal).
 */
export function watchOnlineStatus(callback: (state: OnlineState) => void): () => void {
  let previous = looksOnline()

  const onOnline = () => {
    // Verify first, then report.
    void probeOnline().then((probe) => {
      previous = probe.online ? 'online' : 'offline'
      callback(previous)
    })
  }
  const onOffline = () => {
    previous = 'offline'
    callback('offline')
  }

  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)

  return () => {
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
  }
}
