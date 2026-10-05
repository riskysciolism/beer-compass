<script setup lang="ts">
/** Install prompt (Android/Chrome) with a hint about manual installation. */
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'

import { translate } from '@/i18n'

const deferredPrompt = ref<BeforeInstallPromptEvent | null>(null)
const dismissed = ref(false)
const installed = ref(false)
const showManual = ref(false)

function onBeforeInstallPrompt(event: Event): void {
  event.preventDefault()
  deferredPrompt.value = event as BeforeInstallPromptEvent
}

function onInstalled(): void {
  installed.value = true
  deferredPrompt.value = null
}

onMounted(() => {
  window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  window.addEventListener('appinstalled', onInstalled)
  installed.value = window.matchMedia('(display-mode: standalone)').matches
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  window.removeEventListener('appinstalled', onInstalled)
})

async function install(): Promise<void> {
  const prompt = deferredPrompt.value
  if (!prompt) {
    showManual.value = true
    return
  }
  await prompt.prompt()
  const choice = await prompt.userChoice
  if (choice.outcome === 'accepted') dismissed.value = true
  deferredPrompt.value = null
}

const visible = computed(
  () => !dismissed.value && (deferredPrompt.value !== null || showManual.value),
)
const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
</script>

<template>
  <div v-if="visible" class="install">
    <div class="install__text">
      <strong>{{ translate('install.banner') }}</strong>
      <p>{{ translate('install.bannerDetail') }}</p>
      <p v-if="showManual && !deferredPrompt" class="install__manual">
        {{ isIos ? translate('install.manualIos') : translate('install.manualAndroid') }}
      </p>
    </div>
    <div class="install__actions">
      <button class="button install__button" type="button" @click="install">
        {{ translate('install.action') }}
      </button>
      <button class="button button--ghost install__button" type="button" @click="dismissed = true">
        {{ translate('install.later') }}
      </button>
    </div>
  </div>

  <p v-else-if="installed" class="install install--done">
    {{ translate('install.installed') }}
  </p>
</template>

<style scoped>
.install {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
  border: 1px dashed color-mix(in srgb, var(--accent) 55%, transparent);
  border-radius: var(--radius-md);
  background: var(--accent-soft);
}

.install__text {
  flex: 1 1 200px;
  min-width: 0;
  font-size: 0.85rem;
}

.install__text p {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-top: 2px;
}

.install__manual {
  color: var(--text) !important;
}

.install__actions {
  display: flex;
  gap: var(--space-2);
  margin-left: auto;
}

.install__button {
  min-height: 40px;
  padding-inline: var(--space-3);
  font-size: 0.82rem;
}

.install--done {
  font-size: 0.75rem;
  color: var(--text-faint);
  border-style: solid;
  border-color: var(--surface-border);
  background: transparent;
}
</style>
