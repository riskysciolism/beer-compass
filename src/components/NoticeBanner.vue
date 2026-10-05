<script setup lang="ts">
/** General notice bar for updates, errors and install prompts. */
withDefaults(
  defineProps<{
    tone?: 'info' | 'success' | 'warning' | 'danger'
    title: string
    description?: string
    primaryLabel?: string
    secondaryLabel?: string
    dismissLabel?: string
    /** Value for aria-live: only success messages are announced. */
    live?: 'polite' | 'assertive' | 'off'
    busy?: boolean
  }>(),
  { tone: 'info', live: 'polite' },
)

const emit = defineEmits<{ primary: []; secondary: []; dismiss: [] }>()
</script>

<template>
  <aside class="banner" :class="`banner--${tone}`" :aria-live="live" role="status">
    <div class="banner__text">
      <strong class="banner__title">{{ title }}</strong>
      <p v-if="description" class="banner__description">{{ description }}</p>
      <slot />
    </div>

    <div class="banner__actions">
      <button
        v-if="primaryLabel"
        class="button banner__button"
        type="button"
        :disabled="busy"
        @click="emit('primary')"
      >
        {{ primaryLabel }}
      </button>
      <button
        v-if="secondaryLabel"
        class="button button--ghost banner__button"
        type="button"
        :disabled="busy"
        @click="emit('secondary')"
      >
        {{ secondaryLabel }}
      </button>
      <button
        v-if="dismissLabel"
        class="banner__dismiss"
        type="button"
        :aria-label="dismissLabel"
        @click="emit('dismiss')"
      >
        ✕
      </button>
    </div>
  </aside>
</template>

<style scoped>
.banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
  box-shadow: var(--shadow-md);
}

.banner--info {
  border-color: color-mix(in srgb, var(--info) 45%, transparent);
  background: color-mix(in srgb, var(--info) 10%, var(--bg-elevated));
}

.banner--success {
  border-color: color-mix(in srgb, var(--ok) 45%, transparent);
  background: color-mix(in srgb, var(--ok) 10%, var(--bg-elevated));
}

.banner--warning {
  border-color: color-mix(in srgb, var(--warn) 50%, transparent);
  background: color-mix(in srgb, var(--warn) 12%, var(--bg-elevated));
}

.banner--danger {
  border-color: color-mix(in srgb, var(--danger) 50%, transparent);
  background: color-mix(in srgb, var(--danger) 10%, var(--bg-elevated));
}

.banner__text {
  flex: 1 1 200px;
  min-width: 0;
}

.banner__title {
  font-size: 0.9rem;
}

.banner__description {
  margin-top: 2px;
  font-size: 0.78rem;
  color: var(--text-muted);
}

.banner__actions {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  margin-left: auto;
}

.banner__button {
  min-height: 40px;
  padding-inline: var(--space-3);
  font-size: 0.82rem;
}

.banner__dismiss {
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--text-muted);
  font-size: 0.85rem;
}
</style>
