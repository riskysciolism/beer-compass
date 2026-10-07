<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchItem, createItem, updateItem, uploadImage, fetchSchema } from '../api'

const route = useRoute()
const router = useRouter()
const isNew = computed(() => route.params.id === undefined || route.params.id === 'new')
const id = computed(() => {
  if (isNew.value) return null
  const parsed = Number(route.params.id)
  return Number.isFinite(parsed) ? parsed : null
})

const item = ref<any>({
  name: '',
  address: '',
  description: '',
  latitude: '',
  longitude: '',
  features: [],
  metadata: {},
  is_active: true,
  image: null,
})
const schema = ref<any[]>([])
const featureInput = ref('')
const imageFile = ref<File | null>(null)
const loading = ref(false)
const error = ref('')

const booleanFields = computed(() => schema.value.filter((f) => f.type === 'boolean'))
const featureFields = computed(() => schema.value.filter((f) => f.type === 'feature'))

onMounted(async () => {
  try {
    schema.value = await fetchSchema()
    if (!isNew.value && id.value) {
      const data = await fetchItem(id.value)
      item.value = { ...data, metadata: data.metadata || {} }
    }
  } catch (e: any) {
    error.value = e.message
  }
})

function addFeature() {
  const key = featureInput.value.trim()
  if (!key || item.value.features.includes(key)) return
  item.value.features.push(key)
  featureInput.value = ''
}

function removeFeature(key: string) {
  item.value.features = item.value.features.filter((f: string) => f !== key)
}

function onImageChange(e: Event) {
  const target = e.target as HTMLInputElement
  if (target.files && target.files[0]) {
    imageFile.value = target.files[0]
  }
}

async function save() {
  error.value = ''
  loading.value = true
  try {
    const payload = {
      name: item.value.name,
      address: item.value.address,
      description: item.value.description,
      latitude: Number(item.value.latitude),
      longitude: Number(item.value.longitude),
      features: item.value.features,
      metadata: item.value.metadata,
      is_active: item.value.is_active,
    }
    const saved = !isNew.value && id.value
      ? await updateItem(id.value, payload)
      : await createItem(payload)
    if (imageFile.value) {
      await uploadImage(saved.id, imageFile.value)
    }
    router.push('/items')
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div>
    <div class="admin__title">{{ isNew ? 'Neuer Biergarten' : 'Biergarten bearbeiten' }}</div>
    <div class="admin__card">
      <div class="admin__form-row">
        <label class="admin__label">Name</label>
        <input v-model="item.name" class="admin__input" type="text" required />
      </div>

      <div class="admin__form-row">
        <label class="admin__label">Adresse</label>
        <input v-model="item.address" class="admin__input" type="text" />
      </div>

      <div class="admin__form-row">
        <label class="admin__label">Beschreibung</label>
        <textarea v-model="item.description" class="admin__textarea" rows="3"></textarea>
      </div>

      <div class="admin__form-row grid-2">
        <div>
          <label class="admin__label">Breitengrad</label>
          <input v-model="item.latitude" class="admin__input" type="number" step="any" required />
        </div>
        <div>
          <label class="admin__label">Längengrad</label>
          <input v-model="item.longitude" class="admin__input" type="number" step="any" required />
        </div>
      </div>

      <div class="admin__form-row">
        <label class="admin__label">Features</label>
        <div class="chips">
          <span v-for="feature in item.features" :key="feature" class="chip">
            {{ feature }}
            <button type="button" @click="removeFeature(feature)">×</button>
          </span>
        </div>
        <div class="feature-add">
          <select v-model="featureInput" class="admin__select">
            <option value="">Feature wählen …</option>
            <option v-for="f in featureFields" :key="f.id" :value="f.key">{{ f.label }}</option>
          </select>
          <button class="admin__button admin__button--ghost" type="button" @click="addFeature">Hinzufügen</button>
        </div>
      </div>

      <div v-for="field in booleanFields" :key="field.id" class="admin__form-row checkbox-row">
        <label>
          <input v-model="item.metadata[field.key]" type="checkbox" />
          {{ field.label }}
        </label>
      </div>

      <div class="admin__form-row checkbox-row">
        <label>
          <input v-model="item.is_active" type="checkbox" />
          Aktiv
        </label>
      </div>

      <div class="admin__form-row">
        <label class="admin__label">Bild</label>
        <input type="file" accept="image/*" @change="onImageChange" />
        <p v-if="item.image" class="hint">Aktuell: {{ item.image }}</p>
      </div>

      <p v-if="error" class="admin__error">{{ error }}</p>

      <button class="admin__button" type="button" :disabled="loading" @click="save">
        {{ loading ? 'Speichern …' : 'Speichern' }}
      </button>
      <button class="admin__button admin__button--ghost" type="button" @click="router.push('/items')">Abbrechen</button>
    </div>
  </div>
</template>

<style scoped>
.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--bg-sunken);
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 0.85rem;
}

.chip button {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
}

.feature-add {
  display: flex;
  gap: 8px;
}

.checkbox-row label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.hint {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin: 4px 0 0;
}
</style>
