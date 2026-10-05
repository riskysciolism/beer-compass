/**
 * Data model of the app - pure type declarations without runtime code, so that
 * the main thread does not have to load a validation library.
 *
 * The delivered file matches this model exactly:
 *
 * ```json
 * [{ "position": { "longitude": 4.88, "latitude": 52.2 },
 *    "address": "…", "image": "<base64>", "name": "…", "description": "…" }]
 * ```
 *
 * The matching schemas live in `src/schemas/dataset.ts` (zod, in the web worker).
 */

export interface Position {
  longitude: number
  latitude: number
}

export interface Item {
  position: Position
  address: string
  image: string
  name: string
  description: string
}

/** `version.json` - deliberately tolerant so that an old backend blocks nothing. */
export interface RemoteVersion {
  version: number
  updatedAt?: string
  count?: number
}

/** An item as stored in IndexedDB - `id` is the numeric primary key in the store. */
export interface StoredItem extends Item {
  /** Consecutive primary key so that the list can be virtualized. */
  id: number
  /** Version of the dataset this item comes from. */
  version: number
}

/** Metadata about the local data state. */
export interface DataMeta {
  /** Version from `version.json`. */
  version: number
  /** When the data was last loaded successfully. */
  fetchedAt: number
  /** ETag of the response, for the next conditional request. */
  etag: string | null
  /** Last-Modified header of the response. */
  lastModified: string | null
  /** Aktualisierungszeitpunkt laut Datenquelle. */
  updatedAt: string | null
  /** Number of stored entries. */
  count: number
  /** URL the data originates from. */
  source: string
  /** Checksum of the content, to detect duplicates. */
  checksum: string
}
