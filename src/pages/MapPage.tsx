import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  blockUser,
  createMaterial,
  deleteMaterial,
  getHierarchy,
  getHierarchyViewport,
  getMaterial,
  getMaterialPreviews,
  getMaterialPoints,
  searchMaterials,
  updateMaterial,
} from '../api/archiveApi'
import type {
  HierarchyNode,
  HierarchyViewportTreeNode,
  MaterialDTO,
  MaterialPointDTO,
  MaterialPointsResponse,
  MaterialPreviewDTO,
  UpdateMaterialCommand,
} from '../api/types'
import { decodeUserProfileFromToken, type Role, type Session } from '../auth/session'
import { Drawer } from '../ui/Drawer'
import { LeafletMap, type LatLon } from '../features/map/LeafletMap'
import { HierarchyViewportPicker } from '../features/hierarchy/HierarchyViewportPicker'
import { MaterialDetailsDrawer } from '../features/materials/MaterialDetailsDrawer'
import { MaterialUpsertDrawer } from '../features/materials/MaterialUpsertDrawer'
import { reverseGeocodeOsmNominatim } from '../features/map/reverseGeocode'
import { UserDrawer } from '../features/user/UserDrawer'
import { appendPointsLog } from '../features/user/pointsLog'

type MapSearchState = {
  search: string
  dateFrom: string
  dateTo: string
  hierarchyLevelIds: string[]
}

const emptySearch: MapSearchState = {
  search: '',
  dateFrom: '',
  dateTo: '',
  hierarchyLevelIds: [],
}

export function MapPage({
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
  const [hierarchyRoot, setHierarchyRoot] = useState<HierarchyNode | null>(null)
  const [bbox, setBbox] = useState<[number, number, number, number] | null>(null)
  const [mapZoom, setMapZoom] = useState<number | null>(null)

  const [hierarchyViewportRoot, setHierarchyViewportRoot] = useState<HierarchyViewportTreeNode | null>(null)
  const [hierarchyNodesLoading, setHierarchyNodesLoading] = useState(false)
  const [hierarchyNodesHint, setHierarchyNodesHint] = useState<string | null>(null)
  const hierarchyNodesSeqRef = useRef(0)
  const hierarchyNodesDebounceRef = useRef<number | null>(null)
  const [pickedPoint, setPickedPoint] = useState<LatLon | null>(null)
  const [pickedPointLocationHint, setPickedPointLocationHint] = useState<string | null>(null)
  const pickedPointLocationSeqRef = useRef(0)

  const [rightDrawerOpen, setRightDrawerOpen] = useState(false)
  const [rightDrawerMode, setRightDrawerMode] = useState<'point' | 'material'>('point')
  const [userDrawerOpen, setUserDrawerOpen] = useState(false)
  const [selectedPointKey, setSelectedPointKey] = useState<string | null>(null)
  const [pointsRes, setPointsRes] = useState<MaterialPointsResponse | null>(null)
  const [selectedPoint, setSelectedPoint] = useState<MaterialPointDTO | null>(null)

  const [upsertOpen, setUpsertOpen] = useState(false)
  const [upsertMode, setUpsertMode] = useState<'create' | 'edit'>('create')

  const [searchDraft, setSearchDraft] = useState<MapSearchState>(emptySearch)
  const [searchApplied, setSearchApplied] = useState<MapSearchState>(emptySearch)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [markerCount, setMarkerCount] = useState(0)
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialDTO | null>(null)

  const profile = useMemo(
    () => decodeUserProfileFromToken(token),
    [token],
  )
  const currentUserId = profile.userId

  const [prevLoginAt, setPrevLoginAt] = useState<string | null>(null)
  useEffect(() => {
    if (!token) {
      setPrevLoginAt(null)
      return
    }
    const v = window.sessionStorage.getItem('dsa_prev_login_at')
    setPrevLoginAt(v && v.trim() ? v : null)
  }, [token])

  const mapPoints = useMemo(() => pointsRes?.points ?? [], [pointsRes])
  const fetchSeqRef = useRef(0)
  const debounceTimerRef = useRef<number | null>(null)

  const previewCacheRef = useRef<Map<string, MaterialPreviewDTO>>(new Map())
  const [, setPreviewCacheTick] = useState(0)

  const [pointMaterialsLoading, setPointMaterialsLoading] = useState(false)
  const [pointMaterialsError, setPointMaterialsError] = useState<string | null>(null)
  const pointMaterialsSeqRef = useRef(0)

  const hierarchyLevel = useMemo(() => {
    if (mapZoom === null) return null
    return hierarchyLevelForZoom(mapZoom)
  }, [mapZoom])

  useEffect(() => {
    if (!bbox || !hierarchyLevel) {
      setHierarchyViewportRoot(null)
      setHierarchyNodesLoading(false)
      setHierarchyNodesHint(null)
      return
    }

    if (hierarchyNodesDebounceRef.current) window.clearTimeout(hierarchyNodesDebounceRef.current)

    const seq = ++hierarchyNodesSeqRef.current
    setHierarchyNodesLoading(true)
    setHierarchyNodesHint(null)

    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await getHierarchyViewport(token ?? null, { bbox, level: hierarchyLevel })
          if (seq !== hierarchyNodesSeqRef.current) return
          // If we're at city zoom and the viewport contains exactly one city, try to drill down to its
          // children (districts) so users can filter within the city.
          if (hierarchyLevel === 'city') {
            const cities = collectViewportNodesByLevel(res.root, 'city')
            const city = cities.length === 1 ? cities[0] : null
            if (city?.hasChildren) {
              try {
                const childLevel = 'district'
                const childRes = await getHierarchyViewport(token ?? null, {
                  bbox,
                  level: childLevel,
                  parentId: city.id,
                })
                if (seq !== hierarchyNodesSeqRef.current) return
                setHierarchyViewportRoot(childRes.root)
                setHierarchyNodesHint(`Loaded: ${childLevel} (within ${city.name}).`)
                return
              } catch {
                // Fall back to showing the city if BE doesn't support the child level yet.
              }
            }
          }
          setHierarchyViewportRoot(res.root)
          setHierarchyNodesHint(`Loaded: ${res.level ?? hierarchyLevel}.`)
        } catch {
          if (seq !== hierarchyNodesSeqRef.current) return
          setHierarchyViewportRoot(null)
          setHierarchyNodesHint(null)
        } finally {
          if (seq === hierarchyNodesSeqRef.current) setHierarchyNodesLoading(false)
        }
      })()
    }, 250)
    hierarchyNodesDebounceRef.current = t

    return () => {
      window.clearTimeout(t)
    }
  }, [bbox, hierarchyLevel, token])

  const runFetchPoints = useCallback(async (nextApplied?: MapSearchState) => {
    if (!bbox) return
    const s = nextApplied ?? searchApplied
    const seq = ++fetchSeqRef.current
    setError(null)
    setLoading(true)
    try {
      const res = await getMaterialPoints({
        bbox,
        search: s.search.trim() || undefined,
        dateFrom: s.dateFrom.trim() || undefined,
        dateTo: s.dateTo.trim() || undefined,
        hierarchyLevelId: s.hierarchyLevelIds.length ? s.hierarchyLevelIds : undefined,
      })
      if (seq !== fetchSeqRef.current) return
      setPointsRes(res)
    } catch (e: unknown) {
      if (seq !== fetchSeqRef.current) return
      const msg = extractErrorMessage(e)
      setError(msg)
      onToast(msg)
    } finally {
      if (seq === fetchSeqRef.current) setLoading(false)
    }
  }, [bbox, onToast, searchApplied])

  const openMaterialDetails = async (id: string) => {
    setUserDrawerOpen(false)
    setRightDrawerOpen(true)
    setRightDrawerMode('material')
    setSelectedMaterial(null)
    try {
      const fresh = await getMaterial(session.accessToken ?? null, id)
      setSelectedMaterial(fresh)
    } catch {
      onToast('Failed to load photo details.')
    }
  }

  useEffect(() => {
    if (!rightDrawerOpen) return
    if (!selectedPoint) {
      setPointMaterialsError(null)
      setPointMaterialsLoading(false)
      return
    }

    const ids = Array.from(
      new Set(selectedPoint.photos.map((p) => p.id).filter(Boolean)),
    )

    const seq = ++pointMaterialsSeqRef.current
    setPointMaterialsError(null)
    setPointMaterialsLoading(true)

    void (async () => {
      try {
        const missing = ids.filter((id) => !previewCacheRef.current.has(id))
        if (missing.length === 0) {
          if (seq === pointMaterialsSeqRef.current) setPointMaterialsLoading(false)
          return
        }
        const batches = chunk(missing, 200)
        await runWithConcurrency(batches, 2, async (batch) => {
          const res = await getMaterialPreviews(batch)
          for (const p of res.data ?? []) previewCacheRef.current.set(p.id, p)
        })
        setPreviewCacheTick((t) => t + 1)
        if (seq !== pointMaterialsSeqRef.current) return
      } catch (e: unknown) {
        if (seq !== pointMaterialsSeqRef.current) return
        setPointMaterialsError(extractErrorMessage(e))
      } finally {
        if (seq === pointMaterialsSeqRef.current) setPointMaterialsLoading(false)
      }
    })()
  }, [rightDrawerOpen, selectedPoint])

  useEffect(() => {
    if (!bbox) return
    if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = window.setTimeout(() => {
      void runFetchPoints()
    }, 350)
    return () => {
      if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current)
    }
  }, [bbox, runFetchPoints])

  useEffect(() => {
    if (!selectedPointKey) {
      setSelectedPoint(null)
      return
    }
    setSelectedPoint(mapPoints.find((p) => pointKey(p) === selectedPointKey) ?? null)
  }, [mapPoints, selectedPointKey])

  const canCreate = Boolean(token) && (roles.has('creator') || roles.has('admin'))
  const canAdmin = Boolean(token) && roles.has('admin')

  const [listDrawerOpen, setListDrawerOpen] = useState(false)
  const [listMode, setListMode] = useState<'mine' | 'newSinceLogin'>('mine')
  const [listSearch, setListSearch] = useState('')
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [listItems, setListItems] = useState<MaterialDTO[]>([])
  const listFetchSeqRef = useRef(0)

  const pointsLogUserKey = useMemo(() => {
    const p = decodeUserProfileFromToken(token)
    return p.userId ?? p.email ?? null
  }, [token])

  const openList = useCallback(
    (mode: 'mine' | 'newSinceLogin') => {
      if (!token) {
        onToast('Sign in required')
        onNeedLogin()
        return
      }
      setListMode(mode)
      setListSearch('')
      setListDrawerOpen(true)
    },
    [onNeedLogin, onToast, token],
  )

  useEffect(() => {
    if (!listDrawerOpen) return
    if (!token) return

    const seq = ++listFetchSeqRef.current
    setListLoading(true)
    setListError(null)
    setListItems([])

    void (async () => {
      try {
        const res = await searchMaterials(token, {
          search: listSearch.trim() || undefined,
          page: 0,
          size: 200,
        })
        if (seq !== listFetchSeqRef.current) return
        let items = (res.data ?? []).slice()
        if (listMode === 'mine') {
          items = currentUserId ? items.filter((m) => m.ownerId === currentUserId) : []
        } else {
          if (!prevLoginAt) items = []
          else {
            const prevMs = Date.parse(prevLoginAt)
            items = items.filter((m) => Date.parse(m.createdAt) > prevMs)
          }
        }
        items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        setListItems(items)
      } catch (e: unknown) {
        if (seq !== listFetchSeqRef.current) return
        const msg = extractErrorMessage(e)
        setListError(msg)
        setListItems([])
        onToast(msg)
      } finally {
        if (seq === listFetchSeqRef.current) setListLoading(false)
      }
    })()
  }, [currentUserId, listDrawerOpen, listMode, listSearch, onToast, prevLoginAt, token])

  useEffect(() => {
    if (!upsertOpen) return
    void (async () => {
      try {
        setHierarchyRoot(await getHierarchy(token ?? null))
      } catch {
        setHierarchyRoot(null)
      }
    })()
  }, [token, upsertOpen])

  const requestUploadAtPoint = useCallback(
    (p: LatLon) => {
      setPickedPoint(p)
      if (!token) {
        onToast('Sign in to upload')
        onNeedLogin()
        return
      }
      if (!(roles.has('creator') || roles.has('admin'))) {
        onToast('Creator or admin role required to upload')
        return
      }
      setUpsertMode('create')
      setUpsertOpen(true)
    },
    [onNeedLogin, onToast, roles, token],
  )

  useEffect(() => {
    if (!pickedPoint) {
      setPickedPointLocationHint(null)
      return
    }

    const key = pointKey(pickedPoint)
    const fromExistingPoint = mapPoints.find((p) => pointKey(p) === key)?.title ?? null
    if (fromExistingPoint) {
      setPickedPointLocationHint(null)
      return
    }

    const seq = ++pickedPointLocationSeqRef.current
    setPickedPointLocationHint(null)

    const controller = new AbortController()
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const name = await reverseGeocodeOsmNominatim(pickedPoint, { signal: controller.signal })
          if (seq !== pickedPointLocationSeqRef.current) return
          setPickedPointLocationHint(name)
        } catch {
          if (seq !== pickedPointLocationSeqRef.current) return
          setPickedPointLocationHint(null)
        }
      })()
    }, 250)

    return () => {
      window.clearTimeout(t)
      controller.abort()
    }
  }, [mapPoints, pickedPoint])

  const uploadLocationHint = useMemo(() => {
    if (upsertMode !== 'create') return undefined
    if (!pickedPoint) return selectedPoint?.title
    const key = pointKey(pickedPoint)
    const fromPoints = mapPoints.find((p) => pointKey(p) === key)?.title
    if (fromPoints) return fromPoints
    return pickedPointLocationHint ?? undefined
  }, [mapPoints, pickedPoint, pickedPointLocationHint, selectedPoint?.title, upsertMode])

  const onBoundsBbox = useCallback((b: [number, number, number, number] | null) => {
    setBbox((prev) => {
      if (!prev || !b) return b
      return bboxClose(prev, b, 1e-9) ? prev : b
    })
  }, [])

  return (
    <>
      <div className="map">
        <LeafletMap
          points={mapPoints}
          selectedPointKey={selectedPointKey}
          pickedPoint={pickedPoint}
          isSignedIn={Boolean(token)}
          onPickedPoint={(p) => setPickedPoint(p)}
          onRequestUploadAtPoint={requestUploadAtPoint}
          onBoundsBbox={onBoundsBbox}
          onViewport={(v) => setMapZoom(v.zoom)}
          onSelectPoint={(key) => {
            setSelectedPointKey(key)
            const p = mapPoints.find((x) => pointKey(x) === key) ?? null
            if (p) setPickedPoint({ lat: p.lat, lon: p.lon })
            const mostRecentId = p ? mostRecentPhotoId(p) : null
            if (mostRecentId) {
              void openMaterialDetails(mostRecentId)
              return
            }
            setUserDrawerOpen(false)
            setRightDrawerOpen(true)
            setRightDrawerMode('point')
          }}
          onMarkerCount={(n) => setMarkerCount(n)}
        />
      </div>

      <div
        style={{
          position: 'absolute',
          left: 12,
          right: 12,
          top: 12,
          zIndex: 2000,
          display: 'flex',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            pointerEvents: 'auto',
            width: 'min(1100px, 100%)',
            border: '1px solid var(--border)',
            background: 'var(--surface-2)',
            borderRadius: 12,
            boxShadow: 'var(--shadow)',
            padding: 10,
            display: 'grid',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 700, marginRight: 4 }}>Search</div>

            <input
              value={searchDraft.search}
              onChange={(e) => setSearchDraft((s) => ({ ...s, search: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const next = { ...searchDraft }
                  setSearchApplied(next)
                  void runFetchPoints(next)
                }
              }}
              placeholder="Search phrase / title…"
              style={{
                ...inputStyle,
                flex: '1 1 360px',
                minWidth: 220,
              }}
            />

            <button
              className="btn btnPrimary"
              onClick={() => {
                const next = { ...searchDraft }
                setSearchApplied(next)
                void runFetchPoints(next)
              }}
              disabled={loading || !bbox}
              title="Apply filters and refresh map points"
            >
              Search
            </button>
            <button
              className="btn"
              onClick={() => {
                setSearchDraft(emptySearch)
                setSearchApplied(emptySearch)
                void runFetchPoints(emptySearch)
              }}
              disabled={loading || !bbox}
              title="Clear filters"
            >
              Clear
            </button>

            <span style={{ color: 'var(--muted)', fontSize: 12 }}>
              {loading
                ? 'Loading…'
                : pointsRes
                  ? `${pointsRes.points.length} points • ${markerCount} on map • ${pointsRes.totalPhotos} photos`
                  : '—'}
            </span>

	            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {token ? (
                  <button className="btn" onClick={() => openList('mine')} title="Browse your uploads">
                    My uploads
                  </button>
                ) : null}
                {canAdmin ? (
                  <button
                    className="btn"
                    onClick={() => openList('newSinceLogin')}
                    disabled={!prevLoginAt}
                    title={!prevLoginAt ? 'No previous login recorded on this device yet' : 'Browse new uploads since your last login'}
                  >
                    New since last login
                  </button>
                ) : null}
	              <button
	                className="btn"
	                onClick={() => {
	                  setRightDrawerOpen(false)
	                  setUserDrawerOpen(true)
	                }}
	                aria-label="Open user drawer"
	                title="User"
	                style={{ borderRadius: 999, padding: '8px 10px' }}
	              >
	                <span aria-hidden="true">👤</span>
	              </button>
	            </div>
	          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <label style={{ display: 'grid', gap: 6, minWidth: 160 }}>
              <span style={{ fontWeight: 650, fontSize: 12, color: 'var(--muted)' }}>Date from</span>
              <input
                value={searchDraft.dateFrom}
                onChange={(e) => setSearchDraft((s) => ({ ...s, dateFrom: e.target.value }))}
                placeholder="YYYY-MM-DD"
                style={inputStyle}
              />
            </label>

            <label style={{ display: 'grid', gap: 6, minWidth: 160 }}>
              <span style={{ fontWeight: 650, fontSize: 12, color: 'var(--muted)' }}>Date to</span>
              <input
                value={searchDraft.dateTo}
                onChange={(e) => setSearchDraft((s) => ({ ...s, dateTo: e.target.value }))}
                placeholder="YYYY-MM-DD"
                style={inputStyle}
              />
            </label>

            <div style={{ minWidth: 260, flex: '1 1 260px' }}>
              <HierarchyViewportPicker
                root={hierarchyViewportRoot}
                loading={hierarchyNodesLoading}
                selectedIds={searchDraft.hierarchyLevelIds}
                onChange={(ids) => {
                  setSearchDraft((s) => {
                    const next = { ...s, hierarchyLevelIds: ids }
                    setSearchApplied(next)
                    void runFetchPoints(next)
                    return next
                  })
                }}
                hint={hierarchyNodesHint ?? (hierarchyLevel ? `Loaded for zoom level: ${hierarchyLevel}.` : undefined)}
              />
            </div>
          </div>

          {searchApplied.search || searchApplied.dateFrom || searchApplied.dateTo || searchApplied.hierarchyLevelIds.length ? (
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>
              Filters applied (updates with map bounds).
            </div>
          ) : null}

          {error && (
            <div style={{ border: '1px solid var(--border)', padding: 10, borderRadius: 10, color: 'var(--danger)' }}>
              {error}
            </div>
          )}

          {!loading && pointsRes && pointsRes.points.length === 0 ? (
            <div
              style={{
                border: '1px solid var(--border)',
                padding: 10,
                borderRadius: 10,
                color: 'var(--muted)',
                background: 'var(--surface)',
              }}
              role="status"
            >
              No results. Try zooming out or clearing filters.
            </div>
          ) : null}
        </div>
      </div>

      <Drawer
        open={rightDrawerOpen}
        side="right"
        title={
          rightDrawerMode === 'material'
            ? selectedMaterial
              ? 'Photo details'
              : 'Photo'
            : selectedPoint
              ? `Point • ${selectedPoint.photos.length} photos`
              : 'Point'
        }
        onClose={() => {
          pointMaterialsSeqRef.current += 1
          setRightDrawerOpen(false)
          setRightDrawerMode('point')
          setSelectedPointKey(null)
          setSelectedPoint(null)
          setSelectedMaterial(null)
          setPointMaterialsError(null)
          setPointMaterialsLoading(false)
        }}
      >
        {rightDrawerMode === 'material' ? (
          !selectedMaterial ? (
            <div style={{ color: 'var(--muted)' }}>Loading…</div>
          ) : (
            <>
              {selectedPoint ? (
                <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                  {selectedPoint.title} • {selectedPoint.lat.toFixed(6)}, {selectedPoint.lon.toFixed(6)}
                </div>
              ) : (
                <button className="btn" onClick={() => setRightDrawerMode('point')}>
                  Back to point
                </button>
              )}
              <MaterialDetailsDrawer
                material={selectedMaterial}
                session={session}
                roles={roles}
                hidePointPhotos={Boolean(selectedPoint)}
                onAddPhotoAtPoint={(p) => {
                  requestUploadAtPoint(selectedPoint ? { lat: selectedPoint.lat, lon: selectedPoint.lon } : p)
                }}
                onSelectMaterialId={(id) => void openMaterialDetails(id)}
                onEdit={() => {
                  if (!token) {
                    onNeedLogin()
                    return
                  }
                  if (!canAdmin && !canCreate) {
                    onToast('Not allowed to edit')
                    return
                  }
                  setUpsertMode('edit')
                  setUpsertOpen(true)
                }}
                onDelete={async () => {
                  if (!token) {
                    onNeedLogin()
                    return
                  }
                  if (!window.confirm('Delete this material?')) return
                  try {
                    await deleteMaterial(token, selectedMaterial.id)
                    void runFetchPoints()
                    setSelectedMaterial(null)
                    setRightDrawerMode('point')
                    onToast('Deleted')
                  } catch (e: unknown) {
                    onToast(extractErrorMessage(e))
                  }
                }}
                onBlockUser={async (reason, blockedUntilIso) => {
                  if (!token) {
                    onNeedLogin()
                    return
                  }
                  if (!roles.has('admin')) {
                    onToast('Admin role required')
                    return
                  }
                  try {
                    await blockUser(token, selectedMaterial.ownerId, {
                      reason,
                      blockedUntil: blockedUntilIso,
                    })
                    onToast('User blocked')
                  } catch (e: unknown) {
                    onToast(extractErrorMessage(e))
                  }
                }}
              />

              {selectedPoint ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ fontWeight: 650 }}>More from this point</div>
                  <PointPhotoTiles
                    point={selectedPoint}
                    selectedId={selectedMaterial.id}
                    cache={previewCacheRef.current}
                    onPick={(id) => void openMaterialDetails(id)}
                  />
                </div>
              ) : null}
            </>
          )
        ) : !selectedPoint ? (
          <div style={{ color: 'var(--muted)' }}>Select a marker.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div style={{ fontWeight: 750, fontSize: 18 }}>{selectedPoint.title}</div>
              <div style={{ color: 'var(--muted)' }}>
                {selectedPoint.lat.toFixed(6)}, {selectedPoint.lon.toFixed(6)} • {selectedPoint.photos.length} photos
              </div>
            </div>

            <button
              className="btn btnPrimary"
              onClick={() => requestUploadAtPoint({ lat: selectedPoint.lat, lon: selectedPoint.lon })}
              disabled={Boolean(token) && !canCreate}
              title={!token ? 'Sign in to upload' : !canCreate ? 'Creator or admin role required to upload' : undefined}
            >
              Add new photo
            </button>

            {pointMaterialsError && <div style={{ color: 'var(--danger)' }}>{pointMaterialsError}</div>}

            {pointMaterialsLoading ? (
              <div style={{ color: 'var(--muted)' }}>Loading photos…</div>
            ) : selectedPoint.photos.length ? (
              <PointPhotoTiles
                point={selectedPoint}
                selectedId={null}
                cache={previewCacheRef.current}
                onPick={(id) => void openMaterialDetails(id)}
              />
            ) : (
              <div style={{ color: 'var(--muted)' }}>No photos.</div>
            )}
          </div>
        )}
      </Drawer>

      <Drawer
        open={userDrawerOpen}
        side="right"
        title="User"
        onClose={() => setUserDrawerOpen(false)}
      >
        <UserDrawer session={session} roles={roles} onNeedLogin={onNeedLogin} />
      </Drawer>

      <Drawer
        open={upsertOpen}
        side="bottom"
        title={upsertMode === 'create' ? 'Upload new photo' : 'Edit material'}
        onClose={() => setUpsertOpen(false)}
        modal
      >
        <MaterialUpsertDrawer
          mode={upsertMode}
          hierarchyRoot={hierarchyRoot}
          pickedPoint={pickedPoint}
          prefillLocation={uploadLocationHint}
          initial={upsertMode === 'edit' ? selectedMaterial : null}
          onCreate={async (form) => {
            if (!token) {
              onNeedLogin()
              return
            }
            try {
              const created = await createMaterial(token, form)
              if (pointsLogUserKey) {
                appendPointsLog(pointsLogUserKey, {
                  at: new Date().toISOString(),
                  delta: 1,
                  reason: 'Uploaded photo',
                })
              }
              setUpsertOpen(false)
              onToast('Uploaded')
              if (bbox) void runFetchPoints()
              setSelectedMaterial(created)
              setRightDrawerOpen(true)
              setRightDrawerMode('material')
            } catch (e: unknown) {
              onToast(extractErrorMessage(e))
            }
          }}
          onUpdate={async (command: UpdateMaterialCommand) => {
            if (!token) {
              onNeedLogin()
              return
            }
            if (!selectedMaterial) return
            try {
              const updated = await updateMaterial(token, selectedMaterial.id, command)
              setUpsertOpen(false)
              onToast('Saved')
              setSelectedMaterial(updated)
              if (bbox) void runFetchPoints()
            } catch (e: unknown) {
              onToast(extractErrorMessage(e))
            }
          }}
        />
      </Drawer>

      <Drawer
        open={listDrawerOpen}
        side="bottom"
        title={listMode === 'mine' ? 'My uploads' : 'New uploads since last login'}
        onClose={() => setListDrawerOpen(false)}
        modal
      >
        <div style={{ display: 'grid', gap: 10 }}>
          {listMode === 'newSinceLogin' && !prevLoginAt ? (
            <div style={{ color: 'var(--muted)' }}>
              First login on this device (no previous login recorded).
            </div>
          ) : null}

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontWeight: 650 }}>Search</span>
            <input
              className="input"
              value={listSearch}
              onChange={(e) => setListSearch(e.target.value)}
              placeholder="Search within list…"
            />
          </label>

          {listError ? <div style={{ color: 'var(--danger)' }}>{listError}</div> : null}
          {listLoading ? (
            <div style={{ color: 'var(--muted)' }}>Loading…</div>
          ) : listItems.length ? (
            <div style={{ display: 'grid', gap: 10 }}>
              {listItems.map((m) => (
                <div
                  key={m.id}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    padding: 10,
                    background: 'var(--surface)',
                    display: 'grid',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                    <div style={{ fontWeight: 750, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {m.title || m.id}
                    </div>
                    <div style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 12 }}>
                      {fmtDateTime(m.createdAt)}
                    </div>
                  </div>
                  <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                    {m.location} • {m.creationDate}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      className="btn"
                      onClick={() => {
                        setListDrawerOpen(false)
                        void openMaterialDetails(m.id)
                      }}
                    >
                      Open
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: 'var(--muted)' }} role="status">
              No results.
            </div>
          )}
        </div>
      </Drawer>
    </>
  )
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString()
}

function pointKey(p: { lat: number; lon: number }) {
  return `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`
}

function PointPhotoTiles({
  point,
  selectedId,
  cache,
  onPick,
}: {
  point: MaterialPointDTO
  selectedId: string | null
  cache: Map<string, MaterialPreviewDTO>
  onPick: (id: string) => void
}) {
  const groups = groupPointPhotosByYear(point.photos)
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {groups.map((g) => (
        <div key={g.label} style={{ display: 'grid', gap: 8 }}>
          <div style={{ fontWeight: 650, color: 'var(--muted)' }}>{g.label}</div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
              gap: 10,
            }}
          >
            {g.items.map((p) => {
              const cached = cache.get(p.id) ?? null
              const thumb = cached?.thumbnailUrl ?? cached?.fileUrl ?? null
              const isSelected = Boolean(selectedId) && selectedId === p.id
              return (
                <button
                  key={p.id}
                  className="btn"
                  style={{
                    display: 'grid',
                    gap: 8,
                    justifyItems: 'stretch',
                    padding: 8,
                    textAlign: 'left',
                    outline: isSelected ? '2px solid var(--accent)' : undefined,
                    background: isSelected ? 'var(--surface-2)' : undefined,
                  }}
                  aria-current={isSelected ? ('true' as const) : undefined}
                  onClick={() => onPick(p.id)}
                  title={p.title || p.id}
                >
                  {thumb ? (
                    <img
                      src={thumb}
                      alt=""
                      style={{
                        width: '100%',
                        height: 78,
                        objectFit: 'cover',
                        borderRadius: 10,
                        border: '1px solid var(--border)',
                        background: 'var(--surface)',
                      }}
                      loading="lazy"
                    />
                  ) : (
                    <div
                      style={{
                        width: '100%',
                        height: 78,
                        borderRadius: 10,
                        border: '1px solid var(--border)',
                        background: 'var(--surface)',
                        color: 'var(--muted)',
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: 12,
                      }}
                    >
                      {'Loading…'}
                    </div>
                  )}

                  <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 650,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {p.title || 'Untitled'}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function chunk<T>(items: T[], size: number): T[][] {
  const n = Math.max(1, Math.floor(size))
  const out: T[][] = []
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n))
  return out
}

function bboxClose(
  a: [number, number, number, number],
  b: [number, number, number, number],
  eps: number,
) {
  return (
    Math.abs(a[0] - b[0]) <= eps &&
    Math.abs(a[1] - b[1]) <= eps &&
    Math.abs(a[2] - b[2]) <= eps &&
    Math.abs(a[3] - b[3]) <= eps
  )
}

function collectViewportNodesByLevel(
  root: HierarchyViewportTreeNode,
  level: string,
): HierarchyViewportTreeNode[] {
  const out: HierarchyViewportTreeNode[] = []
  const stack: HierarchyViewportTreeNode[] = [root]
  while (stack.length) {
    const node = stack.pop()
    if (!node) continue
    if (node.level === level) out.push(node)
    for (const child of node.children ?? []) stack.push(child)
  }
  return out
}

function hierarchyLevelForZoom(zoom: number): string {
  // Tune this mapping to your BE's supported level slugs.
  if (zoom <= 4) return 'country'
  if (zoom <= 7) return 'region'
  if (zoom <= 12) return 'city'
  return 'district'
}

const inputStyle: CSSProperties = {
  border: '1px solid var(--border)',
  background: 'var(--surface-2)',
  color: 'var(--text)',
  borderRadius: 10,
  padding: '8px 10px',
}

function mostRecentPhotoId(point: MaterialPointDTO): string | null {
  if (!point.photos.length) return null
  const sorted = point.photos.slice().sort((a, b) => {
    const ay = typeof a.year === 'number' ? a.year : -1
    const by = typeof b.year === 'number' ? b.year : -1
    if (ay !== by) return by - ay
    return (a.title || a.id).localeCompare(b.title || b.id)
  })
  return sorted[0]?.id ?? null
}

function groupPointPhotosByYear(photos: MaterialPointDTO['photos']) {
  const byYear = new Map<number | null, MaterialPointDTO['photos']>()

  for (const p of photos) {
    const y = typeof p.year === 'number' ? p.year : null
    const list = byYear.get(y) ?? []
    list.push(p)
    byYear.set(y, list)
  }

  const years = Array.from(byYear.keys()).sort((a, b) => {
    if (a === null && b === null) return 0
    if (a === null) return 1
    if (b === null) return -1
    return b - a
  })

  return years.map((y) => {
    const items = (byYear.get(y) ?? []).slice()
    items.sort((a, b) => (a.title || a.id).localeCompare(b.title || b.id))
    return { year: y, label: y === null ? 'Unknown year' : String(y), items }
  })
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  const n = Math.max(1, Math.floor(limit))
  let idx = 0

  const runners = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (idx < items.length) {
      const current = items[idx]
      idx += 1
      await worker(current)
    }
  })

  await Promise.all(runners)
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
