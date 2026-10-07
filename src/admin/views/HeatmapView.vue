<script setup lang="ts">
import { ref, onMounted } from 'vue'
import L from 'leaflet'
import { fetchHeatmap } from '../api'

const mapContainer = ref<HTMLDivElement | null>(null)
const loading = ref(true)
const error = ref('')

onMounted(async () => {
  try {
    const data = await fetchHeatmap()
    loading.value = false
    if (!mapContainer.value) return
    const map = L.map(mapContainer.value).setView([52.2, 4.9], 8)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
    }).addTo(map)

    data.geoHeat.forEach((point: any) => {
      const count = Number(point.count)
      const radius = Math.max(6, Math.min(30, count * 3))
      L.circleMarker([Number(point.latitude), Number(point.longitude)], {
        radius,
        color: '#d4a017',
        fillColor: '#d4a017',
        fillOpacity: 0.5,
        weight: 1,
      }).addTo(map).bindPopup(`${count} Events`)
    })

    data.itemHeat.forEach((item: any) => {
      if (item.latitude == null || item.longitude == null) return
      L.marker([Number(item.latitude), Number(item.longitude)])
        .addTo(map)
        .bindPopup(`<strong>${item.name}</strong><br>${item.count} Auswahlen`)
    })
  } catch (e: any) {
    error.value = e.message
    loading.value = false
  }
})
</script>

<template>
  <div>
    <div class="admin__title">Heatmap</div>
    <p v-if="loading">Laden …</p>
    <p v-else-if="error" class="admin__error">{{ error }}</p>
    <div v-else ref="mapContainer" class="heatmap"></div>
  </div>
</template>

<style scoped>
.heatmap {
  height: 70vh;
  border-radius: 12px;
  border: 1px solid var(--surface-border);
}
</style>
