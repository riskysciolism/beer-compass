<script setup lang="ts">
/**
 * Reduced GPS display for the settings: status, coordinates, accuracy
 * as well as start/stop and copy. Deliberately compact - the earlier maps with
 * heading, speed, altitude and measurement age are gone.
 */
import { computed, ref } from 'vue'

import { translate } from '@/i18n'
import { accuracyRating, type GeoController, type GeoFix } from '@/services/geo-service'
import { formatCoordinate } from '@/utils/geo'

const props = defineProps<{
  geo: GeoController
  highAccuracy: boolean
}>()

const emit = defineEmits<{ update: [patch: { highAccuracy: boolean }] }>()

const copied = ref(false)
let copyTimer: ReturnType<typeof setTimeout> | undefined

const fix = computed<GeoFix | null>(() => props.geo.fix.value)
const status = computed(() => props.geo.status.value)
const isTracking = computed(() => props.geo.isTracking.value)

const latitude = computed(() => (fix.value ? formatCoordinate(fix.value.latitude, 'N', 'S') : null))
const longitude = computed(() =>
  fix.value ? formatCoordinate(fix.value.longitude, 'E', 'W') : null,
)

const accuracy = computed(() => {
  const value = fix.value?.accuracy
  if (value === undefined) return null
  const rating = accuracyRating(value)
  return {
    rating,
    label: {
      good: translate('geo.accuracyGood'),
      fair: translate('geo.accuracyFair'),
      poor: translate('geo.accuracyPoor'),
    }[rating],
  }
})

const statusLabel = computed(() => {
  if (status.value === 'active') {
    return fix.value ? translate('geo.active') : translate('geo.waiting')
  }
  if (status.value === 'requesting') return translate('geo.waiting')
  if (status.value === 'denied') return translate('geo.error.denied')
  if (status.value === 'unsupported') return translate('geo.error.unsupported')
  if (status.value === 'unavailable') return translate('geo.error.unavailable')
  if (status.value === 'timeout') return translate('geo.error.timeout')
  return translate('geo.title')
})

const statusHint = computed(() => {
  switch (status.value) {
    case 'denied':
      return translate('geo.error.deniedHint')
    case 'unavailable':
      return translate('geo.error.unavailable')
    case 'timeout':
      return translate('geo.error.timeout')
    case 'error':
      return translate('geo.error.generic')
    default:
      return null
  }
})

const isError = computed(() =>
  ['denied', 'unsupported', 'unavailable', 'timeout', 'error'].includes(status.value),
)

async function start(): Promise<void> {
  await props.geo.start({ highAccuracy: props.highAccuracy })
}

async function copyCoordinates(): Promise<void> {
  const current = fix.value
  if (!current) return
  try {
    await navigator.clipboard.writeText(
      `${current.latitude.toFixed(6)}, ${current.longitude.toFixed(6)}`,
    )
    copied.value = true
    if (copyTimer) clearTimeout(copyTimer)
    copyTimer = setTimeout(() => (copied.value = false), 2000)
  } catch {
    copied.value = false
  }
}
</script>

<template>
  <div class="geo-panel">
    <div class="geo-panel__status">
      <span class="geo-panel__dot" :class="{ 'geo-panel__dot--error': isError }" />
      <span class="geo-panel__status-text">
        {{ statusLabel }}
        <small v-if="statusHint">{{ statusHint }}</small>
      </span>
      <span
        v-if="accuracy"
        class="geo-panel__accuracy mono"
        :class="`geo-panel__accuracy--${accuracy.rating}`"
      >
        ± {{ fix?.accuracy !== undefined ? Math.round(fix.accuracy) : '–' }} m ·
        {{ accuracy.label }}
      </span>
    </div>

    <dl v-if="fix" class="geo-panel__coords">
      <div>
        <dt>{{ translate('geo.latitude') }}</dt>
        <dd class="mono">{{ latitude?.decimal }}</dd>
        <dd class="mono geo-panel__dms">{{ latitude?.dms }}</dd>
      </div>
      <div>
        <dt>{{ translate('geo.longitude') }}</dt>
        <dd class="mono">{{ longitude?.decimal }}</dd>
        <dd class="mono geo-panel__dms">{{ longitude?.dms }}</dd>
      </div>
    </dl>
    <p v-else class="geo-panel__empty">–</p>

    <div class="geo-panel__actions">
      <button v-if="!isTracking" class="button button--small" type="button" @click="start">
        {{ translate('geo.start') }}
      </button>
      <button v-else class="button button--small button--ghost" type="button" @click="geo.stop()">
        {{ translate('geo.stop') }}
      </button>
      <button
        class="button button--small button--quiet"
        type="button"
        :disabled="!fix"
        @click="copyCoordinates"
      >
        {{ copied ? translate('geo.copied') : translate('geo.copyCoordinates') }}
      </button>
    </div>

    <label class="switch">
      <input
        type="checkbox"
        :checked="highAccuracy"
        @change="emit('update', { highAccuracy: ($event.target as HTMLInputElement).checked })"
      />
      <span>
        {{ translate('settings.highAccuracy') }}
        <small>{{ translate('settings.highAccuracyHint') }}</small>
      </span>
    </label>
  </div>
</template>

<style scoped>
.geo-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-3);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-md);
  background: var(--bg-sunken);
}

.geo-panel__status {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 0.82rem;
}

.geo-panel__status-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.geo-panel__status-text small {
  font-size: 0.72rem;
  color: var(--text-faint);
}

.geo-panel__dot {
  width: 8px;
  height: 8px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--ok);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ok) 22%, transparent);
}

.geo-panel__dot--error {
  background: var(--danger);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--danger) 22%, transparent);
}

.geo-panel__accuracy {
  margin-left: auto;
  flex-shrink: 0;
  font-size: 0.72rem;
  padding: 2px 8px;
  border-radius: 999px;
}

.geo-panel__accuracy--good {
  background: color-mix(in srgb, var(--ok) 18%, transparent);
  color: var(--ok);
}

.geo-panel__accuracy--fair {
  background: color-mix(in srgb, var(--warn) 18%, transparent);
  color: var(--warn);
}

.geo-panel__accuracy--poor {
  background: color-mix(in srgb, var(--danger) 18%, transparent);
  color: var(--danger);
}

.geo-panel__coords {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: var(--space-3);
  margin: 0;
}

.geo-panel__coords dt {
  font-size: 0.6rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-faint);
}

.geo-panel__coords dd {
  margin: 2px 0 0;
  font-size: 0.85rem;
  font-weight: 600;
}

.geo-panel__dms {
  font-weight: 400 !important;
  font-size: 0.7rem !important;
  color: var(--text-muted);
}

.geo-panel__empty {
  margin: 0;
  color: var(--text-faint);
}

.geo-panel__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.geo-panel__actions .button {
  flex: 1 1 130px;
}
</style>
