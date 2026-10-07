import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'

import App from './App.vue'
import DashboardView from './views/DashboardView.vue'
import ItemsView from './views/ItemsView.vue'
import ItemFormView from './views/ItemFormView.vue'
import SchemaView from './views/SchemaView.vue'
import SuggestionsView from './views/SuggestionsView.vue'
import BlocksView from './views/BlocksView.vue'
import AuditView from './views/AuditView.vue'
import HeatmapView from './views/HeatmapView.vue'
import LoginView from './views/LoginView.vue'
import { useAuth } from './auth'

import './styles.css'

const router = createRouter({
  history: createWebHistory('/admin'),
  routes: [
    { path: '/login', component: LoginView, meta: { public: true } },
    { path: '/', component: DashboardView },
    { path: '/items', component: ItemsView },
    { path: '/items/new', component: ItemFormView },
    { path: '/items/:id/edit', component: ItemFormView },
    { path: '/schema', component: SchemaView },
    { path: '/suggestions', component: SuggestionsView },
    { path: '/blocks', component: BlocksView },
    { path: '/audit', component: AuditView },
    { path: '/heatmap', component: HeatmapView },
  ],
})

import type { RouteLocationNormalized, NavigationGuardNext } from 'vue-router'

router.beforeEach((to: RouteLocationNormalized, _from: RouteLocationNormalized, next: NavigationGuardNext) => {
  const { token } = useAuth()
  if (!to.meta.public && !token.value) {
    next('/login')
    return
  }
  if (to.path === '/login' && token.value) {
    next('/')
    return
  }
  next()
})

createApp(App).use(router).mount('#app')
