<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { fetchAudit } from '../api'

const logs = ref<any[]>([])
const loading = ref(true)
const error = ref('')

onMounted(async () => {
  try {
    logs.value = await fetchAudit({ limit: 100 })
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div>
    <div class="admin__title">Audit-Log</div>
    <p v-if="loading">Laden …</p>
    <p v-else-if="error" class="admin__error">{{ error }}</p>
    <div v-else class="admin__card">
      <table class="admin__table">
        <thead>
          <tr>
            <th>Zeit</th>
            <th>Admin</th>
            <th>Aktion</th>
            <th>Typ</th>
            <th>ID</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="log in logs" :key="log.id">
            <td>{{ new Date(log.created_at).toLocaleString('de-DE') }}</td>
            <td>{{ log.admin_username || '—' }}</td>
            <td>{{ log.action }}</td>
            <td>{{ log.entity_type || '—' }}</td>
            <td>{{ log.entity_id || '—' }}</td>
            <td><pre class="details">{{ JSON.stringify(log.details, null, 2) }}</pre></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.details {
  margin: 0;
  font-size: 0.75rem;
  color: var(--text-muted);
  max-width: 300px;
  overflow-x: auto;
}
</style>
