import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react'
import { getMaterialPoints } from '../../api/archiveApi'
import type { MaterialDTO, MaterialPointPhotoDTO } from '../../api/types'
import type { Role, Session } from '../../auth/session'
import { decodeUserProfileFromToken } from '../../auth/session'
import { extractLatLon, type LatLon } from '../map/coords'
import {
  makePointBbox,
} from '../map/pointMaterials'

type PhotoGroup = {
  year: number | null
  label: string
  items: MaterialPointPhotoDTO[]
}

function groupPhotosByYear(photos: MaterialPointPhotoDTO[]): PhotoGroup[] {
  const byYear = new Map<number | null, MaterialPointPhotoDTO[]>()
  for (const p of photos) {
    const list = byYear.get(p.year ?? null) ?? []
    list.push(p)
    byYear.set(p.year ?? null, list)
  }

  const keys = Array.from(byYear.keys()).sort((a, b) => {
    if (a === null && b === null) return 0
    if (a === null) return 1
    if (b === null) return -1
    return b - a
  })

  return keys.map((y) => {
    const items = (byYear.get(y) ?? []).slice()
    items.sort((a, b) => (a.title || a.id).localeCompare(b.title || b.id))
    return { year: y, label: y === null ? 'Unknown year' : String(y), items }
  })
}

export function MaterialDetailsDrawer({
  material,
  session,
  roles,
  hidePointPhotos = false,
  onAddPhotoAtPoint,
  onSelectMaterialId,
  onEdit,
  onDelete,
  onBlockUser,
}: {
  material: MaterialDTO
  session: Session
  roles: Set<Role>
  hidePointPhotos?: boolean
  onAddPhotoAtPoint?: (p: LatLon) => void
  onSelectMaterialId?: (id: string) => void
  onEdit: () => void
  onDelete: () => void
  onBlockUser: (reason: string, blockedUntilIso: string) => void
}) {
  const canAdmin = roles.has('admin')
  const canCreator = roles.has('creator')

  const profile = useMemo(
    () => decodeUserProfileFromToken(session.accessToken),
    [session.accessToken],
  )
  const ownerKey = profile.userId ?? profile.email
  const isOwner = Boolean(ownerKey) && material.ownerId === ownerKey

  const [blockReason, setBlockReason] = useState('Defective content')
  const [blockUntil, setBlockUntil] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 30)
    return d.toISOString().slice(0, 10)
  })

  const isSignedIn = Boolean(session.accessToken)
  const canEdit = isSignedIn && (canAdmin || (canCreator && isOwner))
  const canDelete = isSignedIn && (canAdmin || (canCreator && isOwner))
  const canUploadAtPoint = isSignedIn && (canAdmin || canCreator)

  const imageUrl = useMemo(
    () => material.fileUrl ?? material.thumbnailUrl ?? null,
    [material.fileUrl, material.thumbnailUrl],
  )

  const materialPoint = useMemo(() => extractLatLon(material), [material])
  const pointKey = useMemo(() => {
    if (!materialPoint) return null
    return `${materialPoint.lat.toFixed(6)},${materialPoint.lon.toFixed(6)}`
  }, [materialPoint])

  const [pointPhotos, setPointPhotos] = useState<MaterialPointPhotoDTO[] | null>(null)
  const [pointPhotosLoading, setPointPhotosLoading] = useState(false)
  const [pointPhotosError, setPointPhotosError] = useState<string | null>(null)
  const pointPhotosSeqRef = useRef(0)

  useEffect(() => {
    if (hidePointPhotos) {
      setPointPhotos(null)
      setPointPhotosError(null)
      setPointPhotosLoading(false)
      return
    }
    if (!materialPoint) {
      setPointPhotos(null)
      setPointPhotosError(null)
      setPointPhotosLoading(false)
      return
    }

    const seq = ++pointPhotosSeqRef.current
    setPointPhotosError(null)
    setPointPhotosLoading(true)

    void (async () => {
      try {
        const bbox = makePointBbox(materialPoint, 12)
        const res = await getMaterialPoints(bbox)
        if (seq !== pointPhotosSeqRef.current) return
        const key = `${materialPoint.lat.toFixed(6)},${materialPoint.lon.toFixed(6)}`
        const match =
          res.points.find((p) => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}` === key) ?? null
        setPointPhotos(match?.photos ?? [])
      } catch (e: unknown) {
        if (seq !== pointPhotosSeqRef.current) return
        setPointPhotosError(extractErrorMessage(e))
        setPointPhotos(null)
      } finally {
        if (seq === pointPhotosSeqRef.current) setPointPhotosLoading(false)
      }
    })()
  }, [hidePointPhotos, materialPoint, pointKey])

  const groupedPointPhotos = useMemo(
    () => (pointPhotos ? groupPhotosByYear(pointPhotos) : []),
    [pointPhotos],
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={material.title}
          style={{
            width: '100%',
            height: 'auto',
            borderRadius: 12,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
          }}
        />
      ) : (
        <div
          style={{
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            padding: 12,
            borderRadius: 12,
            color: 'var(--muted)',
          }}
        >
          No image URL returned by API (missing `fileUrl` / `thumbnailUrl`).
        </div>
      )}

      <div>
        <div style={{ fontWeight: 750, fontSize: 18 }}>{material.title}</div>
        <div style={{ color: 'var(--muted)' }}>
          {material.creationDate} • {material.location}
        </div>
      </div>

      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 12,
          background: 'var(--surface)',
        }}
      >
        <div style={{ fontWeight: 650, marginBottom: 6 }}>Description</div>
        <div style={{ whiteSpace: 'pre-wrap' }}>{material.description}</div>
      </div>

      {!hidePointPhotos && (
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
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ fontWeight: 650 }}>Photos at this point</div>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>
              {pointPhotosLoading ? 'Loading…' : pointPhotos ? `${pointPhotos.length} found` : '—'}
            </div>
          </div>

          {pointPhotosError && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{pointPhotosError}</div>}

          {!pointPhotosLoading && !pointPhotosError && pointPhotos?.length ? (
            <div style={{ display: 'grid', gap: 12 }}>
              {groupedPointPhotos.map((g) => (
                <div key={g.label} style={{ display: 'grid', gap: 8 }}>
                  <div style={{ fontWeight: 650, color: 'var(--muted)' }}>{g.label}</div>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {g.items.map((p) => {
                      const isCurrent = p.id === material.id
                      const canSelect = Boolean(onSelectMaterialId) && !isCurrent
                      const Tag = canSelect || isCurrent ? 'button' : 'div'
                      return (
                        <Tag
                          key={p.id}
                          {...((canSelect || isCurrent) && {
                            className: 'btn',
                            type: 'button' as const,
                            onClick: canSelect ? () => onSelectMaterialId?.(p.id) : undefined,
                            'aria-current': isCurrent ? ('true' as const) : undefined,
                          })}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            justifyContent: 'flex-start',
                            padding: 10,
                            borderRadius: 12,
                            border: '1px solid var(--border)',
                            background: isCurrent ? 'var(--surface-2)' : 'transparent',
                            cursor: canSelect ? 'pointer' : isCurrent ? 'default' : undefined,
                          }}
                        >
                          {p.title || p.id}
                          {isCurrent && (
                            <span className="pill" style={{ marginLeft: 8 }}>
                              Viewing
                            </span>
                          )}
                        </Tag>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : !pointPhotosLoading && !pointPhotosError ? (
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>
              {materialPoint ? 'No photos found for this point yet.' : 'No coordinates for this photo.'}
            </div>
          ) : null}
        </div>
      )}

      {material.tags?.length ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {material.tags.map((t) => (
            <span key={t} className="badge">
              {t}
            </span>
          ))}
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btnPrimary" onClick={onEdit} disabled={!canEdit}>
          Edit
        </button>
        {onAddPhotoAtPoint ? (
          <button
            className="btn"
            onClick={() => materialPoint && onAddPhotoAtPoint(materialPoint)}
            disabled={!canUploadAtPoint || !materialPoint}
            title={
              !isSignedIn
                ? 'Sign in to upload'
                : !canUploadAtPoint
                  ? 'Creator or admin role required to upload'
                  : !materialPoint
                    ? 'No coordinates for this photo'
                    : undefined
            }
          >
            Add photo
          </button>
        ) : null}
        <button className="btn btnDanger" onClick={onDelete} disabled={!canDelete}>
          Delete
        </button>
      </div>

      {canAdmin && (
        <details
          style={{
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 12,
            background: 'var(--surface)',
            display: 'grid',
            gap: 10,
          }}
        >
          <summary style={{ cursor: 'pointer' }}>
            <span style={{ fontWeight: 750 }}>Admin: block owner</span>
            <span style={{ marginLeft: 10, color: 'var(--muted)', fontSize: 12 }}>
              Owner id: {material.ownerId || '—'}
            </span>
          </summary>

          <div style={{ color: 'var(--muted)', fontSize: 12 }}>
            Use this when the photo is inappropriate. Blocking prevents the owner from adding more content.
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn" type="button" onClick={() => setBlockReason('Inappropriate content')}>
              Inappropriate
            </button>
            <button className="btn" type="button" onClick={() => setBlockReason('Spam')}>
              Spam
            </button>
            <button className="btn" type="button" onClick={() => setBlockReason('Copyright')}>
              Copyright
            </button>
          </div>

          <label style={{ display: 'grid', gap: 6 }}>
            <span>Reason</span>
            <input
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Blocked until</span>
            <input
              type="date"
              value={blockUntil}
              onChange={(e) => setBlockUntil(e.target.value)}
              style={inputStyle}
            />
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>
              Saved as UTC midnight for the selected date.
            </span>
          </label>
          <button
            className="btn"
            onClick={() => {
              const reason = (blockReason.trim() || 'Defective content').trim()
              const iso = new Date(blockUntil + 'T00:00:00.000Z').toISOString()
              const ok = window.confirm(
                `Block user ${material.ownerId} until ${blockUntil}?\nReason: ${reason}`,
              )
              if (!ok) return
              onBlockUser(reason, iso)
            }}
            disabled={!material.ownerId}
            title={!material.ownerId ? 'Missing owner id' : undefined}
          >
            Block user
          </button>
        </details>
      )}
    </div>
  )
}

const inputStyle: CSSProperties = {
  border: '1px solid var(--border)',
  background: 'var(--surface-2)',
  color: 'var(--text)',
  borderRadius: 10,
  padding: '8px 10px',
}

function extractErrorMessage(e: unknown): string {
  if (!e) return 'Unknown error'
  if (typeof e === 'string') return e
  if (e instanceof Error && e.message) return e.message
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
