<script setup lang="ts">
/**
 * Header: title and settings button. Status and data state displays are
 * deliberately moved into the settings - the main screen stays glanceable
 * lesbar.
 */
import { translate } from '@/i18n'

const emit = defineEmits<{ openSettings: [] }>()
</script>

<template>
  <header class="topbar">
    <div class="topbar__identity">
      <span class="topbar__mark" aria-hidden="true">🍺</span>
      <div class="topbar__text">
        <h1 class="topbar__title">{{ translate('app.name') }}</h1>
        <p class="topbar__subtitle">{{ translate('app.tagline') }}</p>
      </div>
    </div>

    <button
      class="topbar__settings"
      type="button"
      :aria-label="translate('header.openSettings')"
      @click="emit('openSettings')"
    >
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12 8.5A3.5 3.5 0 1 0 12 15.5 3.5 3.5 0 0 0 12 8.5Zm0 5.2a1.7 1.7 0 1 1 0-3.4 1.7 1.7 0 0 1 0 3.4Z"
        />
        <path
          fill="currentColor"
          d="m20.3 13.6.1-1.6-.1-1.6 1.5-1.2a.5.5 0 0 0 .1-.6l-1.6-2.8a.5.5 0 0 0-.6-.2l-1.8.7a7.6 7.6 0 0 0-2.7-1.6l-.3-1.9a.5.5 0 0 0-.5-.4h-3.2a.5.5 0 0 0-.5.4l-.3 1.9a7.6 7.6 0 0 0-2.7 1.6l-1.8-.7a.5.5 0 0 0-.6.2L2.9 8.6a.5.5 0 0 0 .1.6l1.5 1.2-.1 1.6.1 1.6-1.5 1.2a.5.5 0 0 0-.1.6l1.6 2.8a.5.5 0 0 0 .6.2l1.8-.7c.8.6 1.7 1.2 2.7 1.6l.3 1.9a.5.5 0 0 0 .5.4h3.2a.5.5 0 0 0 .5-.4l.3-1.9c1-.4 1.9-1 2.7-1.6l1.8.7a.5.5 0 0 0 .6-.2l1.6-2.8a.5.5 0 0 0-.1-.6l-1.5-1.2Z"
        />
      </svg>
    </button>
  </header>
</template>

<style scoped>
.topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: calc(var(--safe-top) + var(--space-3)) var(--space-4) var(--space-3);
  background: color-mix(in srgb, var(--bg) 88%, transparent);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--surface-border);
}

.topbar__identity {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}

.topbar__mark {
  font-size: 26px;
  line-height: 1;
  flex-shrink: 0;
  filter: drop-shadow(0 2px 4px rgb(0 0 0 / 25%));
}

.topbar__text {
  min-width: 0;
}

.topbar__title {
  font-size: 1.05rem;
  letter-spacing: 0.01em;
}

.topbar__subtitle {
  font-size: 0.75rem;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.topbar__settings {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  flex-shrink: 0;
  border: 1px solid var(--surface-border);
  border-radius: 50%;
  background: var(--bg-elevated);
  color: var(--text);
  transition:
    border-color var(--transition),
    color var(--transition);
}

.topbar__settings:active {
  color: var(--accent);
  border-color: var(--accent);
}

@media (min-width: 640px) {
  .topbar {
    padding-inline: var(--space-5);
  }

  .topbar__title {
    font-size: 1.2rem;
  }
}
</style>
