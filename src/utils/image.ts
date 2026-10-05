/**
 * The data provides images as base64. Some sources deliver plain base64
 * without a data URL prefix - both have to work in the browser.
 */
export function normalizeImageSource(value: string): string {
  if (!value) return ''
  if (value.startsWith('data:') || value.startsWith('http:') || value.startsWith('https:')) {
    return value
  }
  if (value.startsWith('/')) return value
  // Detect base64: allowed characters and plausible length.
  if (/^[A-Za-z0-9+/\r\n]+={0,2}$/.test(value) && value.replace(/\s/g, '').length > 64) {
    return `data:image/png;base64,${value.replace(/\s/g, '')}`
  }
  return value
}
