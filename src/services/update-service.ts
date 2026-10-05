/**
 * Update service for the data files.
 *
 * How a check runs:
 * 1. `navigator.onLine` must be `true`.
 * 2. Real reachability check via fetch (`/api/health`).
 * 3. Determine whether anything changed - **without** loading the large file:
 * a) `HEAD <dataUrl>` with `If-None-Match` -> 304 = unchanged, 200 = changed.
 * b) Supplement/fallback via the small `version.json`
 * (its own conditional request, comparing the version number).
 * 4. Only on a change: download `data.json`, parse it in the web worker,
 * validate with zod, then swap atomically in IndexedDB.
 *
 * As long as no local version exists, loading always happens. If the server
 * lacks *every* change indicator (no ETag and no `version.json`), the
 * local state stays untouched - the app then does not blindly reload.
 */
import { computed, ref, type ComputedRef, type Ref } from 'vue'

import { dataUrl, versionUrl } from '@/config'
import type { DataStore } from '@/services/data-store'
import { navigatorSaysOnline, probeOnline } from '@/services/online-status'
import { parseRemoteVersion } from '@/schemas/version'
import type { DataMeta, RemoteVersion } from '@/types/data'

export type UpdateStatus =
  'idle' | 'offline' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'applied' | 'error'

export interface AvailableUpdate {
  version: RemoteVersion
  /** Already downloaded - the old data stays active until it is taken over. */
  raw: string
  descriptor: Omit<DataMeta, 'checksum' | 'count' | 'fetchedAt'>
}

export type UpdateErrorCode =
  | 'offline'
  | 'unreachable'
  | 'version_failed'
  | 'data_failed'
  | 'invalid_version'
  | 'parse_failed'
  | 'http_error'

export interface UpdateError {
  code: UpdateErrorCode
  httpStatus?: number
  details: string[]
}

export interface UpdateService {
  status: Ref<UpdateStatus>
  error: Ref<UpdateError | null>
  available: Ref<AvailableUpdate | null>
  lastCheckedAt: Ref<number | null>
  isBusy: ComputedRef<boolean>
  check(options?: { silent?: boolean }): Promise<UpdateStatus>
  applyPending(): Promise<DataMeta | undefined>
  reset(): void
}

interface TextResponse {
  status: number
  text: string
  etag: string | null
  lastModified: string | null
  notModified: boolean
}

function conditionalHeaders(etag: string | null, lastModified: string | null) {
  const headers: Record<string, string> = { accept: 'application/json' }
  if (etag) headers['if-none-match'] = etag
  if (!etag && lastModified) headers['if-modified-since'] = lastModified
  return headers
}

async function fetchText(
  url: string,
  etag: string | null,
  lastModified: string | null,
): Promise<TextResponse> {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: conditionalHeaders(etag, lastModified),
  })
  const notModified = response.status === 304
  return {
    status: response.status,
    text: notModified ? '' : await response.text(),
    etag: response.headers.get('etag'),
    lastModified: response.headers.get('last-modified'),
    notModified,
  }
}

/** HEAD request: only returns the validator headers, no body. */
async function probeValidator(
  url: string,
  etag: string | null,
): Promise<'unchanged' | 'changed' | 'unknown'> {
  if (!etag) return 'unknown'
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      cache: 'no-store',
      headers: { 'if-none-match': etag },
    })
    if (response.status === 304) return 'unchanged'
    if (response.status === 200 && response.headers.get('etag')) return 'changed'
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

type ChangeDecision = { kind: 'unchanged' } | { kind: 'changed' }

const UNCHANGED: ChangeDecision = { kind: 'unchanged' }
const CHANGED: ChangeDecision = { kind: 'changed' }

export function createUpdateService(store: DataStore): UpdateService {
  const status = ref<UpdateStatus>('idle')
  const error = ref<UpdateError | null>(null)
  const available = ref<AvailableUpdate | null>(null)
  const lastCheckedAt = ref<number | null>(null)

  const isBusy = computed(() => status.value === 'checking' || status.value === 'downloading')

  // ETag of the version.json, so that this file is only transferred when needed.
  let versionEtag: string | null = null

  function reset(): void {
    status.value = 'idle'
    error.value = null
    available.value = null
  }

  /** Reads `version.json`. `undefined` means: not present or not parseable. */
  async function readRemoteVersion(): Promise<{
    remote?: RemoteVersion
    failure?: UpdateError
    missing?: boolean
  }> {
    try {
      const response = await fetchText(versionUrl, versionEtag, null)
      if (response.etag) versionEtag = response.etag
      if (response.notModified) return { remote: undefined }
      if (response.status === 404) return { missing: true }
      if (response.status >= 400) {
        return { failure: { code: 'http_error', httpStatus: response.status, details: [] } }
      }
      const parsed = parseRemoteVersion(response.text)
      if (!parsed.ok) {
        return { failure: { code: 'invalid_version', details: parsed.issues } }
      }
      return { remote: parsed.version }
    } catch (cause) {
      return {
        failure: {
          code: navigatorSaysOnline() ? 'version_failed' : 'offline',
          details: [cause instanceof Error ? cause.message : String(cause)],
        },
      }
    }
  }

  /** Decides without downloading the full file. */
  async function detectChange(
    current: DataMeta | undefined,
    remote: RemoteVersion | undefined,
  ): Promise<ChangeDecision> {
    if (current?.etag) {
      const validator = await probeValidator(dataUrl, current.etag)
      if (validator !== 'unknown') {
        return validator === 'unchanged' ? UNCHANGED : CHANGED
      }
      // 'unknown' -> decide via the version number
    }

    if (remote === undefined) {
      // Without any change indicator: load on first start, otherwise do nothing.
      return current === undefined ? CHANGED : UNCHANGED
    }

    if (current?.version !== remote.version) return CHANGED
    return UNCHANGED
  }

  async function check(options: { silent?: boolean } = {}): Promise<UpdateStatus> {
    if (isBusy.value) return status.value
    if (!options.silent) error.value = null

    // 1. Cheap pre-check: `navigator.onLine` alone is not enough.
    if (!navigatorSaysOnline()) {
      status.value = 'offline'
      return status.value
    }

    status.value = 'checking'
    lastCheckedAt.value = Date.now()

    // 2. Real reachability check via fetch.
    const probe = await probeOnline()
    if (!probe.online) {
      status.value = 'offline'
      return status.value
    }

    const current = store.meta.value

    try {
      // 3. Determine the change without transferring the large file.
      const { remote, failure } = await readRemoteVersion()
      if (failure) {
        status.value = 'error'
        error.value = failure
        return status.value
      }

      const decision = await detectChange(current, remote)
      if (decision.kind === 'unchanged') {
        status.value = 'up-to-date'
        return status.value
      }

      // 4. Load the full file.
      status.value = 'downloading'
      const dataResponse = await fetchText(dataUrl, current?.etag ?? null, null)

      if (dataResponse.notModified) {
        status.value = 'up-to-date'
        return status.value
      }
      if (dataResponse.status >= 400) {
        status.value = 'error'
        error.value = { code: 'data_failed', httpStatus: dataResponse.status, details: [] }
        return status.value
      }
      if (dataResponse.text.trim().length === 0) {
        status.value = 'error'
        error.value = { code: 'data_failed', details: ['Leere Antwort erhalten.'] }
        return status.value
      }

      const nextVersion = remote?.version ?? (current?.version ?? 0) + 1

      available.value = {
        version: remote ?? { version: nextVersion },
        raw: dataResponse.text,
        descriptor: {
          version: nextVersion,
          etag: dataResponse.etag,
          lastModified: dataResponse.lastModified,
          updatedAt: remote?.updatedAt ?? null,
          source: dataUrl,
        },
      }
      status.value = 'available'
      return status.value
    } catch (cause) {
      status.value = 'error'
      error.value = {
        code: navigatorSaysOnline() ? 'unreachable' : 'offline',
        details: [cause instanceof Error ? cause.message : String(cause)],
      }
      return status.value
    }
  }

  async function applyPending(): Promise<DataMeta | undefined> {
    const pending = available.value
    if (!pending) return undefined

    status.value = 'downloading'
    try {
      // applyRemote validates in the worker and swaps atomically.
      const meta = await store.applyRemote(pending.raw, pending.descriptor)
      available.value = null
      status.value = 'applied'
      return meta
    } catch {
      // Broken JSON: the old data is preserved.
      status.value = 'error'
      error.value = { code: 'parse_failed', details: store.parseDetails.value }
      return undefined
    }
  }

  return {
    status,
    error,
    available,
    lastCheckedAt,
    isBusy,
    check,
    applyPending,
    reset,
  }
}
