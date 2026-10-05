<script setup lang="ts">
/**
 * Fixed bar at the bottom for the selected entry. It replaces the
 * former tab bar: the selection steers the compass needle, the bar displays
 * it and opens the details.
 */
import { computed } from 'vue'

import { translate } from '@/i18n'
import { formatDistance } from '@/utils/geo'
import { normalizeImageSource } from '@/utils/image'
import type { StoredItem } from '@/types/data'

const image = normalizeImageSource

const props = defineProps<{
  item: StoredItem
  /** Distance to the target, `null` without a GPS position. */
  meters: number | null
}>()

const emit = defineEmits<{ details: []; clear: [] }>()

// The direction now lives in the needle - in the banner and here the distance is enough.
const meta = computed(() =>
  props.meters === null
    ? null
    : translate('list.distance').concat(' ', formatDistance(props.meters)),
)
</script>

<template>
  <div class="selection-bar">
    <span class="selection-bar__label">{{ translate('selection.hint') }}</span>

    <div class="selection-bar__body">
      <img
        v-if="item.image"
        class="selection-bar__image"
        :src="image(item.image)"
        alt=""
        loading="lazy"
        decoding="async"
      />
      <span class="selection-bar__text">
        <strong>{{ item.name }}</strong>
        <small v-if="meta" class="mono">{{ meta }}</small>
      </span>
    </div>

    <div class="selection-bar__actions">
      <button class="button button--small" type="button" @click="emit('details')">
        {{ translate('selection.details') }}
      </button>
      <button
        class="selection-bar__clear"
        type="button"
        :aria-label="translate('selection.clear')"
        @click="emit('clear')"
      >
        ✕
      </button>
    </div>
  </div>
</template>

<style scoped>
.selection-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 30;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-4) calc(var(--safe-bottom) + var(--space-2));
  border-top: 1px solid var(--surface-border);
  background: color-mix(in srgb, var(--bg) 94%, transparent);
  backdrop-filter: blur(12px);
}

.selection-bar__label {
  font-size: 0.6rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-faint);
}

.selection-bar__body {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}

.selection-bar__image {
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border-radius: var(--radius-sm);
  object-fit: cover;
  background: var(--bg-sunken);
}

.selection-bar__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.selection-bar__text strong {
  font-size: 0.88rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.selection-bar__text small {
  font-size: 0.72rem;
  color: var(--text-muted);
}

.selection-bar__actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
}

.selection-bar__clear {
  width: 34px;
  height: 34px;
  border: 1px solid var(--surface-border);
  border-radius: 50%;
  background: transparent;
  color: var(--text-muted);
  font-size: 0.8rem;
}
</style>
