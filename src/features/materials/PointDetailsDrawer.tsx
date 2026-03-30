import { useMemo } from 'react'
import type { MaterialPointDTO, MaterialPointPhotoDTO } from '../../api/types'
import type { Role, Session } from '../../auth/session'
import type { LatLon } from '../map/LeafletMap'

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

export function PointDetailsDrawer({
  point,
  session,
  roles,
  onAddPhotoAtPoint,
  onSelectMaterialId,
}: {
  point: MaterialPointDTO
  session: Session
  roles: Set<Role>
  onAddPhotoAtPoint?: (p: LatLon) => void
  onSelectMaterialId?: (id: string) => void
}) {
  const canUploadAtPoint = Boolean(session.accessToken) && roles.has('creator')
  const photoGroups = useMemo(() => groupPhotosByYear(point.photos), [point.photos])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <div style={{ fontWeight: 750, fontSize: 18 }}>{point.title}</div>
        <div style={{ color: 'var(--muted)' }}>
          {point.lat.toFixed(6)}, {point.lon.toFixed(6)} • {point.photos.length} photos
        </div>
      </div>

      {point.description ? (
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 12,
            background: 'var(--surface)',
            whiteSpace: 'pre-wrap',
          }}
        >
          {point.description}
        </div>
      ) : null}

      {onAddPhotoAtPoint && (
        <button
          className="btn btnPrimary"
          onClick={() => onAddPhotoAtPoint({ lat: point.lat, lon: point.lon })}
          disabled={!canUploadAtPoint}
          title={!canUploadAtPoint ? 'Creator role required to upload' : undefined}
        >
          Add new photo
        </button>
      )}

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
        <div style={{ fontWeight: 650 }}>Photos at this point</div>

        {point.photos.length === 0 ? (
          <div style={{ color: 'var(--muted)' }}>No photos.</div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {photoGroups.map((g) => (
              <div key={g.label} style={{ display: 'grid', gap: 8 }}>
                <div style={{ fontWeight: 650, color: 'var(--muted)' }}>{g.label}</div>
                <div style={{ display: 'grid', gap: 6 }}>
                  {g.items.map((p) => (
                    <button
                      key={p.id}
                      className="btn"
                      style={{ justifyContent: 'flex-start' }}
                      onClick={() => onSelectMaterialId?.(p.id)}
                      disabled={!onSelectMaterialId}
                      title={p.title || p.id}
                    >
                      {p.title || p.id}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

