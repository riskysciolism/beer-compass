/** Geodesy and formatting helpers - without an external library. */

const EARTH_RADIUS_M = 6_371_008.8
const DEG = Math.PI / 180

export interface LatLon {
  latitude: number
  longitude: number
}

export interface DistanceResult {
  /** Distance in meters. */
  meters: number
  /** Bearing from north to east in degrees (0-360). */
  bearing: number
}

export interface CoordinateFormat {
  /** Decimal with 5 decimal places, e.g. `52.20110° N`. */
  decimal: string
  /** Degrees/minutes/seconds, e.g. `52° 12' 04.3" N`. */
  dms: string
  /** Degrees and minutes, e.g. `52° 12.06'`. */
  degreesMinutes: string
}

export function distanceBetween(from: LatLon, to: LatLon): DistanceResult {
  const lat1 = from.latitude * DEG
  const lat2 = to.latitude * DEG
  const deltaLat = (to.latitude - from.latitude) * DEG
  const deltaLon = (to.longitude - from.longitude) * DEG

  const a =
    Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  const y = Math.sin(deltaLon) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon)
  const bearing = (Math.atan2(y, x) / DEG + 360) % 360

  return { meters: EARTH_RADIUS_M * c, bearing }
}

export function formatCoordinate(
  value: number,
  positive: string,
  negative: string,
): CoordinateFormat {
  const hemisphere = value >= 0 ? positive : negative
  const absolute = Math.abs(value)
  const degrees = Math.floor(absolute)
  const minutesFull = (absolute - degrees) * 60
  const minutes = Math.floor(minutesFull)
  const seconds = (minutesFull - minutes) * 60
  return {
    decimal: `${absolute.toFixed(5)}° ${hemisphere}`,
    dms: `${degrees}° ${String(minutes).padStart(2, '0')}' ${seconds.toFixed(1).padStart(4, '0')}" ${hemisphere}`,
    degreesMinutes: `${degrees}° ${minutesFull.toFixed(2).padStart(5, '0')}'`,
  }
}

/** Human readable distance: m below 1 km, otherwise km with one decimal. */
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters)) return '–'
  if (meters < 950) return `${Math.round(meters)} m`
  if (meters < 100_000) return `${(meters / 1000).toFixed(meters < 9500 ? 2 : 1)} km`
  return `${Math.round(meters / 1000)} km`
}

const CARDINALS_DE = [
  'N',
  'NNO',
  'NO',
  'ONO',
  'O',
  'OSO',
  'SO',
  'SSO',
  'S',
  'SSW',
  'SW',
  'WSW',
  'W',
  'WNW',
  'NW',
  'NNW',
] as const

export function cardinalDirection(bearing: number): string {
  const index = Math.round((((bearing % 360) + 360) % 360) / 22.5) % 16
  return CARDINALS_DE[index] ?? 'N'
}

/**
 * `geo:` intent for the map app configured on the device. Opens navigation
 * directly - without a detour via a web app and without any network request
 * from this app.
 */
export function mapUrl(item: { name: string; position: LatLon }): string {
  const { latitude: lat, longitude: lon } = item.position
  return `geo:${lat},${lon}?q=${lat},${lon}(${encodeURIComponent(item.name)})`
}

/** Cartesian coordinates for a simple offline display compass rose. */
export function projectToLocal(origin: LatLon, point: LatLon, radiusMeters: number) {
  const { meters, bearing } = distanceBetween(origin, point)
  const angle = bearing * DEG
  return {
    x: Math.sin(angle) * (meters / radiusMeters),
    y: -Math.cos(angle) * (meters / radiusMeters),
    distance: meters,
    bearing,
  }
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'kB', 'MB', 'GB']
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / 1024 ** exponent
  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`
}

export function formatDateTime(
  timestamp: number | string | null | undefined,
  locale = 'de-DE',
): string {
  if (timestamp === null || timestamp === undefined) return '–'
  const date = typeof timestamp === 'number' ? new Date(timestamp) : new Date(timestamp)
  if (Number.isNaN(date.getTime())) return '–'
  return date.toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatTime(timestamp: number | null | undefined, locale = 'de-DE'): string {
  if (timestamp === null || timestamp === undefined) return '–'
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return '–'
  return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

/** Copy ready coordinate string with high precision. */
export function formatCoordinatesForCopy(position: LatLon): string {
  return `${position.latitude.toFixed(6)}, ${position.longitude.toFixed(6)}`
}
