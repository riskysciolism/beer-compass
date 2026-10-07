<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { fetchItems, deleteItem, fetchPublishStatus } from '../api'

const router = useRouter()
const items = ref<any[]>([])
const publishStatus = ref<any>(null)
const loading = ref(true)
const error = ref('')

const hasUnpublished = computed(
  () => (publishStatus.value?.dirtyItems ?? 0) > 0 || (publishStatus.value?.deletedCount ?? 0) > 0,
)

onMounted(async () => {
  await load()
})

async function load() {
  loading.value = true
  try {
    ;[items.value, publishStatus.value] = await Promise.all([fetchItems(), fetchPublishStatus()])
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function remove(id: number) {
  if (!confirm('Eintrag wirklich löschen?')) return
  try {
    await deleteItem(id)
    await load()
  } catch (e: any) {
    error.value = e.message
  }
}
</script>

<template>
  <div>
    <div class="admin__title">
      Biergärten
      <button class="admin__button" type="button" @click="router.push('/items/new')">Neu</button>
    </div>

    <div v-if="hasUnpublished" class="publish-banner">
      Änderungen noch nicht veröffentlicht:
      {{ publishStatus.dirtyItems }} geändert/neu,
      {{ publishStatus.deletedCount }} gelöscht.
      <router-link to="/">Jetzt veröffentlichen</router-link>
    </div>

    <p v-if="loading">Laden …</p>
    <p v-else-if="error" class="admin__error">{{ error }}</p>
    <div v-else class="admin__card">
      <table class="admin__table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Adresse</th>
            <th>Koordinaten</th>
            <th>Status</th>
            <th>Aktionen</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item.id">
            <td>
              {{ item.name }}
              <span v-if="item.dirty" class="dirty-dot" title="Unveröffentlicht">●</span>
            </td>
            <td>{{ item.address || '—' }}</td>
            <td>{{ item.latitude }}, {{ item.longitude }}</td>
            <td>
              <span v-if="!item.is_active" class="admin__badge admin__badge--rejected">Inaktiv</span>
              <span v-else-if="item.dirty" class="admin__badge admin__badge--pending">Unveröffentlicht</span>
              <span v-else class="admin__badge admin__badge--approved">Veröffentlicht</span>
            </td>
            <td>
              <button class="admin__button admin__button--ghost" type="button" @click="router.push(`/items/${item.id}/edit`)">Bearbeiten</button>
              <button class="admin__button admin__button--danger" type="button" @click="remove(item.id)">Löschen</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.admin__title {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.admin__table button {
  margin-right: 8px;
}

.publish-banner {
  background: rgba(212, 160, 23, 0.15);
  border: 1px solid var(--warn);
  color: var(--warn);
  padding: 12px 16px;
  border-radius: 8px;
  margin-bottom: 16px;
  font-size: 0.9rem;
}

.publish-banner a {
  color: var(--accent-strong);
  font-weight: 600;
}

.dirty-dot {
  color: var(--warn);
  margin-left: 4px;
  font-size: 0.7rem;
  vertical-align: middle;
}
</style>
