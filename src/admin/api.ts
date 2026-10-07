const BASE = '/admin/api'

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { token } = await import('./auth')
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(token.value ? { authorization: `Bearer ${token.value}` } : {}),
    ...((options.headers as Record<string, string>) ?? {}),
  }
  const res = await fetch(`${BASE}${path}`, { ...options, headers })
  if (res.status === 401) {
    const { useAuth } = await import('./auth')
    useAuth().logout()
    window.location.href = '/admin/login'
    throw new Error('Session expired')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export async function setupAdmin(username: string, password: string): Promise<{ token: string }> {
  return request('/auth/setup', { method: 'POST', body: JSON.stringify({ username, password }) })
}

export async function login(username: string, password: string): Promise<{ token: string }> {
  return request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) })
}

export async function fetchMe(): Promise<{ id: number; username: string }> {
  return request('/me')
}

export async function fetchDashboard(): Promise<any> {
  return request('/dashboard')
}

export async function fetchItems(): Promise<any[]> {
  return request('/items')
}

export async function fetchItem(id: number): Promise<any> {
  return request(`/items/${id}`)
}

export async function createItem(payload: Record<string, unknown>): Promise<any> {
  return request('/items', { method: 'POST', body: JSON.stringify(payload) })
}

export async function updateItem(id: number, payload: Record<string, unknown>): Promise<any> {
  return request(`/items/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
}

export async function deleteItem(id: number): Promise<void> {
  return request(`/items/${id}`, { method: 'DELETE' })
}

export async function uploadImage(id: number, file: File): Promise<{ image: string }> {
  const { token } = await import('./auth')
  const formData = new FormData()
  formData.append('image', file)
  const res = await fetch(`${BASE}/items/${id}/image`, {
    method: 'POST',
    headers: token.value ? { authorization: `Bearer ${token.value}` } : {},
    body: formData,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function fetchSchema(): Promise<any[]> {
  return request('/schema')
}

export async function createSchemaField(payload: Record<string, unknown>): Promise<any> {
  return request('/schema', { method: 'POST', body: JSON.stringify(payload) })
}

export async function updateSchemaField(id: number, payload: Record<string, unknown>): Promise<any> {
  return request(`/schema/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
}

export async function deleteSchemaField(id: number): Promise<void> {
  return request(`/schema/${id}`, { method: 'DELETE' })
}

export async function fetchSuggestions(): Promise<any[]> {
  return request('/suggestions')
}

export async function approveSuggestion(id: number, note?: string): Promise<any> {
  return request(`/suggestions/${id}/approve`, { method: 'POST', body: JSON.stringify({ note }) })
}

export async function rejectSuggestion(id: number, note?: string): Promise<any> {
  return request(`/suggestions/${id}/reject`, { method: 'POST', body: JSON.stringify({ note }) })
}

export async function fetchBlocks(): Promise<any[]> {
  return request('/blocks')
}

export async function blockDevice(payload: Record<string, unknown>): Promise<any> {
  return request('/blocks', { method: 'POST', body: JSON.stringify(payload) })
}

export async function unblockDevice(id: number): Promise<void> {
  return request(`/blocks/${id}`, { method: 'DELETE' })
}

export async function fetchAudit(params?: { limit?: number; offset?: number }): Promise<any[]> {
  const qs = params
    ? `?${new URLSearchParams(Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])))}`
    : ''
  return request(`/audit${qs}`)
}

export async function fetchHeatmap(): Promise<any> {
  return request('/stats/heatmap')
}

export async function publishData(): Promise<{ version: number; count: number }> {
  return request('/publish', { method: 'POST' })
}
