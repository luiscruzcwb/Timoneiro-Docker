const BASE = '/api/v1'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) {
      window.dispatchEvent(new Event('auth:unauthorized'))
    }
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || res.statusText)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

// --- Types ---
export interface Container {
  id: string
  environmentId: number
  name: string
  image: string
  status: 'up_to_date' | 'update_available' | 'updating' | 'failed' | 'unknown' | 'local'
  currentDigest: string
  latestDigest: string
  tags: string // JSON array, e.g. '["production","critical"]'
  lastChecked: string
  lastUpdated: string
}

export interface Environment {
  id: number
  name: string
  host: string
  type: 'socket' | 'tcp' | 'agent'
  token?: string
  tlsCert?: string
  tlsKey?: string
  tlsCA?: string
  createdAt: string
}

export interface UpdateHistory {
  id: number
  containerId: string
  containerName: string
  environmentId: number
  oldImage: string
  newImage: string
  status: 'success' | 'failed' | 'rolled_back'
  error?: string
  duration: number
  createdAt: string
}

export interface NotificationChannel {
  id: number
  name: string
  type: 'slack' | 'telegram' | 'email' | 'smtp' | 'webhook' | 'discord' | 'gotify' | string
  config: string
  enabled: boolean
  createdAt: string
}

// --- Containers ---
export const getContainers = () => request<Container[]>('/containers')
export const triggerCheck = () => request<{ status: string }>('/containers/check', { method: 'POST' })
export const triggerUpdate = (id: string) => request(`/containers/${id}/update`, { method: 'POST' })
export const rollback = (id: string) => request(`/containers/${id}/rollback`, { method: 'POST' })
export const updateContainerTags = (id: string, tags: string[]) =>
  request<{ status: string }>(`/containers/${id}/tags`, { method: 'PATCH', body: JSON.stringify({ tags }) })

// --- Environments ---
export const getEnvironments = () => request<Environment[]>('/environments')
export const testEnvironmentConnection = (params: { host: string; type?: string; token?: string }) =>
  request<{ ok: boolean; host?: string; apiVersion?: string; error?: string }>(
    '/environments/test',
    { method: 'POST', body: JSON.stringify(params) },
  )
export const addEnvironment = (env: Partial<Environment>) =>
  request<Environment>('/environments', { method: 'POST', body: JSON.stringify(env) })
export const updateEnvironment = (id: number, env: Partial<Environment>) =>
  request<Environment>(`/environments/${id}`, { method: 'PUT', body: JSON.stringify(env) })
export const deleteEnvironment = (id: number) =>
  request<void>(`/environments/${id}`, { method: 'DELETE' })
export const getEnvironmentContainers = (id: number) =>
  request<Container[]>(`/environments/${id}/containers`)

// --- History ---
export interface HistoryParams {
  limit?: number
  offset?: number
  environment?: number
  container?: string
}
export const getHistory = (params: HistoryParams = {}) => {
  const q = new URLSearchParams()
  if (params.limit) q.set('limit', String(params.limit))
  if (params.offset) q.set('offset', String(params.offset))
  if (params.environment) q.set('environment', String(params.environment))
  if (params.container) q.set('container', params.container)
  return request<UpdateHistory[]>(`/history?${q}`)
}

// --- Pending Updates ---
export interface PendingUpdate {
  id: number
  containerId: string
  containerName: string
  environmentId: number
  currentImage: string
  latestImage: string
  currentDigest: string
  latestDigest: string
  status: 'pending' | 'approved' | 'ignored' | 'deploying' | 'deployed' | 'failed'
  cveCritical: number
  cveHigh: number
  cveMedium: number
  cveLow: number
  cveData: string
  notes: string
  foundAt: string
  updatedAt: string
}

export const getUpdates = (status?: string, environmentId?: number) => {
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  if (environmentId) params.set('environmentId', String(environmentId))
  return request<PendingUpdate[]>(`/updates?${params}`)
}
export const approveUpdate = (id: number) =>
  request(`/updates/${id}/approve`, { method: 'POST' })
export const ignoreUpdate = (id: number) =>
  request(`/updates/${id}/ignore`, { method: 'POST' })
export const updateUpdateNotes = (id: number, notes: string) =>
  request(`/updates/${id}/notes`, { method: 'PATCH', body: JSON.stringify({ notes }) })

// --- Registries ---
export interface Registry {
  id: number
  name: string
  host: string
  type: 'dockerhub' | 'ghcr' | 'generic'
  username: string
  password: string
  createdAt: string
}

export const getRegistries = () => request<Registry[]>('/registries')
export const createRegistry = (r: Partial<Registry>) =>
  request<Registry>('/registries', { method: 'POST', body: JSON.stringify(r) })
export const updateRegistry = (id: number, r: Partial<Registry>) =>
  request<Registry>(`/registries/${id}`, { method: 'PUT', body: JSON.stringify(r) })
export const deleteRegistry = (id: number) =>
  request<void>(`/registries/${id}`, { method: 'DELETE' })
export const testRegistry = (params: { host?: string; type: string; username: string; password: string }) =>
  request<{ ok: boolean; message: string }>('/registries/test', { method: 'POST', body: JSON.stringify(params) })

// --- Policy Settings ---
export interface VersionPolicy {
  major: boolean
  minor: boolean
  patch: boolean
}

export interface ContainerException {
  id: string
  containerId: string
  containerName: string
  environmentId: number
  environmentName: string
  mode: 'automatic' | 'manual' | 'scheduled' | 'skip'
}

export interface StackException {
  id: string
  stackName: string
  mode: 'automatic' | 'manual' | 'scheduled' | 'skip'
}

export interface MaintenanceWindow {
  id: string
  name: string
  days: number[]
  startTime: string
  endTime: string
  enabled: boolean
  scope: 'all' | 'environment' | 'containers'
  environmentIds: number[]
  containerIds: string[]
}

export interface PolicySettings {
  updateMode: 'automatic' | 'manual' | 'scheduled'
  versionPolicy: VersionPolicy
  containerExceptions: ContainerException[]
  stackExceptions: StackException[]
  maintenanceWindows: MaintenanceWindow[]
}

export const getSettings = () => request<PolicySettings>('/settings')
export const updateSettings = (p: PolicySettings) =>
  request<PolicySettings>('/settings', { method: 'PUT', body: JSON.stringify(p) })

// --- Auth ---
export interface AuthUser {
  username: string
}

export const getAuthStatus = () => request<{ needsSetup: boolean }>('/auth/status')
export const setupAdmin = (username: string, password: string) =>
  request<AuthUser>('/auth/setup', { method: 'POST', body: JSON.stringify({ username, password }) })
export const login = (username: string, password: string) =>
  request<AuthUser>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) })
export const logout = () => request<{ status: string }>('/auth/logout', { method: 'POST' })
export const getMe = () => request<AuthUser>('/auth/me')
export const changePassword = (currentPassword: string, newPassword: string) =>
  request<{ status: string }>('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  })

// --- Notifications ---
export const getNotificationChannels = () => request<NotificationChannel[]>('/notifications/channels')
export const addChannel = (ch: Partial<NotificationChannel>) =>
  request<NotificationChannel>('/notifications/channels', { method: 'POST', body: JSON.stringify(ch) })
export const updateChannel = (id: number, ch: Partial<NotificationChannel>) =>
  request<NotificationChannel>(`/notifications/channels/${id}`, { method: 'PUT', body: JSON.stringify(ch) })
export const deleteChannel = (id: number) =>
  request<void>(`/notifications/channels/${id}`, { method: 'DELETE' })
export const testChannel = (id: number) =>
  request(`/notifications/channels/${id}/test`, { method: 'POST' })
