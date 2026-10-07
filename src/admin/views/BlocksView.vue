<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { fetchBlocks, blockDevice, unblockDevice } from '../api'

const blocks = ref<any[]>([])
const deviceId = ref('')
const reason = ref('')
const expiresAt = ref('')
const loading = ref(true)
const error = ref('')

onMounted(load)

async function load() {
  loading.value = true
  try {
    blocks.value = await fetchBlocks()
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function add() {
  try {
    await blockDevice({
      device_id: deviceId.value,
      reason: reason.value,
      expires_at: expiresAt.value || null,
    })
    deviceId.value = ''
    reason.value = ''
    expiresAt.value = ''
    await load()
  } catch (e: any) {
    error.value = e.message
  }
}

async function remove(id: number) {
  if (!confirm('Block aufheben?')) return
  try {
    await unblockDevice(id)
    await load()
  } catch (e: any) {
    error.value = e.message
  }
}
</script>

<template>
  <div>
    <div class="admin__title">Geräte blockieren</div>

    <div class="admin__card">
      <h3>Neuer Block</h3>
      <div class="grid-3">
        <input v-model="deviceId" class="admin__input" placeholder="Device ID" />
        <input v-model="reason" class="admin__input" placeholder="Grund" />
        <input v-model="expiresAt" class="admin__input" type="datetime-local" />
      </div>
      <button class="admin__button" type="button" @click="add" style="margin-top: 12px">Blockieren</button>
      <p v-if="error" class="admin__error">{{ error }}</p>
    </div>

    <div class="admin__card">
      <h3>Aktive Blocks</h3>
      <table class="admin__table">
        <thead>
          <tr>
            <th>Device ID</th>
            <th>Grund</th>
            <th>Läuft ab</th>
            <th>Aktionen</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="b in blocks" :key="b.id">
            <td>{{ b.device_id }}</td>
            <td>{{ b.reason || '—' }}</td>
            <td>{{ b.expires_at ? new Date(b.expires_at).toLocaleString('de-DE') : 'Nie' }}</td>
            <td>
              <button class="admin__button admin__button--ghost" type="button" @click="remove(b.id)">Aufheben</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.grid-3 {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 12px;
}
</style>
