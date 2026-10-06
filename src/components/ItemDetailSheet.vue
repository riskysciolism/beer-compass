<script setup lang="ts">
/** Detail view of an entry as a bottom sheet. */
import { computed, onBeforeUnmount, onMounted } from 'vue'

import { translate } from '@/i18n'
import type { StoredItem } from '@/types/data'
import {
  cardinalDirection,
  distanceBetween,
  formatDistance,
  mapUrl,
  type LatLon,
} from '@/utils/geo'
import { normalizeImageSource } from '@/utils/image'

const props = defineProps<{
  item: StoredItem
  position: LatLon | null
}>()

const emit = defineEmits<{ close: [] }>()

const image = computed(() => normalizeImageSource(props.item.image))

/** Distance and direction in one compact line - the arrow shows the bearing. */
const distance = computed(() => {
  if (!props.position) return null
  const result = distanceBetween(props.position, props.item.position)
  return {
    label: formatDistance(result.meters),
    direction: cardinalDirection(result.bearing),
    bearing: result.bearing,
  }
})

/** Feature tags (beer styles, taproom, outdoor area, …) as a grid. */
const features = computed(() => props.item.features ?? [])

/**
 * The `geo:` intent opens the map app configured on the device.
 * The app itself does not load anything from the network.
 */
const navigationUrl = computed(() => mapUrl(props.item))

function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close')
}

onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="sheet" role="dialog" aria-modal="true" :aria-label="item.name">
    <div class="sheet__backdrop" @click="emit('close')" />

    <div class="sheet__panel">
      <div class="sheet__grip" aria-hidden="true" />

      <header class="sheet__header">
        <img v-if="image" class="sheet__image" :src="image" alt="" decoding="async" />
        <div class="sheet__titles">
          <h2 class="sheet__name">{{ item.name }}</h2>
        </div>
        <button
          class="sheet__close"
          type="button"
          :aria-label="translate('list.close')"
          @click="emit('close')"
        >
          ✕
        </button>
      </header>

      <p class="sheet__description">{{ item.description }}</p>

      <!-- Distance and direction compact in one line, the arrow shows the bearing. -->
      <div v-if="distance" class="sheet__quick">
        <span class="sheet__quick-arrow" :style="{ transform: `rotate(${distance.bearing}deg)` }">
          ➤
        </span>
        <span class="visually-hidden">{{ translate('list.distance') }}: </span>
        <span class="sheet__quick-value mono">{{ distance.label }}</span>
        <span class="sheet__quick-separator" aria-hidden="true">·</span>
        <span class="visually-hidden">{{ translate('list.direction') }}: </span>
        <span class="sheet__quick-value mono">{{ distance.direction }}</span>
      </div>

      <div v-if="features.length > 0" class="sheet__block">
        <span class="sheet__label">{{ translate('list.features') }}</span>
        <ul class="sheet__features">
          <li v-for="feature in features" :key="feature" class="sheet__feature">{{ feature }}</li>
        </ul>
      </div>

      <!-- Address instead of coordinates - the position belongs in the settings. -->
      <div class="sheet__block">
        <span class="sheet__label">{{ translate('list.address') }}</span>
        <p class="sheet__address-value">{{ item.address }}</p>
      </div>

      <div class="sheet__actions">
        <a
          class="button sheet__navigate"
          :href="navigationUrl"
          :aria-label="translate('list.openInMaps')"
          :title="translate('list.openInMaps')"
        >
          ➤
        </a>
      </div>
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
  max-height: 88dvh;
  overflow-y: auto;
  padding: var(--space-3) var(--space-4) calc(var(--safe-bottom) + var(--space-5));
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  background: var(--bg-elevated);
  box-shadow: var(--shadow-lg);
  animation: slide-up 220ms cubic-bezier(0.2, 0, 0.2, 1);
}

@keyframes slide-up {
  from {
    transform: translateY(16px);
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .sheet__panel {
    animation: none;
  }
}

@media (min-width: 640px) {
  .sheet {
    align-items: center;
  }

  .sheet__panel {
    border-radius: var(--radius-lg);
  }
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
  gap: var(--space-3);
  align-items: flex-start;
}

.sheet__image {
  width: 72px;
  height: 72px;
  border-radius: var(--radius-md);
  object-fit: cover;
  background: var(--bg-sunken);
  flex-shrink: 0;
}

.sheet__titles {
  flex: 1;
  min-width: 0;
}

.sheet__name {
  font-size: 1.1rem;
}

.sheet__close {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border: 1px solid var(--surface-border);
  border-radius: 50%;
  background: transparent;
  font-size: 0.9rem;
}

.sheet__description {
  margin-top: var(--space-4);
  font-size: 0.9rem;
  color: var(--text);
}

/* Small heading above a block of details. */
.sheet__label {
  display: block;
  font-size: 0.62rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-faint);
}

.sheet__block {
  margin-top: var(--space-4);
  padding-top: var(--space-3);
  border-top: 1px solid var(--surface-border);
}

/* Distance and direction compact in one line. */
.sheet__quick {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-1) var(--space-2);
  margin-top: var(--space-3);
  font-size: 0.9rem;
}

.sheet__quick-arrow {
  display: inline-block;
  color: var(--accent);
  font-size: 1.05rem;
  line-height: 1;
}

.sheet__quick-value {
  font-weight: 600;
}

.sheet__quick-separator {
  color: var(--text-faint);
}

/* Features as a grid of tags. */
.sheet__features {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(104px, 1fr));
  gap: var(--space-2);
  margin: var(--space-2) 0 0;
  padding: 0;
  list-style: none;
}

.sheet__feature {
  padding: 6px var(--space-3);
  border: 1px solid var(--surface-border);
  border-radius: 999px;
  background: var(--bg-sunken);
  font-size: 0.78rem;
  line-height: 1.3;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sheet__address-value {
  margin-top: var(--space-2);
  font-size: 0.9rem;
  color: var(--text);
}

.sheet__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-5);
}

/* Navigation is an icon only - the arrow points into the direction of travel. */
.sheet__navigate {
  width: 56px;
  min-height: 56px;
  padding: 0;
  border-radius: 50%;
  font-size: 1.4rem;
  line-height: 1;
}
</style>
