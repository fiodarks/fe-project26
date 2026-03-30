import { apiBaseUrl } from './config'

export class ApiError extends Error {
  status: number
  body: unknown

  constructor(message: string, status: number, body: unknown) {
    super(message)
    this.status = status
    this.body = body
  }
}

function withAuthHeaders(token: string | null): HeadersInit {
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

export function makeUrl(path: string, query?: Record<string, string | undefined | string[]>) {
  // Supports both absolute base URLs (e.g. http://localhost:8080/api/v1)
  // and relative ones (e.g. /api/v1 via Vite proxy in dev).
  const base = new URL(apiBaseUrl().replace(/\/+$/, '') + '/', window.location.origin)
  const url = new URL(path.replace(/^\/+/, ''), base)
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined) continue
      if (Array.isArray(v)) {
        for (const item of v) {
          if (!item) continue
          url.searchParams.append(k, item)
        }
        continue
      }
      if (v === '') continue
      url.searchParams.set(k, v)
    }
  }
  return url.toString()
}

export async function fetchJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(input, init)
  const text = await res.text()
  const body = text ? (safeJsonParse(text) ?? text) : null
  if (!res.ok) throw new ApiError(res.statusText || 'API error', res.status, body)
  return body as T
}

export async function fetchNoContent(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<void> {
  const res = await fetch(input, init)
  if (res.status === 204) return
  const text = await res.text()
  const body = text ? (safeJsonParse(text) ?? text) : null
  if (!res.ok) throw new ApiError(res.statusText || 'API error', res.status, body)
}

function safeJsonParse(text: string): unknown | null {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

export const authHeaders = withAuthHeaders
