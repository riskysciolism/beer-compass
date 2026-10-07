import { ref } from 'vue'

const TOKEN_KEY = 'bc_admin_token'
const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null
export const token = ref<string | null>(stored)

export function useAuth() {
  function setToken(value: string | null) {
    token.value = value
    if (value && typeof localStorage !== 'undefined') {
      localStorage.setItem(TOKEN_KEY, value)
    } else if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(TOKEN_KEY)
    }
  }

  function logout() {
    setToken(null)
  }

  return { token, setToken, logout }
}
