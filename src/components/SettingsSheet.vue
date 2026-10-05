<script setup lang="ts">
/** Settings sheet: appearance, location, data updates, storage. */
import { computed } from 'vue'

import GeoStatusPanel from '@/components/GeoStatusPanel.vue'
import { translate } from '@/i18n'
import type { GeoController } from '@/services/geo-service'
import type { OnlineState } from '@/services/online-status'
import type { DataMeta } from '@/types/data'
import type { Settings } from '@/types/settings'
import { formatBytes, formatDateTime } from '@/utils/geo'

const props = defineProps<{
  settings: Settings
  online: OnlineState
  geo: GeoController
  meta: DataMeta | undefined
  count: number
  usage: { usage: number; quota: number } | undefined
  updateStatus: string
  swReady: boolean
  swError: string | null
}>()

const emit = defineEmits<{
  close: []
  update: [patch: Partial<Settings>]
  checkUpdates: []
  deleteData: []
  retrySw: []
}>()

const themes = [
  { value: 'system' as const, label: () => translate('settings.themeSystem') },
  { value: 'light' as const, label: () => translate('settings.themeLight') },
  { value: 'dark' as const, label: () => translate('settings.themeDark') },
]

const storageLabel = computed(() => (props.usage ? formatBytes(props.usage.usage) : '–'))

const buildTime = computed(() => __APP_BUILD_TIME__.slice(0, 10))

const onlineLabel = computed(() => {
  switch (props.online) {
    case 'online':
      return translate('status.online')
    case 'offline':
      return translate('status.offline')
    default:
      return translate('status.unknown')
  }
})

const swLabel = computed(() => {
  if (props.swError === 'insecure_context') return 'HTTPS erforderlich'
  if (props.swError) return translate('status.serviceWorkerOff')
  return props.swReady
    ? translate('status.serviceWorkerReady')
    : translate('status.serviceWorkerOff')
})
</script>

<template>
  <div class="sheet" role="dialog" aria-modal="true" :aria-label="translate('settings.title')">
    <div class="sheet__backdrop" @click="emit('close')" />

    <div class="sheet__panel">
      <div class="sheet__grip" aria-hidden="true" />

      <header class="sheet__header">
        <h2 class="sheet__title">{{ translate('settings.title') }}</h2>
        <button
          class="sheet__close"
          type="button"
          :aria-label="translate('common.close')"
          @click="emit('close')"
        >
          ✕
        </button>
      </header>

      <!-- Darstellung -->
      <section class="group">
        <h3 class="group__title">{{ translate('settings.appearance') }}</h3>
        <div class="segmented" role="group">
          <button
            v-for="option in themes"
            :key="option.value"
            type="button"
            class="segmented__option"
            :class="{ 'segmented__option--active': settings.theme === option.value }"
            :aria-pressed="settings.theme === option.value"
            @click="emit('update', { theme: option.value })"
          >
            {{ option.label() }}
          </button>
        </div>

        <label class="switch">
          <input
            type="checkbox"
            :checked="settings.sortBy === 'name'"
            @change="
              emit('update', {
                sortBy: ($event.target as HTMLInputElement).checked ? 'name' : 'distance',
              })
            "
          />
          <span>
            {{ translate('settings.sortByName') }}
            <small>{{ translate('settings.sortByNameHint') }}</small>
          </span>
        </label>
      </section>

      <!-- Location: the full GPS display was moved here -->
      <section class="group">
        <h3 class="group__title">{{ translate('settings.location') }}</h3>
        <GeoStatusPanel
          :geo="geo"
          :high-accuracy="settings.highAccuracy"
          @update="emit('update', $event)"
        />
        <label class="switch">
          <input
            type="checkbox"
            :checked="settings.autoStartTracking"
            @change="
              emit('update', { autoStartTracking: ($event.target as HTMLInputElement).checked })
            "
          />
          <span>
            {{ translate('settings.autoStart') }}
            <small>{{ translate('settings.autoStartHint') }}</small>
          </span>
        </label>
      </section>

      <!-- Connection -->
      <section class="group">
        <h3 class="group__title">{{ translate('header.connection') }}</h3>
        <dl class="kv">
          <div>
            <dt>{{ translate('header.connection') }}</dt>
            <dd class="mono" :class="{ 'kv--offline': online === 'offline' }">{{ onlineLabel }}</dd>
          </div>
        </dl>
      </section>

      <!-- Datenupdates -->
      <section class="group">
        <h3 class="group__title">{{ translate('settings.updates') }}</h3>
        <label class="switch">
          <input
            type="checkbox"
            :checked="settings.autoCheckUpdates"
            @change="
              emit('update', { autoCheckUpdates: ($event.target as HTMLInputElement).checked })
            "
          />
          <span>
            {{ translate('update.autoCheck') }}
            <small>{{ translate('update.autoCheckHint') }}</small>
          </span>
        </label>
        <label class="switch" :class="{ 'switch--muted': !settings.autoCheckUpdates }">
          <input
            type="checkbox"
            :checked="settings.autoApplyUpdates"
            @change="
              emit('update', { autoApplyUpdates: ($event.target as HTMLInputElement).checked })
            "
          />
          <span>
            {{ translate('update.autoApply') }}
            <small>{{ translate('update.autoApplyHint') }}</small>
          </span>
        </label>

        <button
          class="button button--ghost settings__action"
          type="button"
          @click="emit('checkUpdates')"
        >
          {{ translate('update.checkNow') }}
        </button>
        <p class="group__note">{{ translate('status.dataVersion') }}: {{ updateStatus }}</p>
      </section>

      <!-- Storage and data -->
      <section class="group">
        <h3 class="group__title">{{ translate('data.title') }}</h3>
        <dl class="kv">
          <div>
            <dt>{{ translate('status.dataVersion') }}</dt>
            <dd class="mono">{{ meta ? meta.version : translate('status.noData') }}</dd>
          </div>
          <div>
            <dt>{{ translate('status.dataCount') }}</dt>
            <dd class="mono">{{ count }}</dd>
          </div>
          <div>
            <dt>{{ translate('status.lastFetched') }}</dt>
            <dd class="mono">{{ meta ? formatDateTime(meta.fetchedAt) : '–' }}</dd>
          </div>
          <div>
            <dt>{{ translate('settings.storageUsed') }}</dt>
            <dd class="mono">{{ storageLabel }}</dd>
          </div>
          <div>
            <dt>{{ translate('data.source') }}</dt>
            <dd class="mono settings__source">{{ meta?.source ?? '–' }}</dd>
          </div>
          <div>
            <dt>{{ translate('status.serviceWorker') }}</dt>
            <dd class="mono">
              {{ swLabel }}
              <button v-if="swError" class="link" type="button" @click="emit('retrySw')">
                {{ translate('common.retry') }}
              </button>
            </dd>
          </div>
        </dl>

        <button
          class="button button--ghost settings__action"
          type="button"
          @click="emit('deleteData')"
        >
          {{ translate('data.deleteLocal') }}
        </button>
      </section>

      <!-- Datenschutz -->
      <section class="group">
        <h3 class="group__title">{{ translate('settings.privacy') }}</h3>
        <label class="switch">
          <input
            type="checkbox"
            :checked="settings.echoEnabled"
            @change="emit('update', { echoEnabled: ($event.target as HTMLInputElement).checked })"
          />
          <span>
            {{ translate('settings.echoEnabled') }}
            <small>{{ translate('settings.echoHint') }}</small>
          </span>
        </label>
        <p class="group__note">{{ translate('settings.buildInfo') }}: {{ buildTime }}</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.sheet {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.sheet__backdrop {
  position: absolute;
  inset: 0;
  background: rgb(12 8 2 / 55%);
  backdrop-filter: blur(2px);
}

.sheet__panel {
  position: relative;
  width: min(640px, 100%);
  max-height: 90dvh;
  overflow-y: auto;
  padding: var(--space-3) var(--space-4) calc(var(--safe-bottom) + var(--space-6));
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  background: var(--bg-elevated);
  box-shadow: var(--shadow-lg);
}

.sheet__grip {
  width: 42px;
  height: 4px;
  margin: 0 auto var(--space-3);
  border-radius: 999px;
  background: var(--surface-border);
}

.sheet__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}

.sheet__title {
  font-size: 1.15rem;
}

.sheet__close {
  width: 36px;
  height: 36px;
  border: 1px solid var(--surface-border);
  border-radius: 50%;
  background: transparent;
}

.group {
  padding: var(--space-4) 0;
  border-top: 1px solid var(--surface-border);
}

.group:first-of-type {
  border-top: none;
  padding-top: 0;
}

.group__title {
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-faint);
  margin-bottom: var(--space-3);
}

.group__note {
  margin-top: var(--space-2);
  font-size: 0.72rem;
  color: var(--text-faint);
}

.segmented {
  display: flex;
  gap: 4px;
  padding: 4px;
  border-radius: var(--radius-md);
  background: var(--bg-sunken);
  margin-bottom: var(--space-3);
}

.segmented__option {
  flex: 1;
  min-height: 38px;
  border: none;
  border-radius: calc(var(--radius-md) - 6px);
  background: transparent;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-muted);
}

.segmented__option--active {
  background: var(--bg-elevated);
  color: var(--text);
  box-shadow: var(--shadow-sm);
}

.switch {
  display: flex;
  gap: var(--space-3);
  align-items: flex-start;
  padding: var(--space-2) 0;
  cursor: pointer;
  font-size: 0.88rem;
}

.switch input {
  width: 22px;
  height: 22px;
  margin: 1px 0 0;
  accent-color: var(--accent);
  flex-shrink: 0;
}

.switch small {
  display: block;
  font-size: 0.72rem;
  color: var(--text-faint);
  margin-top: 2px;
}

.switch--muted {
  opacity: 0.6;
}

.settings__action {
  width: 100%;
  margin-top: var(--space-3);
}

.kv {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: var(--space-3);
  margin: 0;
}

.kv dt {
  font-size: 0.62rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-faint);
}

.kv dd {
  margin: 2px 0 0;
  font-size: 0.82rem;
  font-weight: 600;
  word-break: break-all;
}

.kv--offline {
  color: var(--danger);
}

.settings__source {
  font-size: 0.7rem !important;
  font-weight: 400 !important;
}

.link {
  border: none;
  background: none;
  color: var(--accent);
  text-decoration: underline;
  padding: 0;
  font-size: 0.75rem;
}
</style>
