/**
 * Entry point of the app.
 *
 * Order:
 * 1. Load settings (apply the theme immediately to avoid a flash).
 *   2. App mounten.
 * 3. Register the service worker (production only - in dev it disturbs HMR).
 */
import { createApp } from 'vue'

import App from './App.vue'
import { useSettings } from '@/services/settings-store'
import './styles/main.css'

async function bootstrap(): Promise<void> {
  const settingsStore = useSettings()
  try {
    await settingsStore.load()
  } catch (cause) {
    console.warn('[boot] Einstellungen konnten nicht geladen werden:', cause)
  }

  // The default export of a .vue file is not resolvable for the ESLint TS
  // program; `npm run typecheck` does the real type checking.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  createApp(App).mount('#app')
  document.getElementById('app-boot')?.remove()
}

void bootstrap()
