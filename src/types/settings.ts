/**
 * User settings - stored in IndexedDB (deliberately not in localStorage).
 *
 * The normalization is hand-written instead of using zod: the values are simple
 * flags and enums. That keeps zod reserved for the web worker, where it
 * validates the large dataset - which saves the main bundle the library.
 */

export const THEME_VALUES = ['system', 'light', 'dark'] as const
export const SORT_VALUES = ['distance', 'name'] as const

export type Theme = (typeof THEME_VALUES)[number]
export type SortBy = (typeof SORT_VALUES)[number]

export interface Settings {
  /** Automatic update check (default: off). */
  autoCheckUpdates: boolean
  /** Take over new data without asking. */
  autoApplyUpdates: boolean
  /** High GPS accuracy (default: off, saves battery). */
  highAccuracy: boolean
  /** Measure automatically when the position view opens. */
  autoStartTracking: boolean
  /** 'system' | 'light' | 'dark' */
  theme: Theme
  /** Sort order of the list. */
  sortBy: SortBy
  /** Optional status report to the echo endpoint after a data sync. */
  echoEnabled: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  autoCheckUpdates: false,
  autoApplyUpdates: false,
  highAccuracy: false,
  autoStartTracking: true,
  theme: 'system',
  sortBy: 'distance',
  echoEnabled: true,
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback
}

/**
 * Accepts only known fields from arbitrary input (IndexedDB, older version).
 * Unknown fields are dropped, missing ones are reset to the default.
 */
export function normalizeSettings(input: unknown): Settings {
  const record = (typeof input === 'object' && input !== null ? input : {}) as Record<
    string,
    unknown
  >
  return {
    autoCheckUpdates: bool(record.autoCheckUpdates, DEFAULT_SETTINGS.autoCheckUpdates),
    autoApplyUpdates: bool(record.autoApplyUpdates, DEFAULT_SETTINGS.autoApplyUpdates),
    highAccuracy: bool(record.highAccuracy, DEFAULT_SETTINGS.highAccuracy),
    autoStartTracking: bool(record.autoStartTracking, DEFAULT_SETTINGS.autoStartTracking),
    theme: oneOf(record.theme, THEME_VALUES, DEFAULT_SETTINGS.theme),
    sortBy: oneOf(record.sortBy, SORT_VALUES, DEFAULT_SETTINGS.sortBy),
    echoEnabled: bool(record.echoEnabled, DEFAULT_SETTINGS.echoEnabled),
  }
}
