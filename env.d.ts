/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/vue" />

declare const __APP_BUILD_TIME__: string

interface ImportMetaEnv {
  /** Base URL of the backend, e.g. `/api` or `https://example.com/api`. */
  readonly VITE_API_BASE?: string
  /** URL of the full data file. */
  readonly VITE_DATA_URL?: string
  /** URL of the small version file used for the conditional request. */
  readonly VITE_VERSION_URL?: string
  /** Optional telemetry endpoint (dummy echo). */
  readonly VITE_ECHO_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: readonly string[]
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
  prompt(): Promise<void>
}

interface WindowEventMap {
  beforeinstallprompt: BeforeInstallPromptEvent
}
