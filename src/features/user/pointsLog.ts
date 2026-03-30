export type PointsLogEntry = {
  id: string
  at: string
  delta: number
  reason: string
}

export const POINTS_LOG_UPDATED_EVENT = 'dsa_points_log_updated'

function storageKey(userKey: string): string {
  return `dsa_points_log:${userKey}`
}

function safeParseJson(raw: string | null): unknown {
  if (!raw) return null
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

function normalizePointsLogEntry(x: unknown): PointsLogEntry | null {
  if (!x || typeof x !== 'object') return null
  const o = x as Record<string, unknown>
  if (typeof o.id !== 'string' || !o.id.trim()) return null
  if (typeof o.at !== 'string' || !o.at.trim()) return null
  if (typeof o.delta !== 'number' || !Number.isFinite(o.delta)) return null
  if (typeof o.reason !== 'string' || !o.reason.trim()) return null
  return {
    id: o.id,
    at: o.at,
    delta: o.delta,
    reason: o.reason,
  }
}

export function loadPointsLog(userKey: string): PointsLogEntry[] {
  const raw = window.localStorage.getItem(storageKey(userKey))
  const data = safeParseJson(raw)
  if (!Array.isArray(data)) return []

  const out: PointsLogEntry[] = []
  for (const item of data) {
    const normalized = normalizePointsLogEntry(item)
    if (normalized) out.push(normalized)
  }

  out.sort((a, b) => b.at.localeCompare(a.at))
  return out
}

export function appendPointsLog(userKey: string, entry: Omit<PointsLogEntry, 'id'>): void {
  const id =
    (typeof window.crypto?.randomUUID === 'function' && window.crypto.randomUUID()) ||
    `${Date.now()}_${Math.random().toString(16).slice(2)}`

  const next: PointsLogEntry = { id, ...entry }
  const prev = loadPointsLog(userKey)
  const merged = [next, ...prev].slice(0, 250)
  window.localStorage.setItem(storageKey(userKey), JSON.stringify(merged))
  window.dispatchEvent(new CustomEvent(POINTS_LOG_UPDATED_EVENT, { detail: { userKey } }))
}

export function clearPointsLog(userKey: string): void {
  window.localStorage.removeItem(storageKey(userKey))
  window.dispatchEvent(new CustomEvent(POINTS_LOG_UPDATED_EVENT, { detail: { userKey } }))
}
