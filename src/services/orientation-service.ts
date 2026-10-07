/**
 * Orientation / compass heading service based on `deviceorientation` events.
 *
 * Provides a smoothed device heading independent of GPS course-over-ground.
 * Sources (in order of preference):
 *  1. iOS `webkitCompassHeading` from `deviceorientation` events.
 *  2. Absolute `deviceorientation` / `deviceorientationabsolute` alpha angle.
 *
 * Raw readings are smoothed with an exponential moving average that handles
 * the 0/360 degree wraparound. Updates are flushed to the reactive heading via
 * `requestAnimationFrame`, so the UI receives at most one change per frame even
 * when the sensor fires faster than the display refresh rate.
 */
import { readonly, ref, type Ref } from 'vue'

export type OrientationPermission = 'granted' | 'denied' | 'prompt' | 'unsupported'
export type OrientationStatus =
  | 'idle'
  | 'requesting'
  | 'active'
  | 'unsupported'
  | 'denied'
  | 'unavailable'

export interface OrientationState {
  heading: Ref<number | null>
  status: Ref<OrientationStatus>
  permission: Ref<OrientationPermission>
  isSupported: Ref<boolean>
}

export interface OrientationController extends OrientationState {
  start(): Promise<void>
  stop(): void
  destroy(): void
  requestPermission(): Promise<OrientationPermission>
}

interface DeviceOrientationEventExt extends DeviceOrientationEvent {
  readonly webkitCompassHeading?: number
  readonly webkitCompassAccuracy?: number
}

interface DeviceOrientationEventConstructorExt {
  new (type: string, eventInitDict?: DeviceOrientationEventInit): DeviceOrientationEventExt
  requestPermission?(): Promise<'granted' | 'denied'>
}

const SMOOTHING_TIME_CONSTANT_MS = 80
const WATCHDOG_MS = 3000

function getDeviceOrientationEvent(): DeviceOrientationEventConstructorExt | undefined {
  if (typeof window === 'undefined') return undefined
  const win = window as unknown as { DeviceOrientationEvent?: DeviceOrientationEventConstructorExt }
  return win.DeviceOrientationEvent
}

function getHeadingFromEvent(event: DeviceOrientationEventExt): number | null {
  if (event.webkitCompassHeading != null && Number.isFinite(event.webkitCompassHeading)) {
    return event.webkitCompassHeading
  }
  if (event.absolute && event.alpha != null && Number.isFinite(event.alpha)) {
    return event.alpha
  }
  return null
}

function lerpAngle(current: number, target: number, factor: number): number {
  const diff = ((target - current + 540) % 360) - 180
  let value = current + diff * factor
  value = ((value % 360) + 360) % 360
  return value
}

export function createOrientationService(): OrientationController {
  const heading = ref<number | null>(null)
  const status = ref<OrientationStatus>('idle')
  const permission = ref<OrientationPermission>('prompt')
  const isSupported = ref<boolean>(
    typeof window !== 'undefined' && 'DeviceOrientationEvent' in window,
  )

  const DOE = getDeviceOrientationEvent()

  let listening = false
  let rawHeading: number | null = null
  let lastTimeStamp = 0
  let rafId = 0
  let watchdogId: ReturnType<typeof setTimeout> | undefined
  let gestureRetryHandler: (() => void) | undefined

  function canUseEvent(event: DeviceOrientationEventExt): boolean {
    return (
      (event.webkitCompassHeading != null && Number.isFinite(event.webkitCompassHeading)) ||
      event.absolute === true
    )
  }

  function flushHeading(): void {
    rafId = 0
    if (rawHeading === null) return
    heading.value = rawHeading
    if (status.value === 'requesting') status.value = 'active'
    resetWatchdog()
  }

  function scheduleFlush(): void {
    if (rafId) return
    rafId = requestAnimationFrame(flushHeading)
  }

  function resetWatchdog(): void {
    if (watchdogId) clearTimeout(watchdogId)
    watchdogId = setTimeout(() => {
      if (status.value === 'requesting') status.value = 'unavailable'
    }, WATCHDOG_MS)
  }

  function clearWatchdog(): void {
    if (watchdogId) clearTimeout(watchdogId)
    watchdogId = undefined
  }

  function onOrientation(event: Event): void {
    const ext = event as DeviceOrientationEventExt
    if (!canUseEvent(ext)) return

    const value = getHeadingFromEvent(ext)
    if (value == null || !Number.isFinite(value)) return

    if (rawHeading === null) {
      rawHeading = value
      heading.value = value
      status.value = 'active'
      resetWatchdog()
      return
    }

    const now = ext.timeStamp || performance.now()
    const dt = Math.max(1, now - lastTimeStamp)
    lastTimeStamp = now

    const factor = 1 - Math.exp(-dt / SMOOTHING_TIME_CONSTANT_MS)
    rawHeading = lerpAngle(rawHeading, value, factor)
    scheduleFlush()
    resetWatchdog()
  }

  function attachListeners(): void {
    if (listening) return
    window.addEventListener(
      'deviceorientationabsolute' as keyof WindowEventMap,
      onOrientation,
    )
    window.addEventListener('deviceorientation', onOrientation)
    listening = true
  }

  function detachListeners(): void {
    window.removeEventListener(
      'deviceorientationabsolute' as keyof WindowEventMap,
      onOrientation,
    )
    window.removeEventListener('deviceorientation', onOrientation)
    listening = false
  }

  function clearGestureRetry(): void {
    if (!gestureRetryHandler) return
    document.removeEventListener('click', gestureRetryHandler, true)
    document.removeEventListener('touchstart', gestureRetryHandler, true)
    gestureRetryHandler = undefined
  }

  function ensureGestureRetry(): void {
    if (gestureRetryHandler) return
    gestureRetryHandler = () => {
      if (permission.value === 'prompt' && status.value === 'requesting') {
        void start()
      }
    }
    document.addEventListener('click', gestureRetryHandler, true)
    document.addEventListener('touchstart', gestureRetryHandler, true)
  }

  async function requestPermission(): Promise<OrientationPermission> {
    if (!DOE) {
      permission.value = 'unsupported'
      status.value = 'unsupported'
      return 'unsupported'
    }
    if (typeof DOE.requestPermission !== 'function') {
      permission.value = 'granted'
      return 'granted'
    }
    try {
      const result = await DOE.requestPermission()
      permission.value = result
      return result
    } catch {
      return permission.value
    }
  }

  async function start(): Promise<void> {
    if (!DOE) {
      status.value = 'unsupported'
      permission.value = 'unsupported'
      isSupported.value = false
      return
    }
    if (listening) return
    if (permission.value === 'denied') {
      status.value = 'denied'
      return
    }

    status.value = 'requesting'

    if (typeof DOE.requestPermission === 'function' && permission.value !== 'granted') {
      try {
        const result = await DOE.requestPermission()
        permission.value = result
        if (result === 'denied') {
          status.value = 'denied'
          clearGestureRetry()
          return
        }
      } catch {
        // Most likely called without a user gesture. Retry on the next gesture.
        ensureGestureRetry()
        return
      }
    }

    clearGestureRetry()
    attachListeners()
    resetWatchdog()
  }

  function stop(): void {
    detachListeners()
    clearWatchdog()
    if (rafId) cancelAnimationFrame(rafId)
    rafId = 0
    clearGestureRetry()
    if (['active', 'requesting', 'unavailable'].includes(status.value)) {
      status.value = 'idle'
    }
  }

  function destroy(): void {
    stop()
  }

  return {
    heading: readonly(heading),
    status: readonly(status),
    permission: readonly(permission),
    isSupported: readonly(isSupported),
    start,
    stop,
    destroy,
    requestPermission,
  }
}

let instance: OrientationController | undefined

export function useOrientation(): OrientationController {
  instance ??= createOrientationService()
  return instance
}
