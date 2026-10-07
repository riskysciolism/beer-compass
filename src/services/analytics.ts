/**
 * Lightweight analytics client for the Beer Compass PWA.
 * Events are sent to /api/events when the browser is online.
 * No IP is transmitted; only a stable deviceId, event type and optional context.
 */
import { apiBase } from '@/config'

const DEVICE_ID_KEY = 'bc_device_id'

function getDeviceId(): string {
  if (typeof localStorage === 'undefined') return 'unknown'
  let id = localStorage.getItem(DEVICE_ID_KEY)
  if (!id) {
    id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    localStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}

function isBlocked(): boolean {
  // The server tells us if the device is blocked via 403 responses.
  // We keep a short-lived local flag to avoid spamming while blocked.
  const until = sessionStorage.getItem('bc_block_until')
  return !!until && Number(until) > Date.now()
}

function markBlocked() {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem('bc_block_until', String(Date.now() + 60 * 60 * 1000))
  }
}

export interface TrackPayload {
  event_type: 'open' | 'select' | 'search' | 'locate'
  item_id?: number
  latitude?: number
  longitude?: number
  metadata?: Record<string, unknown>
}

export async function track(payload: TrackPayload): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.onLine) return
  if (isBlocked()) return
  try {
    const res = await fetch(`${apiBase}/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        device_id: getDeviceId(),
        ...payload,
      }),
    })
    if (res.status === 403) markBlocked()
  } catch {
    // Silent fail – analytics must not break the app.
  }
}
