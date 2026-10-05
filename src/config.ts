/**
 * Central runtime configuration.
 * All URLs come from Vite env variables and can be overridden per deployment.
 */

const env = import.meta.env

function normalizeBase(value: string | undefined): string {
  if (!value) return ''
  return value.endsWith('/') ? value.slice(0, -1) : value
}

export const apiBase = normalizeBase(env.VITE_API_BASE)

/**
 * Without `.env` (fresh clone) the app runs as a purely static variant
 * against `public/data`. Anyone deploying a backend sets `VITE_API_BASE`.
 */
const staticBase = '/data'

/** URL of the small file that is only loaded to check the version. */
export const versionUrl = env.VITE_VERSION_URL ?? `${apiBase || staticBase}/version.json`

/** URL of the full data file. */
export const dataUrl = env.VITE_DATA_URL ?? `${apiBase || staticBase}/data.json`

/** Dummy echo endpoint (may be empty, then it is never contacted). */
export const echoUrl = env.VITE_ECHO_URL ?? ''

/** Reachability probe - deliberately uncached so that it stays honest. */
export const healthUrl = apiBase ? `${apiBase}/health` : `${staticBase}/version.json`

export const appVersion = __APP_BUILD_TIME__

export const STORAGE = {
  dbName: 'beer-compass',
  dbVersion: 1,
} as const

export const CACHE_NAMES = {
  data: 'bc-data-files-v1',
} as const
