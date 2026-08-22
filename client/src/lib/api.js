// In dev this stays relative and Vite proxies it. In production it must point
// at the API host, because the site and the API live on different domains.
export const API_BASE = import.meta.env.VITE_API_URL || '/api'
const BASE = API_BASE

export function getToken() {
  return localStorage.getItem('im_token')
}

export function setToken(token) {
  if (token) localStorage.setItem('im_token', token)
  else localStorage.removeItem('im_token')
}

export async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (auth && token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data
}
