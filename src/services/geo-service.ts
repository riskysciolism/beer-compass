/**
 * GPS service based on `navigator.geolocation.watchPosition`.
 *
 * Principles:
 * - Measuring only starts when a view really needs it (`start()`/`stop()`).
 * - Energy: `enableHighAccuracy: false` by default, limited `maximumAge`.
 * - The service does **not** depend on the internet: GPS works offline. Only the
 * permission prompt and the system GPS icon are involved.
 * - Every error case is mapped to its own translatable state.
 */
import { readonly, ref, type DeepReadonly, type Ref } from 'vue'

export type GeoPermission = 'granted' | 'denied' | 'prompt' | 'unsupported'

export type GeoStatus =
  'idle' | 'requesting' | 'active' | 'unsupported' | 'denied' | 'unavailable' | 'timeout' | 'error'

export interface GeoFix {
  latitude: number
  longitude: number
  accuracy: number
  altitude: number | null
  altitudeAccuracy: number | null
  heading: number | null
  speed: number | null
  timestamp: number
}

export interface GeoState {
  status: Ref<GeoStatus>
  fix: Ref<GeoFix | null>
  permission: Ref<GeoPermission>
  lastErrorAt: Ref<number | null>
}

export interface GeoOptions {
  highAccuracy: boolean
  /** Veraltete Positionen bis zu diesem Alter (ms) wiederverwenden. */
  maximumAgeMs: number
  timeoutMs: number
  /** Zeitabstand erzwungener Positionsabfragen (ms). */
  intervalMs: number
}

export const DEFAULT_GEO_OPTIONS: GeoOptions = {
  highAccuracy: false,
  maximumAgeMs: 30_000,
  timeoutMs: 15_000,
  intervalMs: 10_000,
}

const ACCURACY_GOOD = 25
const ACCURACY_FAIR = 100

export function accuracyRating(accuracy: number | undefined): 'good' | 'fair' | 'poor' {
  if (accuracy === undefined) return 'poor'
  if (accuracy <= ACCURACY_GOOD) return 'good'
  if (accuracy <= ACCURACY_FAIR) return 'fair'
  return 'poor'
}

function toFix(position: GeolocationPosition): GeoFix {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
    altitude: position.coords.altitude,
    altitudeAccuracy: position.coords.altitudeAccuracy,
    heading: position.coords.heading,
    speed: position.coords.speed,
    timestamp: position.timestamp,
  }
}

function statusFromError(error: GeolocationPositionError): GeoStatus {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return 'denied'
    case error.POSITION_UNAVAILABLE:
      return 'unavailable'
    case error.TIMEOUT:
      return 'timeout'
    default:
      return 'error'
  }
}

export interface GeoController extends GeoState {
  readonly isTracking: DeepReadonly<Ref<boolean>>
  start(options: Partial<GeoOptions>): Promise<void>
  stop(): void
  destroy(): void
  refreshPermission(): Promise<GeoPermission>
}

export function createGeoService(): GeoController {
  const status = ref<GeoStatus>('idle')
  const fix = ref<GeoFix | null>(null)
  const permission = ref<GeoPermission>('unsupported')
  const lastErrorAt = ref<number | null>(null)
  const isTracking = ref(false)

  let watchId: number | null = null
  let permissionStatus: PermissionStatus | undefined
  let current: GeoOptions = { ...DEFAULT_GEO_OPTIONS }

  const supported = typeof navigator !== 'undefined' && 'geolocation' in navigator

  async function refreshPermission(): Promise<GeoPermission> {
    if (!supported) {
      permission.value = 'unsupported'
      status.value = 'unsupported'
      return 'unsupported'
    }
    try {
      if (!navigator.permissions?.query) {
        permission.value = 'prompt'
        return 'prompt'
      }
      permissionStatus = await navigator.permissions.query({ name: 'geolocation' })
      permission.value = permissionStatus.state
      permissionStatus.onchange = () => {
        permission.value = permissionStatus?.state ?? 'prompt'
        if (permission.value === 'denied' && isTracking.value) stop()
      }
      return permission.value
    } catch {
      // Some browsers do not allow the query - then 'prompt' applies.
      permission.value = 'prompt'
      return 'prompt'
    }
  }

  function stop(): void {
    if (watchId !== null && supported) {
      navigator.geolocation.clearWatch(watchId)
    }
    watchId = null
    isTracking.value = false
    if (status.value === 'active' || status.value === 'requesting') status.value = 'idle'
  }

  function destroy(): void {
    stop()
    if (permissionStatus) permissionStatus.onchange = null
  }

  function start(overrides: Partial<GeoOptions> = {}): Promise<void> {
    current = { ...current, ...overrides }

    if (!supported) {
      status.value = 'unsupported'
      permission.value = 'unsupported'
      return Promise.resolve()
    }
    if (watchId !== null) return Promise.resolve()

    isTracking.value = true
    status.value = 'requesting'

    return new Promise<void>((resolve) => {
      const settle = () => {
        if (status.value === 'active') resolve()
      }

      watchId = navigator.geolocation.watchPosition(
        (position) => {
          fix.value = toFix(position)
          status.value = 'active'
          lastErrorAt.value = null
          settle()
        },
        (error) => {
          status.value = statusFromError(error)
          lastErrorAt.value = Date.now()
          if (error.code === error.PERMISSION_DENIED) {
            permission.value = 'denied'
            stop()
          }
        },
        {
          enableHighAccuracy: current.highAccuracy,
          maximumAge: current.maximumAgeMs,
          timeout: current.timeoutMs,
        },
      )

      // Without any position (e.g. permanently denied) the promise still has to
      // resolve so the UI does not get stuck.
      setTimeout(() => {
        if (status.value === 'requesting') resolve()
        settle()
      }, current.timeoutMs + 500)
    })
  }

  if (supported) void refreshPermission()
  else status.value = 'unsupported'

  return {
    status: readonly(status),
    fix: readonly(fix),
    permission: readonly(permission),
    lastErrorAt: readonly(lastErrorAt),
    isTracking: readonly(isTracking),
    start,
    stop,
    destroy,
    refreshPermission,
  }
}

/** Singleton - the app keeps exactly one GPS session. */
let instance: GeoController | undefined

export function useGeo(): GeoController {
  instance ??= createGeoService()
  return instance
}
