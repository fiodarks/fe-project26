import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { blockUser, listUsers, setUserRoles, unblockUser } from '../api/archiveApi'
import type { UserRole, UsersPageResponse } from '../api/types'
import type { Role, Session } from '../auth/session'

export function AdminPage({
  session,
  roles,
  onToast,
  onNeedLogin,
}: {
  session: Session
  roles: Set<Role>
  onToast: (msg: string) => void
  onNeedLogin: () => void
}) {
  const token = session.accessToken
  const isAdmin = roles.has('admin')

  const [usersQuery, setUsersQuery] = useState<{
    q: string
    role: UserRole | ''
    blocked: 'all' | 'true' | 'false'
    size: number
  }>({
    q: '',
    role: '',
    blocked: 'all',
    size: 200,
  })

  const [usersPageIndex, setUsersPageIndex] = useState(0)
  const [usersPage, setUsersPage] = useState<UsersPageResponse | null>(null)
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersError, setUsersError] = useState<string | null>(null)
  const [userEdits, setUserEdits] = useState<
    Record<
      string,
      {
        role: UserRole
        blocked: boolean
        blockedUntil: string
        blockedReason: string
        saving: boolean
        saveError: string | null
      }
    >
  >({})

  const normalizedUsersQuery = useMemo(() => {
    const blocked =
      usersQuery.blocked === 'all' ? undefined : usersQuery.blocked === 'true'
    return {
      q: usersQuery.q.trim() || undefined,
      role: usersQuery.role || undefined,
      blocked,
      size: usersQuery.size,
    } as const
  }, [usersQuery.blocked, usersQuery.q, usersQuery.role, usersQuery.size])

  const usersRequestIdRef = useRef(0)
  const usersTableScrollRef = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    const el = usersTableScrollRef.current
    if (!el) return
    el.scrollLeft = 0
  }, [usersPageIndex, usersPage?.items?.length])

  useEffect(() => {
    if (!token || !isAdmin) return

    const requestId = ++usersRequestIdRef.current
    const timer = window.setTimeout(() => {
      void (async () => {
        setUsersError(null)
        setUsersLoading(true)
        try {
          const res = await listUsers(token, {
            page: usersPageIndex,
            size: normalizedUsersQuery.size,
            q: normalizedUsersQuery.q,
            role: normalizedUsersQuery.role,
            blocked: normalizedUsersQuery.blocked,
          })
          if (usersRequestIdRef.current !== requestId) return
          setUsersPage(res)
        } catch (e: unknown) {
          if (usersRequestIdRef.current !== requestId) return
          const msg = extractErrorMessage(e)
          setUsersError(msg)
          setUsersPage(null)
          onToast(msg)
        } finally {
          const isLatest = usersRequestIdRef.current === requestId
          if (isLatest) setUsersLoading(false)
        }
      })()
    }, 250)

    return () => window.clearTimeout(timer)
  }, [token, isAdmin, normalizedUsersQuery, usersPageIndex, onToast])

  useEffect(() => {
    if (!usersPage?.items?.length) return
    setUserEdits((prev) => {
      const next = { ...prev }
      for (const u of usersPage.items) {
        const existing = next[u.userId]
        if (existing) continue
        next[u.userId] = {
          role: primaryRole(u.roles ?? []),
          blocked: Boolean(u.blockedUntil),
          blockedUntil: u.blockedUntil ?? defaultBlockUntilIso(),
          blockedReason: u.blockedReason ?? '',
          saving: false,
          saveError: null,
        }
      }
      return next
    })
  }, [usersPage?.items])

  if (!token) {
    return (
      <div style={{ padding: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Admin page</div>
        <div style={{ color: 'var(--muted)' }}>Sign in required.</div>
        <div style={{ marginTop: 10, color: 'var(--muted)' }}>
          Sign in using the header controls.
        </div>
        {/* keep callback accessible, but avoid buttons per requirement */}
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault()
            onNeedLogin()
          }}
          style={{ display: 'inline-block', marginTop: 10, color: 'var(--link)' }}
        >
          Sign in
        </a>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div style={{ padding: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Admin page</div>
        <div style={{ color: 'var(--muted)' }}>
          Admin role required. Current roles: {Array.from(roles).join(', ') || 'unknown'}
        </div>
        <div style={{ marginTop: 10, color: 'var(--muted)' }}>
          Sign in using the header controls.
        </div>
      </div>
    )
  }

  return (
    <div style={{ position: 'absolute', inset: 0, padding: 16, overflow: 'auto' }}>
      <div
        style={{
          width: 'min(100%, 980px)',
          marginLeft: 'calc((100% - min(100%, 980px)) / 4)',
          marginRight: 'auto',
          display: 'grid',
          gap: 12,
        }}
      >
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 12,
            background: 'var(--surface-2)',
          }}
        >
          <div style={{ fontWeight: 750, fontSize: 18 }}>Administration</div>
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>
            Users. Filters auto-apply.
          </div>
        </div>

        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 12,
            background: 'var(--surface-2)',
          }}
        >
          <div style={{ fontWeight: 650, marginBottom: 10 }}>Users</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px 160px', gap: 8 }}>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>Search</span>
              <input
                className="input"
                value={usersQuery.q}
                onChange={(e) => {
                  setUsersPageIndex(0)
                  setUsersQuery((p) => ({ ...p, q: e.target.value }))
                }}
                placeholder="email / name / id"
              />
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>Role</span>
              <select
                className="select"
                value={usersQuery.role}
                onChange={(e) => {
                  setUsersPageIndex(0)
                  setUsersQuery((p) => ({ ...p, role: e.target.value as UserRole | '' }))
                }}
              >
                <option value="">Any</option>
                <option value="VIEWER">VIEWER</option>
                <option value="CREATOR">CREATOR</option>
                <option value="ADMIN">ADMIN</option>
              </select>
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>Blocked</span>
              <select
                className="select"
                value={usersQuery.blocked}
                onChange={(e) => {
                  setUsersPageIndex(0)
                  setUsersQuery((p) => ({
                    ...p,
                    blocked: e.target.value as typeof usersQuery.blocked,
                  }))
                }}
              >
                <option value="all">Any</option>
                <option value="true">Blocked</option>
                <option value="false">Not blocked</option>
              </select>
            </label>
          </div>

          <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>
              {usersLoading
                ? 'Loading…'
                : usersPage?.pagination
                  ? `Page ${usersPage.pagination.page + 1} / ${usersPage.pagination.totalPages} (${usersPage.pagination.size} per page)`
                  : '—'}
            </span>
            {usersPage?.pagination ? (
              <span style={{ color: 'var(--muted)', fontSize: 12 }}>
                Total: {usersPage.pagination.totalElements}
              </span>
            ) : null}
            <div
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                opacity: usersPage?.pagination && usersPage.pagination.totalPages <= 1 ? 0.55 : 1,
              }}
            >
              <button
                className="btn"
                style={{ padding: '6px 8px' }}
                disabled={
                  usersLoading ||
                  !usersPage?.pagination ||
                  usersPage.pagination.totalPages <= 1 ||
                  usersPageIndex <= 0
                }
                onClick={() => setUsersPageIndex((p) => Math.max(0, p - 1))}
              >
                Prev
              </button>
              <button
                className="btn"
                style={{ padding: '6px 8px' }}
                disabled={
                  usersLoading ||
                  !usersPage?.pagination ||
                  usersPage.pagination.totalPages <= 1 ||
                  usersPageIndex >= usersPage.pagination.totalPages - 1
                }
                onClick={() =>
                  setUsersPageIndex((p) =>
                    usersPage?.pagination
                      ? Math.min(usersPage.pagination.totalPages - 1, p + 1)
                      : p,
                  )
                }
              >
                Next
              </button>
            </div>
          </div>

          {usersError ? <div style={{ marginTop: 10, color: 'var(--danger)' }}>{usersError}</div> : null}

          {usersPage?.items?.length ? (
            <>
              <div
                ref={usersTableScrollRef}
                style={{ marginTop: 12, overflow: 'auto', maxHeight: '60vh' }}
              >
                <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: 260 }} />
                    <col style={{ width: 220 }} />
                    <col style={{ width: 140 }} />
                    <col style={{ width: 130 }} />
                    <col style={{ width: 240 }} />
                    <col style={{ width: 150 }} />
                    <col style={{ width: 90 }} />
                    <col style={{ width: 120 }} />
                  </colgroup>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 12 }}>
                    <th style={{ padding: '6px 8px' }}>Mail</th>
                    <th style={{ padding: '6px 8px' }}>Name</th>
                    <th style={{ padding: '6px 8px' }}>Id</th>
                    <th style={{ padding: '6px 8px' }}>Role</th>
                    <th style={{ padding: '6px 8px' }}>Blocked</th>
                    <th style={{ padding: '6px 8px' }}>Last login</th>
                    <th style={{ padding: '6px 8px' }}>Materials</th>
                    <th style={{ padding: '6px 8px' }} />
                  </tr>
                </thead>
                <tbody>
                  {usersPage.items.map((u) => {
                    const edit = userEdits[u.userId]
                    const role = edit?.role ?? primaryRole(u.roles ?? [])
                    const blocked = edit?.blocked ?? Boolean(u.blockedUntil)
                    const saving = edit?.saving ?? false
                    const saveError = edit?.saveError ?? null

                    const initialRole = primaryRole(u.roles ?? [])
                    const initialBlocked = Boolean(u.blockedUntil)
                    const initialBlockedUntil = u.blockedUntil ?? defaultBlockUntilIso()
                    const initialBlockedReason = u.blockedReason ?? ''

                    const roleChanged = role !== initialRole
                    const blockedChanged = blocked !== initialBlocked
                    const blockedUntil = edit?.blockedUntil ?? initialBlockedUntil
                    const blockedReason = edit?.blockedReason ?? initialBlockedReason
                    const blockedDetailsChanged =
                      blocked &&
                      initialBlocked &&
                      (blockedUntil !== initialBlockedUntil || blockedReason !== initialBlockedReason)

                    const hasChanges = roleChanged || blockedChanged || blockedDetailsChanged
                    return (
                      <tr key={u.userId} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px' }}>
                          <div
                            title={u.email ?? ''}
                            style={{
                              fontWeight: 650,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {u.email || '—'}
                          </div>
                        </td>
                        <td style={{ padding: '8px' }}>
                          <div
                            title={[u.name, u.surname].filter(Boolean).join(' ')}
                            style={{
                              fontWeight: 650,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {[u.name, u.surname].filter(Boolean).join(' ') || '—'}
                          </div>
                        </td>
                        <td style={{ padding: '8px' }}>
                          <div
                            title={u.userId}
                            style={{
                              fontSize: 12,
                              color: 'var(--muted)',
                              fontFamily:
                                'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {u.userId}
                          </div>
                        </td>
                        <td style={{ padding: '8px' }}>
                          <select
                            className="select"
                            value={role}
                            disabled={saving}
                            onChange={(e) => {
                              const nextRole = e.target.value as UserRole
                              setUserEdits((prev) => ({
                                ...prev,
                                [u.userId]: {
                                  role: nextRole,
                                  blocked,
                                  blockedUntil,
                                  blockedReason,
                                  saving: false,
                                  saveError: null,
                                },
                              }))
                            }}
                            style={{ width: 120 }}
                          >
                            <option value="VIEWER">VIEWER</option>
                            <option value="CREATOR">CREATOR</option>
                            <option value="ADMIN">ADMIN</option>
                          </select>
                        </td>
                        <td style={{ padding: '8px' }}>
                          <div style={{ display: 'grid', gap: 8 }}>
                            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <input
                                type="checkbox"
                                checked={blocked}
                                disabled={saving}
                                onChange={(e) => {
                                  const nextBlocked = e.target.checked
                                  setUserEdits((prev) => ({
                                    ...prev,
                                    [u.userId]: {
                                      role,
                                      blocked: nextBlocked,
                                      blockedUntil: blockedUntil || defaultBlockUntilIso(),
                                      blockedReason,
                                      saving: false,
                                      saveError: null,
                                    },
                                  }))
                                }}
                              />
                              <span style={{ fontSize: 13 }}>
                                {blocked ? 'blocked' : '—'}
                              </span>
                            </label>

                            {blocked ? (
                              <div style={{ display: 'grid', gap: 6 }}>
                                <label style={{ display: 'grid', gap: 4 }}>
                                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                                    Until (ISO)
                                  </span>
                                  <input
                                    className="input"
                                    value={blockedUntil}
                                    disabled={saving}
                                    onChange={(e) => {
                                      setUserEdits((prev) => ({
                                        ...prev,
                                        [u.userId]: {
                                          role,
                                          blocked,
                                          blockedUntil: e.target.value,
                                          blockedReason,
                                          saving: false,
                                          saveError: null,
                                        },
                                      }))
                                    }}
                                    placeholder="2026-01-01T00:00:00Z"
                                    style={{ width: '100%', maxWidth: 220 }}
                                  />
                                </label>
                                <label style={{ display: 'grid', gap: 4 }}>
                                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                                    Reason
                                  </span>
                                  <input
                                    className="input"
                                    value={blockedReason}
                                    disabled={saving}
                                    onChange={(e) => {
                                      setUserEdits((prev) => ({
                                        ...prev,
                                        [u.userId]: {
                                          role,
                                          blocked,
                                          blockedUntil,
                                          blockedReason: e.target.value,
                                          saving: false,
                                          saveError: null,
                                        },
                                      }))
                                    }}
                                    placeholder="Reason…"
                                    style={{ width: '100%', maxWidth: 220 }}
                                  />
                                </label>
                              </div>
                            ) : null}
                          </div>
                        </td>
                        <td style={{ padding: '8px', color: 'var(--muted)' }}>
                          {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : '—'}
                        </td>
                        <td style={{ padding: '8px', color: 'var(--muted)' }}>
                          {typeof u.materialsCount === 'number' ? u.materialsCount : '—'}
                        </td>
                        <td style={{ padding: '8px' }}>
                          <div style={{ display: 'grid', gap: 6, justifyItems: 'start' }}>
                            <button
                              className="btn btnPrimary"
                              disabled={!hasChanges || saving}
                              onClick={() => {
                                void (async () => {
                                  setUserEdits((prev) => ({
                                    ...prev,
                                    [u.userId]: {
                                      role,
                                      blocked,
                                      blockedUntil,
                                      blockedReason,
                                      saving: true,
                                      saveError: null,
                                    },
                                  }))

                                  try {
                                    if (roleChanged) {
                                      await setUserRoles(token, u.userId, { roles: [role] })
                                    }

                                    if (blockedChanged) {
                                      if (blocked) {
                                        const untilIso = normalizeIsoOrFallback(
                                          blockedUntil,
                                          defaultBlockUntilIso(),
                                        )
                                        const reason = (blockedReason || 'Blocked by admin').trim()
                                        await blockUser(token, u.userId, {
                                          blockedUntil: untilIso,
                                          reason,
                                        })
                                      } else {
                                        await unblockUser(token, u.userId)
                                      }
                                    } else if (blocked && initialBlocked && blockedDetailsChanged) {
                                      const untilIso = normalizeIsoOrFallback(
                                        blockedUntil,
                                        initialBlockedUntil,
                                      )
                                      const reason = (blockedReason || 'Blocked by admin').trim()
                                      await blockUser(token, u.userId, {
                                        blockedUntil: untilIso,
                                        reason,
                                      })
                                    }

                                    onToast('Saved')

                                    const res = await listUsers(token, {
                                      page: usersPageIndex,
                                      size: normalizedUsersQuery.size,
                                      q: normalizedUsersQuery.q,
                                      role: normalizedUsersQuery.role,
                                      blocked: normalizedUsersQuery.blocked,
                                    })
                                    setUsersPage(res)

                                    const fresh = res.items.find((x) => x.userId === u.userId) ?? null
                                    if (fresh) {
                                      setUserEdits((prev) => ({
                                        ...prev,
                                        [u.userId]: {
                                          role: primaryRole(fresh.roles ?? []),
                                          blocked: Boolean(fresh.blockedUntil),
                                          blockedUntil: fresh.blockedUntil ?? defaultBlockUntilIso(),
                                          blockedReason: fresh.blockedReason ?? '',
                                          saving: false,
                                          saveError: null,
                                        },
                                      }))
                                    }
                                  } catch (e: unknown) {
                                    const msg = extractErrorMessage(e)
                                    onToast(msg)
                                    setUserEdits((prev) => ({
                                      ...prev,
                                      [u.userId]: {
                                        role,
                                        blocked,
                                        blockedUntil,
                                        blockedReason,
                                        saving: false,
                                        saveError: msg,
                                      },
                                    }))
                                    return
                                  }

                                  setUserEdits((prev) => {
                                    const current = prev[u.userId]
                                    if (!current) return prev
                                    if (!current.saving) return prev
                                    return {
                                      ...prev,
                                      [u.userId]: { ...current, saving: false, saveError: null },
                                    }
                                  })
                                })()
                              }}
                            >
                              {saving ? 'Saving…' : 'Save'}
                            </button>

                            {saveError ? (
                              <div style={{ color: 'var(--danger)', fontSize: 12 }}>
                                {saveError}
                              </div>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              </div>
              <div
                style={{
                  marginTop: 10,
                  display: 'flex',
                  gap: 12,
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    opacity: usersPage?.pagination && usersPage.pagination.totalPages <= 1 ? 0.55 : 1,
                  }}
                >
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>Page size</span>
                  <select
                    className="select"
                    value={usersQuery.size}
                    disabled={
                      usersLoading ||
                      (usersPage?.pagination ? usersPage.pagination.totalPages <= 1 : false)
                    }
                    onChange={(e) => {
                      setUsersPageIndex(0)
                      setUsersQuery((p) => ({ ...p, size: Number(e.target.value) || 50 }))
                    }}
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                  </select>
                </div>
              </div>
            </>
          ) : (
            <div style={{ marginTop: 12, color: 'var(--muted)' }}>
              {usersLoading ? 'Loading…' : 'No users found.'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
  } catch {
    return iso
  }
}

function primaryRole(roles: UserRole[]): UserRole {
  if (roles.includes('ADMIN')) return 'ADMIN'
  if (roles.includes('CREATOR')) return 'CREATOR'
  return 'VIEWER'
}

function defaultBlockUntilIso(): string {
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
}

function normalizeIsoOrFallback(input: string, fallbackIso: string): string {
  const raw = input.trim()
  if (!raw) return fallbackIso
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? fallbackIso : d.toISOString()
}

function extractErrorMessage(e: unknown): string {
  if (!e) return 'Unknown error'
  if (typeof e === 'string') return e
  if (typeof e === 'object' && e !== null && 'message' in e) {
    const msg = (e as { message?: unknown }).message
    if (typeof msg === 'string') return msg
  }
  if (typeof e === 'object' && e !== null && 'body' in e) {
    const body = (e as { body?: unknown }).body
    if (body && typeof body === 'object') {
      const msg = (body as { message?: unknown }).message
      if (typeof msg === 'string') return msg
    }
    return JSON.stringify(body)
  }
  return 'Request failed'
}
