<script setup lang="ts">
/** Detail view of an entry as a bottom sheet. */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import { translate } from '@/i18n'
import type { StoredItem } from '@/types/data'
import {
  cardinalDirection,
  distanceBetween,
  formatCoordinate,
  formatDistance,
  type LatLon,
} from '@/utils/geo'
import { normalizeImageSource } from '@/utils/image'

const props = defineProps<{
  item: StoredItem
  position: LatLon | null
}>()

const emit = defineEmits<{ close: [] }>()

const copied = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

const image = computed(() => normalizeImageSource(props.item.image))

const distance = computed(() => {
  if (!props.position) return null
  const result = distanceBetween(props.position, props.item.position)
  return {
    label: formatDistance(result.meters),
    direction: cardinalDirection(result.bearing),
    meters: result.meters,
  }
})

const latitude = computed(() => formatCoordinate(props.item.position.latitude, 'N', 'S'))
const longitude = computed(() => formatCoordinate(props.item.position.longitude, 'E', 'W'))

/**
 * The `geo:` intent opens the map app configured on the device.
 * The app itself does not load anything from the network.
 */
const mapUrl = computed(() => {
  const { latitude: lat, longitude: lon } = props.item.position
  return `geo:${lat},${lon}?q=${lat},${lon}(${encodeURIComponent(props.item.name)})`
})

async function copyAddress(): Promise<void> {
  try {
    await navigator.clipboard.writeText(`${props.item.name}, ${props.item.address}`)
    copied.value = true
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => (copied.value = false), 2000)
  } catch {
    copied.value = false
  }
}

function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close')
}

onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey)
  if (timer) clearTimeout(timer)
})
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
          <p class="sheet__address">{{ item.address }}</p>
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

      <dl v-if="distance" class="sheet__stats">
        <div>
          <dt>{{ translate('list.distance') }}</dt>
          <dd class="mono">{{ distance.label }}</dd>
        </div>
        <div>
          <dt>{{ translate('list.direction') }}</dt>
          <dd class="mono">{{ distance.direction }}</dd>
        </div>
      </dl>

      <dl class="sheet__stats">
        <div>
          <dt>{{ translate('geo.latitude') }}</dt>
          <dd class="mono">{{ latitude.decimal }}</dd>
        </div>
        <div>
          <dt>{{ translate('geo.longitude') }}</dt>
          <dd class="mono">{{ longitude.decimal }}</dd>
        </div>
      </dl>
      <p class="sheet__dms mono">{{ latitude.dms }} · {{ longitude.dms }}</p>

      <div class="sheet__actions">
        <a class="button" :href="mapUrl">📍 {{ translate('list.openInMaps') }}</a>
        <button class="button button--quiet" type="button" @click="copyAddress">
          {{ copied ? translate('geo.copied') : translate('list.address') }}
        </button>
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

.sheet__address {
  font-size: 0.82rem;
  color: var(--text-muted);
  margin-top: 2px;
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

.sheet__stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: var(--space-3);
  margin: var(--space-4) 0 0;
  padding-top: var(--space-3);
  border-top: 1px solid var(--surface-border);
}

.sheet__stats dt {
  font-size: 0.62rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-faint);
}

.sheet__stats dd {
  margin: 2px 0 0;
  font-size: 0.85rem;
  font-weight: 600;
}

.sheet__dms {
  margin-top: var(--space-2);
  font-size: 0.72rem;
  color: var(--text-muted);
}

.sheet__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-5);
}

.sheet__actions .button {
  flex: 1 1 150px;
}
</style>
