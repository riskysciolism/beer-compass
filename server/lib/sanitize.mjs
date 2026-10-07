/**
 * Helpers for sanitizing user input before it reaches the database or the UI.
 */

export function escapeHtml(input) {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function sanitizeText(input) {
  if (typeof input !== 'string') return ''
  // Remove ASCII control characters except tab, newline and carriage return.
  return input
    .trim()
    .split('')
    .filter((c) => {
      const code = c.charCodeAt(0)
      return code === 0x09 || code === 0x0a || code === 0x0d || code >= 0x20
    })
    .join('')
}

export function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

export function coerceBoolean(value) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return value === 'true' || value === '1'
  if (typeof value === 'number') return value === 1
  return false
}

export function isValidCoordinate(lat, lon) {
  const nLat = Number(lat)
  const nLon = Number(lon)
  return (
    Number.isFinite(nLat) &&
    Number.isFinite(nLon) &&
    nLat >= -90 &&
    nLat <= 90 &&
    nLon >= -180 &&
    nLon <= 180
  )
}

export function isBlockedDevice(deviceId, blocks) {
  if (!deviceId) return false
  const now = new Date()
  return blocks.some((b) => !b.expires_at || b.expires_at > now)
}
