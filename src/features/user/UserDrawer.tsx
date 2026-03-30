import { useEffect, useMemo, useState } from 'react'
import type { Role, Session, UserProfile } from '../../auth/session'
import { decodeUserProfileFromToken } from '../../auth/session'
import {
  clearPointsLog,
  loadPointsLog,
  POINTS_LOG_UPDATED_EVENT,
} from './pointsLog'

type UserLevel = 'ADMIN' | 'CREATOR' | 'VIEWER'

function levelFromRoles(roles: Set<Role>): UserLevel {
  if (roles.has('admin')) return 'ADMIN'
  if (roles.has('creator')) return 'CREATOR'
  return 'VIEWER'
}

function userKeyFromProfile(p: UserProfile): string | null {
  return p.userId ?? p.email ?? null
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString()
}

export function UserDrawer({
  session,
  roles,
  onNeedLogin,
}: {
  session: Session
  roles: Set<Role>
  onNeedLogin: () => void
}) {
  const profile = useMemo(
    () => decodeUserProfileFromToken(session.accessToken),
    [session.accessToken],
  )
  const level = useMemo(() => levelFromRoles(roles), [roles])
  const userKey = useMemo(() => userKeyFromProfile(profile), [profile])

  const [logVersion, setLogVersion] = useState(0)

  const pointsLog = useMemo(() => {
    if (!userKey) return []
    if (logVersion < 0) return []
    return loadPointsLog(userKey)
  }, [logVersion, userKey])

  useEffect(() => {
    const onUpdated = (ev: Event) => {
      if (!userKey) return
      const detail = (ev as CustomEvent<unknown>).detail
      if (!detail || typeof detail !== 'object') return
      const k = (detail as { userKey?: unknown }).userKey
      if (k !== userKey) return
      setLogVersion((v) => v + 1)
    }
    window.addEventListener(POINTS_LOG_UPDATED_EVENT, onUpdated)
    return () => window.removeEventListener(POINTS_LOG_UPDATED_EVENT, onUpdated)
  }, [userKey])

  const totalPoints = useMemo(
    () => pointsLog.reduce((sum, e) => sum + e.delta, 0),
    [pointsLog],
  )

  if (!session.accessToken) {
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>Not signed in</div>
        <div style={{ color: 'var(--muted)' }}>
          Sign in to view your profile and points log.
        </div>
        <button className="btn btnPrimary" onClick={onNeedLogin}>
          Sign in
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 12,
          background: 'var(--surface)',
          display: 'grid',
          gap: 8,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 16 }}>Profile</div>

        <div style={{ display: 'grid', gap: 6 }}>
          <Row label="Name" value={profile.name ?? '—'} />
          <Row label="Surname" value={profile.surname ?? '—'} />
          <Row label="Email" value={profile.email ?? '—'} />
          <Row label="Level" value={level} />
        </div>
      </div>

      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 12,
          background: 'var(--surface)',
          display: 'grid',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Points log</div>
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>
            Total: {totalPoints}
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <button
              className="btn"
              onClick={() => {
                if (!userKey) return
                clearPointsLog(userKey)
              }}
              disabled={!userKey || pointsLog.length === 0}
              title={!userKey ? 'Missing user id/email in token' : undefined}
            >
              Clear
            </button>
          </div>
        </div>

        {!userKey ? (
          <div style={{ color: 'var(--muted)' }}>
            Cannot load points log (missing user id/email in token).
          </div>
        ) : pointsLog.length === 0 ? (
          <div style={{ color: 'var(--muted)' }}>No points added yet.</div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {pointsLog.map((e) => (
              <div
                key={e.id}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: 10,
                  background: 'var(--surface-2)',
                  display: 'grid',
                  gap: 4,
                }}
              >
                <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                  <div style={{ fontWeight: 750 }}>
                    {e.delta > 0 ? `+${e.delta}` : String(e.delta)}
                  </div>
                  <div style={{ color: 'var(--muted)', fontSize: 13 }}>
                    {e.reason}
                  </div>
                </div>
                <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                  {fmtDateTime(e.at)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '110px 1fr',
        gap: 10,
        alignItems: 'baseline',
      }}
    >
      <div style={{ color: 'var(--muted)', fontSize: 13 }}>{label}</div>
      <div style={{ fontWeight: 650, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {value}
      </div>
    </div>
  )
}
