<script setup lang="ts">
/**
 * Compass area of the main screen: stylized compass with beer bottle needle
 * and a concise target line below it.
 *
 * Deliberately **without** GPS numbers (coordinates, accuracy, altitude) - those live
 * in a reduced form in the settings.
 */
import { computed } from 'vue'

import BeerCompass from '@/components/BeerCompass.vue'
import { translate } from '@/i18n'
import { formatDistance } from '@/utils/geo'
import type { GeoStatus } from '@/services/geo-service'
import type { StoredItem } from '@/types/data'

const props = defineProps<{
  /** Selected entry the needle points at. */
  target: StoredItem | null
  /** Bearing to the target in degrees. */
  bearing: number | null
  /** Distance to the target in meters. */
  meters: number | null
  /** Device heading, `null` without an orientation sensor. */
  heading: number | null
  accuracy: number | null
  /** GPS status from the geo service. */
  status: GeoStatus
  /** Is a position already available? */
  hasFix: boolean
  /** Compact (50%) as long as the list has been scrolled. */
  compact: boolean
}>()

const emit = defineEmits<{ openSettings: [] }>()

const distanceLabel = computed(() => (props.meters === null ? null : formatDistance(props.meters)))

/** Small accuracy badge top right next to the compass. */
const accuracyLabel = computed(() =>
  props.accuracy === null ? null : `± ${Math.round(props.accuracy)} m`,
)

/**
 * Hint line below the compass. With a selection the
 * banner appears instead (large name and distance, without a direction - that lives in the
 * needle); without a selection this text.
 */
const caption = computed(() => {
  // Without a position: say what is missing.
  if (!props.hasFix) {
    switch (props.status) {
      case 'denied':
        return translate('compass.noFixDenied')
      case 'idle':
        return translate('compass.noFix')
      case 'unsupported':
        return translate('geo.error.unsupported')
      case 'unavailable':
        return translate('geo.error.unavailable')
      case 'timeout':
        return translate('geo.error.timeout')
      case 'requesting':
        return translate('geo.waiting')
      default:
        return translate('compass.waitingForFix')
    }
  }

  // Position available, but nothing selected.
  return translate('compass.noTarget')
})

/** The start button belongs into the settings, not onto the main screen. */
const showStartHint = computed(() => !props.hasFix && props.status === 'idle')
</script>

<template>
  <section class="compass-panel" :class="{ 'compass-panel--compact': compact }">
    <div class="compass-panel__stage">
      <span
        v-if="accuracyLabel"
        class="compass-panel__accuracy mono"
        :aria-label="
          translate('compass.accuracyLabel').replace('{meters}', String(Math.round(accuracy ?? 0)))
        "
      >
        {{ accuracyLabel }}
      </span>

      <BeerCompass
        :bearing="target ? bearing : null"
        :heading="heading"
        :target-name="target?.name ?? null"
        :accuracy="accuracy"
        :compact="compact"
      />
    </div>

    <!-- Floating banner with the selected entry. -->
    <div v-if="target" class="compass-panel__banner">
      <span class="compass-panel__banner-label">{{ translate('compass.selectedLabel') }}</span>
      <span class="compass-panel__banner-value">
        <strong class="compass-panel__banner-name">{{ target.name }}</strong>
        <span v-if="distanceLabel" class="compass-panel__banner-distance mono">
          {{ distanceLabel }}
        </span>
      </span>
    </div>

    <p v-else class="compass-panel__caption">{{ caption }}</p>

    <button
      v-if="showStartHint"
      class="link compass-panel__link"
      type="button"
      @click="emit('openSettings')"
    >
      {{ translate('geo.start') }}
    </button>
  </section>
</template>

<style scoped>
.compass-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  /* Do not shrink: under space pressure the space comes from the list, not from
     dem Kompass – sonst wird das Zifferblatt gestaucht. */
  flex-shrink: 0;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-3) var(--space-4);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-lg);
  background: var(--bg-elevated);
}

/* Stage: holds compass and accuracy badge. */
.compass-panel__stage {
  position: relative;
  display: flex;
  justify-content: center;
  width: 100%;
}

/* Small accuracy display top right next to the compass. */
.compass-panel__accuracy {
  position: absolute;
  top: 4px;
  right: 0;
  z-index: 1;
  padding: 2px var(--space-2);
  border: 1px solid var(--surface-border);
  border-radius: 999px;
  background: var(--bg-sunken);
  color: var(--text-muted);
  font-size: 0.68rem;
  line-height: 1.4;
  white-space: nowrap;
}

.compass-panel__caption {
  max-width: 32ch;
  text-align: center;
  font-size: 0.82rem;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: font-size var(--transition);
}

.compass-panel--compact .compass-panel__caption {
  font-size: 0.76rem;
}

/*
 * Banner of the selected entry: overlaps the lower compass edge so that the
 * compass keeps as much space as possible at 100% and the banner looks "floating".
 */
.compass-panel__banner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  width: min(100%, 30ch);
  /* Negative spacing against the flex gap: the banner overlaps the lower
     Kompassrand um 8 px und wirkt dadurch schwebend. Mehr Überlappung würde bei
     südlicher Peilung den Flaschenfuß abschneiden. */
  margin-top: calc(-1 * var(--space-4));
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--accent);
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
  box-shadow: var(--shadow-md);
  text-align: center;
}

.compass-panel__banner-label {
  color: var(--text-faint);
  font-size: 0.66rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.compass-panel__banner-value {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: center;
  gap: var(--space-2);
  max-width: 100%;
}

.compass-panel__banner-name {
  max-width: 100%;
  font-size: 1.05rem;
  font-weight: 650;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.compass-panel__banner-distance {
  color: var(--accent);
  font-size: 1rem;
  font-weight: 600;
  white-space: nowrap;
}

.compass-panel--compact .compass-panel__banner {
  margin-top: calc(-1 * var(--space-3));
  padding: var(--space-1) var(--space-2);
}

.compass-panel--compact .compass-panel__banner-name {
  font-size: 0.88rem;
}

.compass-panel--compact .compass-panel__banner-distance {
  font-size: 0.84rem;
}

.compass-panel--compact .compass-panel__accuracy {
  top: 0;
  font-size: 0.64rem;
}

.compass-panel__link {
  margin-top: -4px;
}
</style>
