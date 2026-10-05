import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

import { STORAGE } from '@/config'
import type { DataMeta, StoredItem } from '@/types/data'
import type { Settings } from '@/types/settings'

/**
 * Datenbank-Schema.
 *
 * - `items` : the actual records (main data, never localStorage)
 * - `meta` : exactly one record with the data state (ETag, version, timestamp)
 * - `settings`: Benutzereinstellungen
 * - `identity`: random client ID for the echo endpoint
 *
 * A failed import cannot damage the old data: the
 * swap happens entirely inside one IndexedDB transaction
 * (`replaceDataset`), so no temporary staging is needed.
 */
export interface BeerCompassDB extends DBSchema {
  items: {
    key: number
    value: StoredItem
    indexes: { byPosition: [number, number] }
  }
  meta: {
    key: string
    value: { key: string } & DataMeta
  }
  settings: {
    key: string
    value: { key: string } & Settings
  }
  identity: {
    key: string
    value: { key: string; value: string }
  }
}

let dbPromise: Promise<IDBPDatabase<BeerCompassDB>> | undefined

export function getDb(): Promise<IDBPDatabase<BeerCompassDB>> {
  dbPromise ??= openDB<BeerCompassDB>(STORAGE.dbName, STORAGE.dbVersion, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('items')) {
        const items = db.createObjectStore('items', { keyPath: 'id' })
        items.createIndex('byPosition', ['position.longitude', 'position.latitude'])
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains('identity')) {
        db.createObjectStore('identity', { keyPath: 'key' })
      }
    },
    blocked() {
      console.warn('[db] Andere Tab-Instanz blockiert das Datenbank-Update. Andere Tabs schließen.')
    },
    blocking() {
      // Close the window so the next version can start.
      console.warn('[db] Update blockiert – schließe andere Tabs dieser App.')
    },
  })
  return dbPromise
}

/** Resolves a blocked connection (e.g. after a hot reload). */
export function closeDb(): void {
  const current = dbPromise
  dbPromise = undefined
  void current?.then((db) => db.close()).catch(() => undefined)
}
