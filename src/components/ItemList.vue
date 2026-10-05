<script setup lang="ts">
/** List of all entries with search, sorting and virtual rendering. */
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import VirtualList from '@/components/VirtualList.vue'
import { translate } from '@/i18n'
import type { StoredItem } from '@/types/data'
import type { Settings, SortBy } from '@/types/settings'
import { cardinalDirection, distanceBetween, formatDistance, type LatLon } from '@/utils/geo'
import { normalizeImageSource } from '@/utils/image'

const ROW_HEIGHT = 132

const props = defineProps<{
  items: StoredItem[]
  position: LatLon | null
  settings: Settings
  selectedId: number | null
}>()

const emit = defineEmits<{
  select: [item: StoredItem]
  /** Current scroll position of the list (the shrink logic decides on its own). */
  scrolled: [scrollTop: number]
  sortChange: [sortBy: SortBy]
}>()

function onScroll(scrollTop: number): void {
  emit('scrolled', scrollTop)
}

const search = ref('')

/* --------------------------------------------------------------- Sorting -- */

const sortOpen = ref(false)
const sortButton = ref<HTMLButtonElement | null>(null)
const sortMenu = ref<HTMLDivElement | null>(null)

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'distance', label: translate('list.sortDistance') },
  { value: 'name', label: translate('list.sortName') },
]

function chooseSort(value: SortBy): void {
  sortOpen.value = false
  if (value !== props.settings.sortBy) emit('sortChange', value)
}

function onSortKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    sortOpen.value = false
    sortButton.value?.focus()
  }
}

/** A click outside closes the menu. */
function onDocumentPointerDown(event: PointerEvent): void {
  const target = event.target
  if (!(target instanceof Node)) return
  if (sortMenu.value?.contains(target) || sortButton.value?.contains(target)) return
  sortOpen.value = false
}

watch(sortOpen, (open) => {
  if (!open) return
  document.addEventListener('pointerdown', onDocumentPointerDown, true)
  document.addEventListener('keydown', onSortKeydown)
  sortMenu.value?.querySelector<HTMLButtonElement>('button')?.focus()
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown, true)
  document.removeEventListener('keydown', onSortKeydown)
})

interface Row {
  item: StoredItem
  distance: number | null
  distanceLabel: string
  direction: string
}

const filtered = computed<Row[]>(() => {
  const term = search.value.trim().toLocaleLowerCase('de-DE')
  const current = props.position

  const rows: Row[] = []
  for (const item of props.items) {
    if (
      term.length > 0 &&
      !item.name.toLocaleLowerCase('de-DE').includes(term) &&
      !item.address.toLocaleLowerCase('de-DE').includes(term)
    ) {
      continue
    }
    const result = current ? distanceBetween(current, item.position) : null
    rows.push({
      item,
      distance: result?.meters ?? null,
      distanceLabel: result ? formatDistance(result.meters) : translate('list.unknownDistance'),
      direction: result ? cardinalDirection(result.bearing) : '',
    })
  }

  if (props.settings.sortBy === 'name') {
    rows.sort((a, b) => a.item.name.localeCompare(b.item.name, 'de'))
    return rows
  }
  if (props.position) {
    rows.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity))
  }
  return rows
})

/**
 * `filtered` is index aligned with the VirtualList window by construction -
 * the slot index always lies within the array.
 */
function at(index: number): Row {
  return filtered.value[index]!
}

function hasDistance(index: number): boolean {
  return at(index).distance !== null
}

const countLabel = computed(() =>
  translate('list.resultsCount').replace('{count}', String(filtered.value.length)),
)

const sortLabel = computed(
  () =>
    SORT_OPTIONS.find((option) => option.value === props.settings.sortBy)?.label ??
    translate('list.sortDistance'),
)

const emptyLabel = computed(() =>
  search.value.trim().length > 0 ? translate('list.emptySearch') : translate('list.empty'),
)

const image = normalizeImageSource
</script>

<template>
  <section class="list">
    <div class="list__controls">
      <label class="list__search">
        <span class="visually-hidden">{{ translate('list.search') }}</span>
        <input
          v-model="search"
          type="search"
          :placeholder="translate('list.searchPlaceholder')"
          autocomplete="off"
          enterkeyhint="search"
        />
      </label>
      <div class="list__meta">
        <span class="list__count mono">{{ countLabel }}</span>

        <!-- Sorting: button with a dropdown so both modes are directly selectable. -->
        <div class="list__sort">
          <button
            ref="sortButton"
            class="list__sort-button"
            type="button"
            aria-haspopup="menu"
            :aria-expanded="sortOpen"
            :aria-label="translate('list.sortChange').replace('{sort}', sortLabel)"
            @click="sortOpen = !sortOpen"
          >
            <span class="list__sort-text">{{ translate('list.sortBy') }}: {{ sortLabel }}</span>
            <svg
              class="list__sort-caret"
              viewBox="0 0 12 8"
              width="10"
              height="7"
              aria-hidden="true"
            >
              <path d="M1 1.5 6 6.5l5-5" fill="none" stroke="currentColor" stroke-width="1.6" />
            </svg>
          </button>

          <div v-if="sortOpen" ref="sortMenu" class="list__sort-menu" role="menu">
            <button
              v-for="option in SORT_OPTIONS"
              :key="option.value"
              class="list__sort-option"
              type="button"
              role="menuitemradio"
              :aria-checked="settings.sortBy === option.value"
              @click="chooseSort(option.value)"
            >
              <span>{{ option.label }}</span>
              <svg
                v-if="settings.sortBy === option.value"
                class="list__sort-check"
                viewBox="0 0 12 10"
                width="12"
                height="10"
                aria-hidden="true"
              >
                <path
                  d="M1 5.5 4.5 9 11 1"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="list__viewport">
      <VirtualList
        :count="filtered.length"
        :row-height="ROW_HEIGHT"
        :label="emptyLabel"
        @scroll="onScroll"
      >
        <template #default="{ rows }">
          <div
            v-for="row in rows"
            :key="at(row.index).item.id"
            class="list__row"
            :style="{ height: `${ROW_HEIGHT}px` }"
          >
            <button
              type="button"
              class="entry"
              :class="{ 'entry--selected': at(row.index).item.id === selectedId }"
              @click="emit('select', at(row.index).item)"
            >
              <img
                v-if="at(row.index).item.image"
                class="entry__image"
                :src="image(at(row.index).item.image)"
                alt=""
                loading="lazy"
                decoding="async"
                width="88"
                height="88"
              />
              <span class="entry__body">
                <strong class="entry__name">{{ at(row.index).item.name }}</strong>
                <span class="entry__address">{{ at(row.index).item.address }}</span>
                <span v-if="hasDistance(row.index)" class="entry__distance mono">
                  {{ translate('list.distance') }} {{ at(row.index).distanceLabel }}
                  <span v-if="at(row.index).direction">· {{ at(row.index).direction }}</span>
                </span>
              </span>
            </button>
          </div>
        </template>
      </VirtualList>
    </div>
  </section>
</template>

<style scoped>
.list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  /* Height comes from the flex container (`.layout__list`), not from `height: 100%` -
     sonst würde die Liste die Höhe ihres Inhalts annehmen. */
  min-height: 0;
}

.list__controls {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.list__search input {
  width: 100%;
  min-height: 44px;
  padding: 0 var(--space-3);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
  color: var(--text);
  font: inherit;
}

.list__search input::placeholder {
  color: var(--text-faint);
}

.list__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  font-size: 0.72rem;
  color: var(--text-faint);
}

.list__sort {
  position: relative;
}

.list__sort-button {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  min-height: 32px;
  padding: 0 var(--space-2);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  color: var(--text-muted);
  font-size: 0.72rem;
}

.list__sort-button:active {
  background: var(--bg-sunken);
}

.list__sort-caret {
  flex-shrink: 0;
  transition: transform var(--transition);
}

.list__sort-button[aria-expanded='true'] .list__sort-caret {
  transform: rotate(180deg);
}

.list__sort-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 5;
  display: flex;
  flex-direction: column;
  min-width: 11rem;
  padding: var(--space-1);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
  box-shadow: var(--shadow-lg);
}

.list__sort-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  min-height: 40px;
  padding: 0 var(--space-2);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text);
  font-size: 0.82rem;
  text-align: left;
}

.list__sort-option[aria-checked='true'] {
  color: var(--accent);
  font-weight: 650;
}

.list__sort-check {
  flex-shrink: 0;
}

.list__viewport {
  flex: 1;
  min-height: 0;
  display: flex;
}

.list__row {
  padding-bottom: var(--space-2);
}

.entry {
  display: flex;
  gap: var(--space-3);
  width: 100%;
  height: 100%;
  padding: var(--space-2);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
  text-align: left;
  transition:
    border-color var(--transition),
    transform var(--transition);
}

.entry:active {
  transform: scale(0.995);
}

.entry--selected {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.entry__image {
  width: 88px;
  height: 88px;
  flex-shrink: 0;
  border-radius: var(--radius-sm);
  object-fit: cover;
  background: var(--bg-sunken);
}

.entry__body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  flex: 1;
}

.entry__name {
  font-size: 0.95rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entry__address {
  font-size: 0.75rem;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entry__distance {
  margin-top: auto;
  font-size: 0.72rem;
  color: var(--text-faint);
}
</style>
