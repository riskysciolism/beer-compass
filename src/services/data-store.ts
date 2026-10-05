/**
 * Data store: the single source of truth for the app.
 *
 * Reads **always** come from IndexedDB first. Network access only exists
 * in the update service and writes back into the DB atomically.
 */
import { computed, ref, type ComputedRef, type Ref } from 'vue'

import { dataUrl } from '@/config'
import {
  clearDataset,
  estimateUsage,
  readItemCount,
  readItems,
  readMeta,
  replaceDataset,
} from '@/db/repository'
import { parseDataset } from '@/services/parser'
import type { DataMeta, Item, StoredItem } from '@/types/data'

export type DataSourceKind = 'local' | 'network' | 'none'

export interface DatasetInfo {
  meta: DataMeta | undefined
  count: number
  loadedAt: number | null
}

export interface LoadState {
  loading: Ref<boolean>
  error: Ref<string | null>
  items: Ref<StoredItem[]>
  meta: Ref<DataMeta | undefined>
  count: ComputedRef<number>
  hasData: ComputedRef<boolean>
  source: Ref<DataSourceKind>
  /** Details of the last validation error (e.g. JSON locations). */
  parseDetails: Ref<string[]>
  parseErrorCode: Ref<string | null>
  usage: Ref<{ usage: number; quota: number } | undefined>
  load(): Promise<DatasetInfo>
  applyRemote(
    raw: string,
    meta: Omit<DataMeta, 'checksum' | 'count' | 'fetchedAt'>,
  ): Promise<DataMeta>
  reset(): Promise<void>
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export function createDataStore() {
  const items = ref<StoredItem[]>([])
  const meta = ref<DataMeta | undefined>(undefined)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const source = ref<DataSourceKind>('none')
  const usage = ref<{ usage: number; quota: number } | undefined>(undefined)
  const parseDetails = ref<string[]>([])
  const parseErrorCode = ref<string | null>(null)

  const count = computed(() => items.value.length)
  const hasData = computed(() => items.value.length > 0)

  /** Reads the local state. The network is deliberately not touched here. */
  async function load(): Promise<DatasetInfo> {
    loading.value = true
    error.value = null
    try {
      const [rows, storedMeta, storedCount, storage] = await Promise.all([
        readItems(),
        readMeta(),
        readItemCount(),
        estimateUsage(),
      ])
      items.value = rows
      meta.value = storedMeta
      usage.value = storage
      source.value = storedCount > 0 ? 'local' : 'none'

      const info: DatasetInfo = {
        meta: storedMeta,
        count: storedCount,
        loadedAt: storedMeta?.fetchedAt ?? null,
      }
      return info
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      error.value = `db_error:${message}`
      throw cause
    } finally {
      loading.value = false
    }
  }

  /**
   * Validates a downloaded file and replaces the local state
   * atomically. On an error **nothing** is written.
   */
  async function applyRemote(
    raw: string,
    descriptor: Omit<DataMeta, 'checksum' | 'count' | 'fetchedAt'>,
  ): Promise<DataMeta> {
    loading.value = true
    error.value = null
    parseDetails.value = []
    parseErrorCode.value = null
    try {
      const validated: Item[] = await parseDataset(raw, descriptor.version)

      const checksum = await sha256Hex(validated.map((item) => item.name).join(''))
      const stored: StoredItem[] = validated.map((item, index) => ({
        ...item,
        id: index + 1,
        version: descriptor.version,
      }))

      const nextMeta: DataMeta = {
        ...descriptor,
        checksum,
        count: stored.length,
        fetchedAt: Date.now(),
      }

      await replaceDataset({ items: stored, meta: nextMeta })

      items.value = stored
      meta.value = nextMeta
      source.value = 'network'
      usage.value = await estimateUsage()
      return nextMeta
    } catch (cause) {
      const code =
        cause instanceof Error && 'code' in cause
          ? String((cause as { code: unknown }).code)
          : 'unknown'
      const details =
        cause instanceof Error && 'details' in cause
          ? ((cause as { details: string[] }).details ?? [])
          : []
      parseErrorCode.value = code
      parseDetails.value = details
      error.value = `parse_error:${code}`
      throw cause
    } finally {
      loading.value = false
    }
  }

  async function reset(): Promise<void> {
    await clearDataset()
    items.value = []
    meta.value = undefined
    source.value = 'none'
    parseDetails.value = []
    parseErrorCode.value = null
    usage.value = await estimateUsage()
  }

  return {
    items,
    meta,
    loading,
    error,
    source,
    usage,
    count,
    hasData,
    parseDetails,
    parseErrorCode,
    load,
    applyRemote,
    reset,
    dataUrl,
  }
}

export type DataStore = ReturnType<typeof createDataStore>

let store: DataStore | undefined

export function useDataStore(): DataStore {
  store ??= createDataStore()
  return store
}
