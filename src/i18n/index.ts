/**
 * Very lean i18n access: typed keys, `{placeholder}` substitution.
 * Deliberately without a framework - the app has exactly one language (German),
 * but the structure is set up so that more languages only need one object.
 */
import { computed, type ComputedRef } from 'vue'

import { de, LOCALE, type MessageKey } from './de'

const MESSAGES: Record<string, unknown> = de

const PLACEHOLDER = /\{(\w+)\}/g

function resolvePath(path: string): unknown {
  return path.split('.').reduce<unknown>((node, segment) => {
    if (node && typeof node === 'object' && segment in (node as Record<string, unknown>)) {
      return (node as Record<string, unknown>)[segment]
    }
    return undefined
  }, MESSAGES)
}

export type Translate = (key: MessageKey, values?: Record<string, string | number>) => string

export function translate(key: MessageKey, values: Record<string, string | number> = {}): string {
  const resolved = resolvePath(key)
  if (typeof resolved !== 'string') {
    if (import.meta.env.DEV) console.warn(`[i18n] Unbekannter Schlüssel: ${key}`)
    return key
  }
  return resolved.replace(PLACEHOLDER, (_match, name: string) => {
    const value = values[name]
    return value === undefined ? `{${name}}` : String(value)
  })
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(LOCALE, options).format(value)
}

export function useI18n(): { t: Translate; locale: ComputedRef<string> } {
  return { t: translate, locale: computed(() => LOCALE) }
}

export type { MessageKey }
export { LOCALE }
