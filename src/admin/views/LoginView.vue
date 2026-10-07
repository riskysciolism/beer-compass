<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { setupAdmin, login } from '../api'
import { useAuth } from '../auth'

const router = useRouter()
const { setToken } = useAuth()

const mode = ref<'login' | 'setup'>('login')
const username = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function submit() {
  error.value = ''
  loading.value = true
  try {
    const result = mode.value === 'login'
      ? await login(username.value, password.value)
      : await setupAdmin(username.value, password.value)
    setToken(result.token)
    router.push('/')
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login">
    <form class="login__box admin__card" @submit.prevent="submit">
      <h1 class="login__title">Beer Compass Admin</h1>
      <p class="login__subtitle">{{ mode === 'login' ? 'Anmelden' : 'Ersten Admin erstellen' }}</p>

      <div class="admin__form-row">
        <label class="admin__label">Benutzername</label>
        <input v-model="username" class="admin__input" type="text" required autocomplete="username" />
      </div>

      <div class="admin__form-row">
        <label class="admin__label">Passwort</label>
        <input v-model="password" class="admin__input" type="password" required autocomplete="current-password" />
      </div>

      <button class="admin__button" type="submit" :disabled="loading">
        {{ loading ? '…' : mode === 'login' ? 'Anmelden' : 'Erstellen' }}
      </button>

      <p v-if="error" class="admin__error">{{ error }}</p>

      <button type="button" class="login__toggle" @click="mode = mode === 'login' ? 'setup' : 'login'">
        {{ mode === 'login' ? 'Ersten Admin einrichten' : 'Zum Login' }}
      </button>
    </form>
  </div>
</template>

<style scoped>
.login {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  width: 100vw;
  background: var(--bg);
}

.login__box {
  width: 360px;
}

.login__title {
  margin: 0 0 8px;
  font-size: 1.4rem;
}

.login__subtitle {
  margin: 0 0 20px;
  color: var(--text-muted);
}

.login__toggle {
  margin-top: 16px;
  background: none;
  border: none;
  color: var(--accent);
  cursor: pointer;
  padding: 0;
  font-size: 0.85rem;
}
</style>
