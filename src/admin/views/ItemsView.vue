<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { fetchItems, deleteItem } from '../api'

const router = useRouter()
const items = ref<any[]>([])
const loading = ref(true)
const error = ref('')

onMounted(async () => {
  await load()
})

async function load() {
  loading.value = true
  try {
    items.value = await fetchItems()
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
    <p v-if="loading">Laden …</p>
    <p v-else-if="error" class="admin__error">{{ error }}</p>
    <div v-else class="admin__card">
      <table class="admin__table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Adresse</th>
            <th>Koordinaten</th>
            <th>Aktiv</th>
            <th>Aktionen</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item.id">
            <td>{{ item.name }}</td>
            <td>{{ item.address || '—' }}</td>
            <td>{{ item.latitude }}, {{ item.longitude }}</td>
            <td>{{ item.is_active ? 'Ja' : 'Nein' }}</td>
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
</style>
