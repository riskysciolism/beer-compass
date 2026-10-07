<script setup lang="ts">
/**
 * Root component: wires data store, update service, GPS and the UI.
 *
 * Structure of the main screen (no tabs):
 * Header (title + settings button) -> notices -> compass -> list
 * The selection is shown as a badge directly below the compass, which steers
 * the compass needle.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import AppHeader from '@/components/AppHeader.vue'
import CompassPanel from '@/components/CompassPanel.vue'
import InstallBanner from '@/components/InstallBanner.vue'
import ItemDetailSheet from '@/components/ItemDetailSheet.vue'
import ItemList from '@/components/ItemList.vue'
import NoticeBanner from '@/components/NoticeBanner.vue'
import SettingsSheet from '@/components/SettingsSheet.vue'
import { translate } from '@/i18n'
import { reportSync } from '@/services/echo'
import { useDataStore } from '@/services/data-store'
import { useGeo } from '@/services/geo-service'
import {
  looksOnline,
  navigatorSaysOnline,
  probeOnline,
  watchOnlineStatus,
  type OnlineState,
} from '@/services/online-status'
import { useOrientation } from '@/services/orientation-service'
import { useServiceWorker } from '@/services/sw-registration'
import { useSettings } from '@/services/settings-store'
import { createUpdateService } from '@/services/update-service'
import type { StoredItem } from '@/types/data'
import type { Settings, SortBy } from '@/types/settings'
import { requestPersistence } from '@/db/repository'
import { track } from '@/services/analytics'
import { distanceBetween } from '@/utils/geo'

/* ------------------------------------------------------------- State ---- */
const store = useDataStore()
const settingsStore = useSettings()
const geo = useGeo()
const orientation = useOrientation()
const serviceWorker = useServiceWorker()

const update = createUpdateService(store)

const online = ref<OnlineState>(looksOnline())
const settingsOpen = ref(false)
const selected = ref<StoredItem | null>(null)
const detailItem = ref<StoredItem | null>(null)
const bootError = ref<string | null>(null)
const dismissedUpdateNotice = ref(false)
/** From this scroll position on the list counts as "scrolled" (compass at 50%). */
const SCROLL_THRESHOLD_PX = 8

/** Compass at 50%: set as soon as the list has been scrolled. */
const listScrolled = ref(false)
/**
 * After a selection the compass is set to 100%. Scroll events that
 * arrive immediately afterwards are ignored: the tap may first scroll the entry
 * under the finger into place, and a fling should not shrink the compass
 * right away again. Only a later scroll movement
 * (after `SHRINK_GRACE_MS`) shrinks it again.
 */
const SHRINK_GRACE_MS = 600
const suppressShrink = ref(false)
let selectedAt = 0

const compassCompact = computed(() => listScrolled.value && !suppressShrink.value)

const settings = computed(() => settingsStore.settings.value)

const position = computed(() => {
  const fix = geo.fix.value
  return fix ? { latitude: fix.latitude, longitude: fix.longitude } : null
})

/** Bearing and distance to the selected entry - the needle follows these values. */
const target = computed(() => {
  const current = position.value
  if (!selected.value || !current) return null
  const result = distanceBetween(current, selected.value.position)
  return { bearing: result.bearing, meters: result.meters }
})

/**
 * Device heading for the compass rose.
 * Prefer the orientation sensor (magnetometer / gyro), fall back to GPS course
 * over ground when the sensor is unavailable or denied.
 */
const heading = computed(() => orientation.heading.value ?? geo.fix.value?.heading ?? null)

/* ------------------------------------------------------------ Start-up ----- */

function onVisibilityChange(): void {
  // Save energy: tracking pauses when the app goes into the background.
  if (document.visibilityState !== 'visible') {
    if (geo.isTracking.value) geo.stop()
    orientation.stop()
  }
}

let teardown: (() => void) | undefined

  onMounted(async () => {
  void track({ event_type: 'open' })

  const markOnline = () => (online.value = 'unknown')
  const markOffline = () => (online.value = 'offline')
  window.addEventListener('online', markOnline)
  window.addEventListener('offline', markOffline)

  const stopWatching = watchOnlineStatus((state) => {
    online.value = state
    if (state === 'online' && settings.value.autoCheckUpdates) void runUpdateCheck({ silent: true })
  })

  const stopAll = () => {
    window.removeEventListener('online', markOnline)
    window.removeEventListener('offline', markOffline)
    window.removeEventListener('pagehide', stopAll)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    stopWatching()
    geo.stop()
    orientation.stop()
    teardown = undefined
  }
  teardown = stopAll
  window.addEventListener('pagehide', stopAll)
  document.addEventListener('visibilitychange', onVisibilityChange)

  try {
    await settingsStore.load()
    const info = await store.load()
    void requestPersistence()

    if (!info.count) await initialLoad()
    else if (settings.value.autoCheckUpdates) void runUpdateCheck({ silent: true })
  } catch (cause) {
    bootError.value = cause instanceof Error ? cause.message : String(cause)
  }

  // Without its own check the connection status stays "unknown" - the watcher
  // only reacts to real online/offline events.
  if (navigatorSaysOnline())
    void probeOnline().then((probe) => {
      online.value = probe.online ? 'online' : 'offline'
    })

  // Autostart now belongs to the app, no longer to a single view.
  if (settings.value.autoStartTracking)
    await geo.start({ highAccuracy: settings.value.highAccuracy })
  else await geo.refreshPermission()

  // Start the orientation sensor as well; it is independent of GPS and is the
  // primary source for the compass rose heading.
  void orientation.start()

  void serviceWorker.register()
})

onBeforeUnmount(() => {
  teardown?.()
})

watch(
  () => settings.value.highAccuracy,
  async (value) => {
    if (!settings.value.autoStartTracking || !geo.isTracking.value) return
    // `start()` resolves immediately while tracking is active - stop first so that
    // the new accuracy is actually picked up.
    geo.stop()
    await geo.start({ highAccuracy: value })
  },
)

/**
 * First start: fetch the data. Without network and without local data there is
 * understandable message instead of a crash.
 *
 * On the first start there is nothing to confirm - it loads immediately.
 * A confirmation is only needed for *updates* when data already exists.
 */
async function initialLoad(): Promise<void> {
  if (!navigatorSaysOnline()) return
  const probe = await probeOnline()
  if (!probe.online) return

  const status = await update.check()
  if (status === 'available') await applyUpdate()
}

/* ------------------------------------------------------------- Updates ------ */

async function runUpdateCheck(options: { silent?: boolean } = {}): Promise<void> {
  dismissedUpdateNotice.value = false
  const status = await update.check(options)
  if (status === 'available' && settings.value.autoApplyUpdates) await applyUpdate()
}

async function applyUpdate(): Promise<void> {
  const meta = await update.applyPending()
  if (!meta) return
  dismissedUpdateNotice.value = true
  if (settings.value.echoEnabled) {
    void reportSync({ version: meta.version, count: meta.count, checksum: meta.checksum })
  }
  window.setTimeout(() => update.reset(), 6000)
}

const updateNotice = computed(() => {
  if (dismissedUpdateNotice.value) return null
  if (update.status.value === 'available' && update.available.value) {
    const pending = update.available.value
    return {
      tone: 'info' as const,
      title: translate('update.available'),
      description: translate('update.availableDetail')
        .replace('{version}', String(pending.version.version))
        .replace('{count}', String(pending.version.count ?? '?')),
      primary: translate('update.apply'),
      secondary: translate('update.discard'),
    }
  }
  if (update.status.value === 'error' && update.error.value) {
    return {
      tone: 'danger' as const,
      title: translate('update.failed'),
      description: [update.error.value.code, ...update.error.value.details].join(' · '),
      primary: translate('common.retry'),
      secondary: undefined,
    }
  }
  return null
})

const dataProblem = computed(() => {
  if (store.hasData.value) return null
  if (online.value === 'offline' && store.count.value === 0) {
    return {
      tone: 'warning' as const,
      title: translate('data.title'),
      description: translate('data.offlineFirstLoad'),
      primary: undefined,
      secondary: undefined,
    }
  }
  return null
})

const parseProblem = computed(() => {
  const code = store.parseErrorCode.value
  if (!code) return null
  const description =
    code === 'invalid_json'
      ? translate('data.parseErrorJson')
      : code === 'worker_failed'
        ? translate('data.parseError')
        : translate('data.parseErrorSchema')

  const details = store.parseDetails.value
  return {
    tone: 'danger' as const,
    title: translate('data.parseError'),
    description:
      details.length > 0
        ? `${description} ${translate('data.parseErrorDetail')} ${details.join(' · ')}`
        : description,
  }
})

const swNotice = computed(() => {
  if (!serviceWorker.updateAvailable.value) return null
  return {
    tone: 'info' as const,
    title: translate('update.appUpdateAvailable'),
    description: translate('update.appUpdateDetail'),
    primary: translate('update.appUpdateReload'),
    secondary: translate('update.appUpdateLater'),
  }
})

/* ------------------------------------------------------------- Aktionen ----- */

function onSelect(item: StoredItem): void {
  selected.value = item
  void track({ event_type: 'select', item_id: item.id })
  // A selection brings the compass back to 100%; the scroll flag stays.
  suppressShrink.value = listScrolled.value
  selectedAt = performance.now()
}

function onListScrolled(scrollTop: number): void {
  listScrolled.value = scrollTop > SCROLL_THRESHOLD_PX

  // Back at the very top: everything back to the initial value.
  if (!listScrolled.value) {
    suppressShrink.value = false
    return
  }

  // Scrolling on after the selection shrinks the compass again.
  if (suppressShrink.value && performance.now() - selectedAt > SHRINK_GRACE_MS)
    suppressShrink.value = false
}

function clearSelection(): void {
  selected.value = null
  suppressShrink.value = false
}

function onSortChange(sortBy: SortBy): void {
  void onSettingsUpdate({ sortBy })
}

async function onSettingsUpdate(patch: Partial<Settings>): Promise<void> {
  await settingsStore.update(patch)
}

async function deleteData(): Promise<void> {
  if (!window.confirm(translate('data.deleteConfirm'))) return
  await store.reset()
  update.reset()
  clearSelection()
  detailItem.value = null
}

function onNoticePrimary(): void {
  if (swNotice.value) void serviceWorker.applyUpdate()
  else if (updateNotice.value?.primary === translate('update.apply')) void applyUpdate()
  else if (updateNotice.value) void runUpdateCheck()
}

function onNoticeSecondary(): void {
  if (swNotice.value) return
  if (updateNotice.value?.secondary) dismissedUpdateNotice.value = true
}

watch(
  () => settings.value.autoApplyUpdates,
  (enabled) => {
    if (enabled && update.status.value === 'available') void applyUpdate()
  },
)
</script>

<template>
  <AppHeader @open-settings="settingsOpen = true" />

  <main class="layout">
    <div class="layout__notices">
      <NoticeBanner
        v-if="swNotice"
        :tone="swNotice.tone"
        :title="swNotice.title"
        :description="swNotice.description"
        :primary-label="swNotice.primary"
        :secondary-label="swNotice.secondary"
        live="polite"
        @primary="onNoticePrimary"
        @secondary="onNoticeSecondary"
      />

      <NoticeBanner
        v-if="updateNotice"
        :tone="updateNotice.tone"
        :title="updateNotice.title"
        :description="updateNotice.description"
        :primary-label="updateNotice.primary"
        :secondary-label="updateNotice.secondary"
        :busy="update.isBusy.value"
        @primary="onNoticePrimary"
        @secondary="onNoticeSecondary"
      />

      <NoticeBanner
        v-if="parseProblem"
        tone="danger"
        :title="parseProblem.title"
        :description="parseProblem.description"
        live="assertive"
      />

      <NoticeBanner
        v-if="dataProblem"
        tone="warning"
        :title="dataProblem.title"
        :description="dataProblem.description"
        :primary-label="translate('update.checkNow')"
        :busy="update.isBusy.value"
        @primary="runUpdateCheck()"
      />

      <NoticeBanner
        v-if="bootError"
        tone="danger"
        :title="translate('data.title')"
        :description="bootError"
        live="assertive"
      />

      <InstallBanner />
    </div>

    <CompassPanel
      :target="selected"
      :bearing="target?.bearing ?? null"
      :meters="target?.meters ?? null"
      :heading="heading"
      :accuracy="geo.fix.value?.accuracy ?? null"
      :status="geo.status.value"
      :has-fix="geo.fix.value !== null"
      :compact="compassCompact"
      @open-settings="settingsOpen = true"
      @open-details="detailItem = selected!"
      @clear-selection="clearSelection"
    />

    <ItemList
      class="layout__list"
      :items="store.items.value"
      :position="position"
      :settings="settings"
      :selected-id="selected?.id ?? null"
      @select="onSelect"
      @scrolled="onListScrolled"
      @sort-change="onSortChange"
    />
  </main>

  <ItemDetailSheet
    v-if="detailItem"
    :item="detailItem"
    :position="position"
    @close="detailItem = null"
  />

  <SettingsSheet
    v-if="settingsOpen"
    :settings="settings"
    :online="online"
    :geo="geo"
    :orientation="orientation"
    :meta="store.meta.value"
    :count="store.count.value"
    :usage="store.usage.value"
    :update-status="update.status.value"
    :sw-ready="serviceWorker.ready.value"
    :sw-error="serviceWorker.error.value"
    @close="settingsOpen = false"
    @update="onSettingsUpdate"
    @check-updates="runUpdateCheck()"
    @delete-data="deleteData"
    @retry-sw="serviceWorker.register()"
  />
</template>

<style scoped>
.layout {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-height: 0;
  padding: var(--space-4) var(--space-4) var(--space-5);
}

.layout__notices {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

/*
 * The list keeps a usable minimum (the sort bar sits inside it). If the screen
 * is too small for compass *and* list, `#app` scrolls as well - see
 * `styles/main.css`.
 */
.layout__list {
  flex: 1;
  min-height: 200px;
}

@media (min-width: 720px) {
  .layout {
    max-width: 780px;
    margin: 0 auto;
    width: 100%;
    padding-inline: var(--space-5);
  }
}
</style>
