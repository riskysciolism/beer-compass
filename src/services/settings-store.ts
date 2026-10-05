/**
 * Reactive settings store. Like the main data it lives in IndexedDB
 * (deliberately not in localStorage).
 */
import { computed, ref, type ComputedRef, type Ref } from 'vue'

import { readSettings, writeSettings } from '@/db/repository'
import { DEFAULT_SETTINGS, type Settings } from '@/types/settings'

export interface SettingsStore {
  settings: Ref<Settings>
  ready: Ref<boolean>
  isDark: ComputedRef<boolean>
  prefersDark: Ref<boolean>
  load(): Promise<Settings>
  update(patch: Partial<Settings>): Promise<Settings>
  reset(): Promise<Settings>
}

export function createSettingsStore(): SettingsStore {
  const settings = ref<Settings>({ ...DEFAULT_SETTINGS })
  const ready = ref(false)
  const prefersDark = ref(false)

  const isDark = computed(() => {
    if (settings.value.theme === 'system') return prefersDark.value
    return settings.value.theme === 'dark'
  })

  async function load(): Promise<Settings> {
    settings.value = await readSettings()
    ready.value = true
    applyTheme()
    return settings.value
  }

  async function update(patch: Partial<Settings>): Promise<Settings> {
    settings.value = await writeSettings(patch)
    applyTheme()
    return settings.value
  }

  async function reset(): Promise<Settings> {
    return update({ ...DEFAULT_SETTINGS })
  }

  function applyTheme(): void {
    prefersDark.value = window.matchMedia('(prefers-color-scheme: dark)').matches
    document.documentElement.dataset.theme = isDark.value ? 'dark' : 'light'
  }

  if (typeof window !== 'undefined') {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => {
      prefersDark.value = event.matches
      applyTheme()
    })
  }

  return { settings, ready, isDark, prefersDark, load, update, reset }
}

let instance: SettingsStore | undefined

export function useSettings(): SettingsStore {
  instance ??= createSettingsStore()
  return instance
}
