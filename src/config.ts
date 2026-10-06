/**
 * Central runtime configuration.
 * All URLs come from Vite env variables and can be overridden per deployment.
 */

const env = import.meta.env

function normalizeBase(value: string | undefined): string {
  if (!value) return ''
  return value.endsWith('/') ? value.slice(0, -1) : value
}

/**
 * Empty variables count as "not set": `VITE_DATA_URL=` in a deployment (or in
 * `.env`) must fall back to the default instead of producing a relative URL
 * that would fetch the app shell itself.
 */
function orUndefined(value: string | undefined): string | undefined {
  if (value === undefined || value.length === 0) return undefined
  return value
}

export const apiBase = normalizeBase(orUndefined(env.VITE_API_BASE))

/**
 * Without `.env` (fresh clone) the app runs as a purely static variant
 * against `public/data`. Anyone deploying a backend sets `VITE_API_BASE`.
 *
 * The files live below the deployment base: `/data` at the domain root, on
 * GitHub Pages `/beer-compass/data`.
 */
const staticBase = `${normalizeBase(import.meta.env.BASE_URL)}/data`

/** URL of the small file that is only loaded to check the version. */
export const versionUrl =
  orUndefined(env.VITE_VERSION_URL) ?? `${apiBase || staticBase}/version.json`

/** URL of the full data file. */
export const dataUrl = orUndefined(env.VITE_DATA_URL) ?? `${apiBase || staticBase}/data.json`

/** Dummy echo endpoint (may be empty, then it is never contacted). */
export const echoUrl = orUndefined(env.VITE_ECHO_URL) ?? ''

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
