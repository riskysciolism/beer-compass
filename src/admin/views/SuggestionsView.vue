<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { fetchSuggestions, approveSuggestion, rejectSuggestion } from '../api'

const suggestions = ref<any[]>([])
const loading = ref(true)
const error = ref('')
const note = ref('')

onMounted(load)

async function load() {
  loading.value = true
  try {
    suggestions.value = await fetchSuggestions()
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function approve(id: number) {
  try {
    await approveSuggestion(id, note.value)
    note.value = ''
    await load()
  } catch (e: any) {
    error.value = e.message
  }
}

async function reject(id: number) {
  try {
    await rejectSuggestion(id, note.value)
    note.value = ''
    await load()
  } catch (e: any) {
    error.value = e.message
  }
}

function statusBadge(status: string) {
  return status === 'pending' ? 'pending' : status === 'approved' ? 'approved' : 'rejected'
}
</script>

<template>
  <div>
    <div class="admin__title">Vorschläge</div>
    <p v-if="loading">Laden …</p>
    <p v-else-if="error" class="admin__error">{{ error }}</p>
    <div v-else>
      <div v-for="s in suggestions" :key="s.id" class="admin__card suggestion">
        <div class="suggestion__header">
          <span :class="`admin__badge admin__badge--${statusBadge(s.status)}`">{{ s.status }}</span>
          <span class="suggestion__type">{{ s.type === 'new' ? 'Neuer Eintrag' : 'Bearbeitung' }}</span>
          <span class="suggestion__device">Device: {{ s.device_id }}</span>
        </div>

        <div v-if="s.item_name" class="suggestion__target">Betrifft: {{ s.item_name }}</div>

        <pre class="suggestion__payload">{{ JSON.stringify(s.payload, null, 2) }}</pre>

        <div v-if="s.status === 'pending'" class="suggestion__actions">
          <textarea v-model="note" class="admin__textarea" rows="2" placeholder="Interne Notiz (optional)"></textarea>
          <div class="buttons">
            <button class="admin__button" type="button" @click="approve(s.id)">Übernehmen</button>
            <button class="admin__button admin__button--danger" type="button" @click="reject(s.id)">Ablehnen</button>
          </div>
        </div>

        <div v-if="s.admin_note" class="suggestion__note">
          <strong>Notiz:</strong> {{ s.admin_note }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.suggestion__header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.suggestion__type {
  font-weight: 600;
}

.suggestion__device {
  margin-left: auto;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.suggestion__target {
  color: var(--text-muted);
  margin-bottom: 12px;
}

.suggestion__payload {
  background: var(--bg-sunken);
  padding: 12px;
  border-radius: 8px;
  overflow-x: auto;
  font-size: 0.85rem;
}

.suggestion__actions {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.buttons {
  display: flex;
  gap: 8px;
}

.suggestion__note {
  margin-top: 12px;
  font-size: 0.9rem;
  color: var(--text-muted);
}
</style>
