<script setup lang="ts">
/**
 * Virtualized list: only the visible rows are rendered (plus a buffer),
 * so that even very large datasets stay smooth.
 *
 * Verwendung:
 * ```vue
 * <VirtualList :count="items.length" :row-height="116" label="Keine Einträge">
 *   <template #default="{ rows, rowHeight }">
 *     <div v-for="row in rows" :key="row.index" :style="{ height: `${rowHeight}px` }">
 *       {{ items[row.index].name }}
 *     </div>
 *   </template>
 * </VirtualList>
 * ```
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

export interface VirtualRow {
  index: number
  offsetTop: number
}

const props = withDefaults(
  defineProps<{
    /** Total number of elements. */
    count: number
    /** Height of a row in pixels. */
    rowHeight?: number
    /** Additionally rendered rows above and below the visible area. */
    overscan?: number
    label: string
  }>(),
  { rowHeight: 116, overscan: 4 },
)

const emit = defineEmits<{ scroll: [scrollTop: number] }>()

const viewport = ref<HTMLElement | null>(null)
const scrollTop = ref(0)
const viewportHeight = ref(480)

let frame = 0
let observer: ResizeObserver | undefined

function measure(): void {
  if (viewport.value) viewportHeight.value = viewport.value.clientHeight
}

function onScroll(): void {
  if (frame) return
  frame = requestAnimationFrame(() => {
    frame = 0
    if (!viewport.value) return
    scrollTop.value = viewport.value.scrollTop
    emit('scroll', scrollTop.value)
  })
}

const totalHeight = computed(() => props.count * props.rowHeight)

const startIndex = computed(() =>
  Math.max(0, Math.floor(scrollTop.value / props.rowHeight) - props.overscan),
)

const endIndex = computed(() =>
  Math.min(
    props.count,
    startIndex.value + Math.ceil(viewportHeight.value / props.rowHeight) + props.overscan * 2,
  ),
)

const rows = computed<VirtualRow[]>(() => {
  const result: VirtualRow[] = []
  for (let index = startIndex.value; index < endIndex.value; index += 1) {
    result.push({ index, offsetTop: index * props.rowHeight })
  }
  return result
})

const offsetTop = computed(() => startIndex.value * props.rowHeight)
const spacerHeight = computed(() =>
  Math.max(0, totalHeight.value - offsetTop.value - rows.value.length * props.rowHeight),
)

function scrollToIndex(index: number): void {
  viewport.value?.scrollTo({ top: index * props.rowHeight, behavior: 'smooth' })
}

defineExpose({ scrollToIndex })

onMounted(() => {
  measure()
  if (viewport.value && typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => measure())
    observer.observe(viewport.value)
  }
  window.addEventListener('resize', measure)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  window.removeEventListener('resize', measure)
  if (frame) cancelAnimationFrame(frame)
})
</script>

<template>
  <div ref="viewport" class="virtual" @scroll.passive="onScroll">
    <div v-if="count === 0" class="virtual__empty">{{ label }}</div>
    <template v-else>
      <div :style="{ height: `${offsetTop}px` }" aria-hidden="true" />
      <slot :rows="rows" :row-height="rowHeight" :scroll-to-index="scrollToIndex" />
      <div :style="{ height: `${spacerHeight}px` }" aria-hidden="true" />
    </template>
  </div>
</template>

<style scoped>
.virtual {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  scrollbar-width: thin;
}

.virtual__empty {
  padding: var(--space-6) var(--space-4);
  text-align: center;
  color: var(--text-muted);
  font-size: 0.85rem;
}
</style>
