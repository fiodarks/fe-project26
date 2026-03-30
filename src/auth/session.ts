export type Role = 'viewer' | 'creator' | 'admin'

export type Session = {
  accessToken: string | null
}

export type UserProfile = {
  userId: string | null
  name: string | null
  surname: string | null
  email: string | null
}

export type LoginAtInfo = {
  previousLoginAt: string | null
  currentLoginAt: string | null
}

function normalizeJwtExpToMs(exp: unknown): number | null {
  if (typeof exp === 'number' && Number.isFinite(exp)) {
    return exp > 1e12 ? exp : exp * 1000
  }
  if (typeof exp === 'string' && exp.trim()) {
    const n = Number(exp)
    if (!Number.isFinite(n)) return null
    return n > 1e12 ? n : n * 1000
  }
  return null
}

export function isAccessTokenExpired(token: string | null): boolean {
  if (!token) return false
  const payload = decodeJwtPayload(token)
  if (!payload) return true
  const expMs = normalizeJwtExpToMs(payload.exp)
  if (expMs == null) return false
  return Date.now() >= expMs
}

export function loadSession(): Session {
  const token = window.localStorage.getItem('dsa_access_token')
  const accessToken = token && token.trim() ? token.trim() : null

  if (accessToken && isAccessTokenExpired(accessToken)) {
    clearSession()
    return { accessToken: null }
  }

  return { accessToken }
}

export function saveSession(accessToken: string): void {
  const token = accessToken.trim()
  if (!token) {
    clearSession()
    return
  }
  window.localStorage.setItem('dsa_access_token', token)
}

export function clearSession(): void {
  window.localStorage.removeItem('dsa_access_token')
}

function safeBase64UrlDecode(base64Url: string): string | null {
  try {
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const padLen = (4 - (base64.length % 4)) % 4
    return atob(base64 + '='.repeat(padLen))
  } catch {
    return null
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length < 2) return null
  const json = safeBase64UrlDecode(parts[1]!)
  if (!json) return null
  try {
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return null
  }
}

function normalizeRoleValue(v: unknown): string[] {
  if (!v) return []
  if (typeof v === 'string') return [v]
  if (Array.isArray(v)) return v.filter((x) => typeof x === 'string') as string[]
  return []
}

export function decodeRolesFromToken(token: string | null): Set<Role> {
  const roles = new Set<Role>()
  if (!token) return roles

  const payload = decodeJwtPayload(token)
  if (!payload) return roles

  const values = [
    ...normalizeRoleValue(payload.roles),
    ...normalizeRoleValue(payload.authorities),
    ...normalizeRoleValue(payload.scope),
    ...normalizeRoleValue(payload.scopes),
    ...normalizeRoleValue(payload.role),
  ]
    .join(' ')
    .toLowerCase()

  const boundary = '(\\s|:|,|$)'
  if (new RegExp(`(^|\\s)(admin|administrator)${boundary}`).test(values))
    roles.add('admin')
  if (new RegExp(`(^|\\s)(creator|tworca|twórca)${boundary}`).test(values))
    roles.add('creator')
  if (new RegExp(`(^|\\s)(viewer|przegladajacy|przeglądający)${boundary}`).test(values))
    roles.add('viewer')

  return roles
}

export function hasRole(roles: Set<Role>, role: Role): boolean {
  return roles.has(role)
}

function normalizeClaimString(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s ? s : null
}

function pickFirstString(...values: unknown[]): string | null {
  for (const v of values) {
    const s = normalizeClaimString(v)
    if (s) return s
  }
  return null
}

export function decodeUserProfileFromToken(token: string | null): UserProfile {
  if (!token) return { userId: null, name: null, surname: null, email: null }
  const payload = decodeJwtPayload(token)
  if (!payload) return { userId: null, name: null, surname: null, email: null }

  const userId = pickFirstString(payload.sub, payload.userId, payload.user_id)
  const email = pickFirstString(payload.email, payload.preferred_username, payload.upn)
  const givenName = pickFirstString(payload.given_name, payload.givenName, payload.first_name, payload.firstName)
  const familyName = pickFirstString(payload.family_name, payload.familyName, payload.last_name, payload.lastName)

  const fullName = pickFirstString(payload.name)
  if (!givenName && !familyName && fullName) {
    const parts = fullName.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) {
      return {
        userId,
        email,
        name: parts[0] ?? null,
        surname: parts.slice(1).join(' ') || null,
      }
    }
  }

  return {
    userId,
    email,
    name: givenName ?? fullName ?? null,
    surname: familyName,
  }
}

function loginAtStorageKey(userKey: string): string {
  return `dsa_last_login_at:${userKey}`
}

function userKeyFromToken(token: string | null): string | null {
  const p = decodeUserProfileFromToken(token)
  return p.userId ?? p.email ?? null
}

export function bumpLastLoginAt(token: string | null): LoginAtInfo {
  const userKey = userKeyFromToken(token)
  if (!userKey) return { previousLoginAt: null, currentLoginAt: null }

  const key = loginAtStorageKey(userKey)
  const previousLoginAt = window.localStorage.getItem(key)
  const currentLoginAt = new Date().toISOString()
  window.localStorage.setItem(key, currentLoginAt)
  return { previousLoginAt, currentLoginAt }
}
