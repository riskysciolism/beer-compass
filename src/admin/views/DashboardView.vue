<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { fetchDashboard, publishData } from '../api'
import Chart from 'chart.js/auto'

const dashboard = ref<any>(null)
const loading = ref(true)
const error = ref('')
const publishMessage = ref('')
const chartCanvas = ref<HTMLCanvasElement | null>(null)

const stats = computed(() => [
  { label: 'Aktive Biergärten', value: dashboard.value?.items ?? 0 },
  { label: 'Offene Vorschläge', value: dashboard.value?.suggestions?.pending ?? 0 },
  { label: 'Aktive Blocks', value: dashboard.value?.blocks ?? 0 },
  { label: 'Events 24h', value: dashboard.value?.events24h ?? 0 },
  { label: 'Unique Devices 30d', value: dashboard.value?.uniqueDevices30d ?? 0 },
])

onMounted(async () => {
  try {
    dashboard.value = await fetchDashboard()
    renderChart()
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
})

function renderChart() {
  if (!chartCanvas.value || !dashboard.value?.daily) return
  const labels = dashboard.value.daily.map((d: any) => d.day)
  const data = dashboard.value.daily.map((d: any) => Number(d.count))
  new Chart(chartCanvas.value, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Events pro Tag',
          data,
          backgroundColor: 'rgba(212, 160, 23, 0.6)',
          borderColor: '#d4a017',
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#a89b87' }, grid: { color: '#2a1d0f' } },
        y: { ticks: { color: '#a89b87' }, grid: { color: '#2a1d0f' } },
      },
    },
  })
}

async function publish() {
  publishMessage.value = ''
  try {
    const result = await publishData()
    publishMessage.value = `Veröffentlicht: Version ${result.version} (${result.count} Einträge)`
  } catch (e: any) {
    publishMessage.value = e.message
  }
}
</script>

<template>
  <div>
    <div class="admin__title">Dashboard</div>
    <p v-if="loading">Laden …</p>
    <p v-else-if="error" class="admin__error">{{ error }}</p>
    <template v-else>
      <div class="stats">
        <div v-for="stat in stats" :key="stat.label" class="stats__card admin__card">
          <div class="stats__value">{{ stat.value }}</div>
          <div class="stats__label">{{ stat.label }}</div>
        </div>
      </div>

      <div class="admin__card">
        <div class="section__header">
          <h2>Events der letzten 30 Tage</h2>
          <button class="admin__button" type="button" @click="publish">Jetzt veröffentlichen</button>
        </div>
        <p v-if="publishMessage" class="publish-message">{{ publishMessage }}</p>
        <canvas ref="chartCanvas" height="80"></canvas>
      </div>

      <div class="admin__card">
        <h2>Beliebteste Biergärten (30 Tage)</h2>
        <table class="admin__table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Interaktionen</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in dashboard.topItems" :key="item.id">
              <td>{{ item.name ?? '—' }}</td>
              <td>{{ item.event_count }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<style scoped>
.stats {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
  margin-bottom: 20px;
}

.stats__value {
  font-size: 2rem;
  font-weight: 700;
  color: var(--accent);
}

.stats__label {
  font-size: 0.85rem;
  color: var(--text-muted);
  margin-top: 4px;
}

.section__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.section__header h2 {
  margin: 0;
  font-size: 1.1rem;
}

.publish-message {
  margin: 0 0 12px;
  color: var(--ok);
}
</style>
