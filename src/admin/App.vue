<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from './auth'

const router = useRouter()
const route = useRoute()
const { logout, token } = useAuth()

const nav = [
  { path: '/', label: 'Dashboard' },
  { path: '/items', label: 'Biergärten' },
  { path: '/schema', label: 'Schema' },
  { path: '/suggestions', label: 'Vorschläge' },
  { path: '/blocks', label: 'Blocks' },
  { path: '/audit', label: 'Audit' },
  { path: '/heatmap', label: 'Heatmap' },
]

const isLogin = computed(() => route.path === '/login')

function onLogout() {
  logout()
  void router.push('/login')
}
</script>

<template>
  <div class="admin" :data-theme="'dark'">
    <aside v-if="!isLogin" class="admin__sidebar">
      <div class="admin__brand">Beer Compass Admin</div>
      <nav class="admin__nav">
        <router-link
          v-for="item in nav"
          :key="item.path"
          :to="item.path"
          class="admin__nav-link"
          :class="{ 'admin__nav-link--active': route.path === item.path }"
        >
          {{ item.label }}
        </router-link>
      </nav>
      <div class="admin__footer">
        <span v-if="token" class="admin__user">Angemeldet</span>
        <button class="admin__logout" type="button" @click="onLogout">Abmelden</button>
      </div>
    </aside>
    <main class="admin__main">
      <router-view />
    </main>
  </div>
</template>

<style>
.admin {
  display: flex;
  min-height: 100vh;
  background: var(--bg);
  color: var(--text);
}

.admin__sidebar {
  width: 240px;
  flex-shrink: 0;
  background: var(--bg-elevated);
  border-right: 1px solid var(--surface-border);
  display: flex;
  flex-direction: column;
}

.admin__brand {
  padding: 20px;
  font-weight: 700;
  font-size: 1.1rem;
  border-bottom: 1px solid var(--surface-border);
}

.admin__nav {
  flex: 1;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.admin__nav-link {
  padding: 10px 12px;
  border-radius: 8px;
  color: var(--text-muted);
  text-decoration: none;
  font-weight: 500;
}

.admin__nav-link:hover,
.admin__nav-link--active {
  background: var(--bg-sunken);
  color: var(--text);
}

.admin__footer {
  padding: 16px;
  border-top: 1px solid var(--surface-border);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.admin__user {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.admin__logout {
  background: transparent;
  border: 1px solid var(--surface-border);
  color: var(--text);
  padding: 8px;
  border-radius: 6px;
  cursor: pointer;
}

.admin__main {
  flex: 1;
  min-width: 0;
  padding: 24px;
  overflow-y: auto;
}

.admin__title {
  font-size: 1.5rem;
  margin-bottom: 20px;
}
</style>
