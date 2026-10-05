/**
 * Reading and writing the main data in IndexedDB.
 *
 * Core of the update logic: `replaceDataset` clears and refills `items` in
 * one** transaction and sets the metadata in the same run. If the
 * download or the validation aborts earlier, nothing has been written - the
 * old data stays untouched (atomic replacement).
 */
import { getDb } from '@/db/database'
import type { DataMeta, StoredItem } from '@/types/data'
import { DEFAULT_SETTINGS, normalizeSettings, type Settings } from '@/types/settings'

const META_KEY = 'dataset'
const SETTINGS_KEY = 'user'

/* ------------------------------------------------------------- Metadaten -- */

export async function readMeta(): Promise<DataMeta | undefined> {
  const db = await getDb()
  const row = await db.get('meta', META_KEY)
  if (!row) return undefined
  const { key: _key, ...meta } = row
  return meta
}

export async function readItemCount(): Promise<number> {
  const db = await getDb()
  return db.count('items')
}

/* ---------------------------------------------------------------- Lesen --- */

/**
 * Loads all entries. The store is keyPath based (`id` = running number),
 * the list is virtualized in the UI afterwards, so that even tens of
 * thousands of entries stay smooth.
 */
export async function readItems(): Promise<StoredItem[]> {
  const db = await getDb()
  return db.getAll('items')
}

/* --------------------------------------------------------------- Schreiben - */

export interface ReplaceDatasetInput {
  items: StoredItem[]
  meta: DataMeta
}

/**
 * Atomic replacement of the complete dataset.
 * IndexedDB transactions are atomic: on an error the whole
 * run is rolled back and the previous data state stays valid.
 */
export async function replaceDataset({ items, meta }: ReplaceDatasetInput): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(['items', 'meta'], 'readwrite')
  const itemStore = tx.objectStore('items')
  await itemStore.clear()
  for (const item of items) {
    await itemStore.put(item)
  }
  await tx.objectStore('meta').put({ key: META_KEY, ...meta })
  await tx.done
}

/** Clears all data (e.g. "delete local data"). */
export async function clearDataset(): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(['items', 'meta'], 'readwrite')
  await tx.objectStore('items').clear()
  await tx.objectStore('meta').delete(META_KEY)
  await tx.done
}

/** Free storage quota of the origin (for the display). */
export async function estimateUsage(): Promise<{ usage: number; quota: number } | undefined> {
  if (!navigator.storage?.estimate) return undefined
  const estimate = await navigator.storage.estimate()
  return { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 }
}

/** Requests persistent storage so the browser does not evict automatically. */
export async function requestPersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  if (await navigator.storage.persisted()) return true
  return navigator.storage.persist()
}

/* ---------------------------------------------------------- Einstellungen - */

export async function readSettings(): Promise<Settings> {
  const db = await getDb()
  const row = await db.get('settings', SETTINGS_KEY)
  if (!row) return { ...DEFAULT_SETTINGS }
  return normalizeSettings(row)
}

export async function writeSettings(patch: Partial<Settings>): Promise<Settings> {
  const db = await getDb()
  const current = await readSettings()
  const next = normalizeSettings({ ...current, ...patch })
  await db.put('settings', { key: SETTINGS_KEY, ...next })
  return next
}
