<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { fetchSchema, createSchemaField, updateSchemaField, deleteSchemaField } from '../api'

const fields = ref<any[]>([])
const loading = ref(true)
const error = ref('')
const newField = ref({ key: '', label: '', type: 'boolean', sort_order: 0 })
const editField = ref<any>(null)

onMounted(load)

async function load() {
  loading.value = true
  try {
    fields.value = await fetchSchema()
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function add() {
  try {
    await createSchemaField(newField.value)
    newField.value = { key: '', label: '', type: 'boolean', sort_order: 0 }
    await load()
  } catch (e: any) {
    error.value = e.message
  }
}

async function saveEdit(field: any) {
  try {
    await updateSchemaField(field.id, { label: field.label, sort_order: field.sort_order })
    editField.value = null
    await load()
  } catch (e: any) {
    error.value = e.message
  }
}

async function remove(id: number) {
  if (!confirm('Feld wirklich löschen?')) return
  try {
    await deleteSchemaField(id)
    await load()
  } catch (e: any) {
    error.value = e.message
  }
}
</script>

<template>
  <div>
    <div class="admin__title">Schema & Features</div>
    <p v-if="loading">Laden …</p>
    <p v-else-if="error" class="admin__error">{{ error }}</p>

    <div class="admin__card">
      <h3>Neues Feld</h3>
      <div class="grid-4">
        <input v-model="newField.key" class="admin__input" placeholder="Key (z. B. toilet)" />
        <input v-model="newField.label" class="admin__input" placeholder="Label (z. B. Toilette vorhanden)" />
        <select v-model="newField.type" class="admin__select">
          <option value="boolean">Boolean</option>
          <option value="text">Text</option>
          <option value="number">Number</option>
          <option value="feature">Feature</option>
        </select>
        <input v-model.number="newField.sort_order" class="admin__input" type="number" placeholder="Reihenfolge" />
      </div>
      <button class="admin__button" type="button" @click="add" style="margin-top: 12px">Hinzufügen</button>
    </div>

    <div class="admin__card">
      <h3>Vorhandene Felder</h3>
      <table class="admin__table">
        <thead>
          <tr>
            <th>Key</th>
            <th>Label</th>
            <th>Typ</th>
            <th>Reihenfolge</th>
            <th>Aktionen</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="field in fields" :key="field.id">
            <td>{{ field.key }}</td>
            <td>
              <input v-if="editField?.id === field.id" v-model="editField.label" class="admin__input" />
              <span v-else>{{ field.label }}</span>
            </td>
            <td>{{ field.type }}</td>
            <td>
              <input v-if="editField?.id === field.id" v-model.number="editField.sort_order" class="admin__input" type="number" />
              <span v-else>{{ field.sort_order }}</span>
            </td>
            <td>
              <button v-if="editField?.id === field.id" class="admin__button" type="button" @click="saveEdit(editField)">Speichern</button>
              <button v-else class="admin__button admin__button--ghost" type="button" @click="editField = { ...field }">Bearbeiten</button>
              <button class="admin__button admin__button--danger" type="button" @click="remove(field.id)">Löschen</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.grid-4 {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 120px;
  gap: 12px;
}

.admin__table button {
  margin-right: 8px;
}
</style>
