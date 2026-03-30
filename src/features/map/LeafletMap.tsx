import { useEffect, useRef, useState } from 'react'
import type { MaterialPointDTO } from '../../api/types'
import { type LatLon } from './coords'

declare global {
  interface Window {
    L?: unknown
  }
}

export type { LatLon } from './coords'

export function LeafletMap({
  points,
  selectedPointKey,
  pickedPoint,
  isSignedIn,
  onPickedPoint,
  onRequestUploadAtPoint,
  onSelectPoint,
  onBoundsBbox,
  onViewport,
  onMarkerCount,
}: {
  points: MaterialPointDTO[]
  selectedPointKey: string | null
  pickedPoint: LatLon | null
  isSignedIn: boolean
  onPickedPoint: (p: LatLon | null) => void
  onRequestUploadAtPoint?: (p: LatLon) => void
  onSelectPoint: (pointKey: string) => void
  onBoundsBbox: (bbox: [number, number, number, number] | null) => void
  onViewport?: (v: { bbox: [number, number, number, number]; zoom: number }) => void
  onMarkerCount?: (count: number) => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<LeafletMapLike | null>(null)
  const markersLayerRef = useRef<LayerGroupLike | null>(null)
  const pickedMarkerRef = useRef<RemovableLike | null>(null)
  const onViewportRef = useRef(onViewport)
  const contextMenuRef = useRef<HTMLDivElement | null>(null)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    point: LatLon
  } | null>(null)

  useEffect(() => {
    onViewportRef.current = onViewport
  }, [onViewport])

  useEffect(() => {
    if (!contextMenu) return

    const onPointerDown = (ev: PointerEvent) => {
      const target = ev.target
      if (!(target instanceof Node)) {
        setContextMenu(null)
        return
      }

      const menu = contextMenuRef.current
      if (menu && menu.contains(target)) return
      setContextMenu(null)
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [contextMenu])

  useEffect(() => {
    onMarkerCount?.(points.length)
  }, [points.length, onMarkerCount])

  useEffect(() => {
    if (!containerRef.current) return
    const L = asLeaflet(window.L)
    if (!L) return
    if (mapRef.current) return

    const openCreateMenuAtEvent = (e: unknown) => {
      const latlng = getLatLngFromEvent(e)
      const lat = latlng?.lat
      const lon = latlng?.lng
      if (typeof lat !== 'number' || typeof lon !== 'number') return

      const containerPoint = getContainerPointFromEvent(e)
      if (containerPoint) {
        setContextMenu({
          x: Math.max(0, containerPoint.x),
          y: Math.max(0, containerPoint.y),
          point: { lat, lon },
        })
        return
      }

      const mouse = getMouseEventFromEvent(e)
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return

      if (!mouse) {
        setContextMenu({
          x: Math.max(0, rect.width / 2),
          y: Math.max(0, rect.height / 2),
          point: { lat, lon },
        })
        return
      }

      setContextMenu({
        x: Math.max(0, mouse.clientX - rect.left),
        y: Math.max(0, mouse.clientY - rect.top),
        point: { lat, lon },
      })
    }

    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true,
      doubleClickZoom: true,
    }).setView([52.2297, 21.0122], 12)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map)
    const markersLayer = L.layerGroup().addTo(map)
    markersLayerRef.current = markersLayer

    const emitBounds = () => {
      const b = map.getBounds()
      const sw = b.getSouthWest()
      const ne = b.getNorthEast()
      const bbox: [number, number, number, number] = [sw.lng, sw.lat, ne.lng, ne.lat]
      onBoundsBbox(bbox)
      onViewportRef.current?.({ bbox, zoom: map.getZoom() })
    }

    map.on('moveend', emitBounds)
    map.on('zoomend', emitBounds)

    map.on('click', (e: unknown) => {
      setContextMenu(null)
      const latlng = getLatLngFromEvent(e)
      const lat = latlng?.lat
      const lon = latlng?.lng
      if (typeof lat !== 'number' || typeof lon !== 'number') return
      onPickedPoint({ lat, lon })
    })

    map.on('contextmenu', (e: unknown) => {
      const mouse = getMouseEventFromEvent(e)
      mouse?.preventDefault?.()
      openCreateMenuAtEvent(e)
    })

    mapRef.current = map

    emitBounds()
  }, [onBoundsBbox, onPickedPoint])

  useEffect(() => {
    const L = asLeaflet(window.L)
    if (!L) return

    const layer = markersLayerRef.current
    if (!layer) return
    layer.clearLayers()

    for (const p of points) {
      const key = pointKey(p)
      const marker = L.marker([p.lat, p.lon], {
        title: `${p.title} (${p.photos.length})`,
      })
      marker.on('click', () => onSelectPoint(key))
      marker.addTo(layer)

      if (selectedPointKey && key === selectedPointKey) {
        marker.bindTooltip(p.title, { direction: 'top' }).openTooltip()
      }
    }
  }, [onSelectPoint, points, selectedPointKey])

  useEffect(() => {
    const L = asLeaflet(window.L)
    const map = mapRef.current
    if (!L || !map) return

    if (pickedMarkerRef.current) {
      pickedMarkerRef.current.remove()
      pickedMarkerRef.current = null
    }

    if (!pickedPoint) return
    pickedMarkerRef.current = L.circleMarker([pickedPoint.lat, pickedPoint.lon], {
      radius: 7,
      weight: 3,
      color: 'var(--accent)',
      fillOpacity: 0.2,
    }).addTo(map)
  }, [pickedPoint])

  if (!asLeaflet(window.L)) {
    return (
      <div
        style={{
          height: '100%',
          display: 'grid',
          placeItems: 'center',
          padding: 12,
          textAlign: 'center',
          background: 'var(--surface)',
        }}
      >
        <div>
          <div style={{ fontWeight: 650, marginBottom: 6 }}>
            Map library not loaded
          </div>
          <div style={{ color: 'var(--muted)' }}>
            Leaflet is expected via CDN. Check network access to unpkg.com.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ height: '100%', position: 'relative' }}>
      <div
        ref={containerRef}
        className="dsaMapLeaflet"
        style={{ height: '100%' }}
        aria-label="Map"
      />
      {contextMenu && (
        <div
          ref={contextMenuRef}
          style={{
            position: 'absolute',
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 2500,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            boxShadow: 'var(--shadow)',
            padding: 6,
            minWidth: 180,
          }}
          role="menu"
        >
          <button
            className="btn btnPrimary"
            style={{ width: '100%', justifyContent: 'flex-start' }}
            disabled={!isSignedIn}
            onClick={() => {
              const p = contextMenu.point
              setContextMenu(null)
              onRequestUploadAtPoint?.(p)
            }}
            role="menuitem"
            title={!isSignedIn ? 'Sign in to create' : undefined}
          >
            Create
          </button>
        </div>
      )}
    </div>
  )
}

function pointKey(p: { lat: number; lon: number }) {
  return `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`
}

type LatLngLike = { lat: number; lng: number }
type ContainerPointLike = { x: number; y: number }
type BoundsLike = { getSouthWest: () => LatLngLike; getNorthEast: () => LatLngLike }
type RemovableLike = { remove: () => void }
type LayerGroupLike = { clearLayers: () => void; addTo: (map: LeafletMapLike) => LayerGroupLike }
type LeafletMapLike = {
  setView: (center: [number, number], zoom: number) => LeafletMapLike
  on: (event: string, handler: (e?: unknown) => void) => void
  getBounds: () => BoundsLike
  getZoom: () => number
}

type LeafletLike = {
  map: (
    el: HTMLElement,
    opts: {
      zoomControl: boolean
      attributionControl: boolean
      doubleClickZoom: boolean
    },
  ) => LeafletMapLike
  tileLayer: (url: string, opts: { maxZoom: number; attribution: string }) => { addTo: (map: LeafletMapLike) => void }
  layerGroup: () => LayerGroupLike
  marker: (latlng: [number, number], opts: { title: string }) => {
    on: (event: string, handler: () => void) => void
    addTo: (layer: LayerGroupLike) => void
    bindTooltip: (text: string, opts: { direction: string }) => { openTooltip: () => void }
  }
  circleMarker: (
    latlng: [number, number],
    opts: { radius: number; weight: number; color: string; fillOpacity: number },
  ) => { addTo: (map: LeafletMapLike) => RemovableLike }
}

function asLeaflet(v: unknown): LeafletLike | null {
  if (!v || typeof v !== 'object') return null
  const obj = v as Record<string, unknown>
  if (typeof obj.map !== 'function') return null
  if (typeof obj.tileLayer !== 'function') return null
  if (typeof obj.layerGroup !== 'function') return null
  if (typeof obj.marker !== 'function') return null
  if (typeof obj.circleMarker !== 'function') return null
  return v as LeafletLike
}

function getLatLngFromEvent(e: unknown): LatLngLike | null {
  if (!e || typeof e !== 'object') return null
  const latlng = (e as Record<string, unknown>).latlng
  if (!latlng || typeof latlng !== 'object') return null
  const ll = latlng as Record<string, unknown>
  if (typeof ll.lat !== 'number' || typeof ll.lng !== 'number') return null
  return { lat: ll.lat, lng: ll.lng }
}

function getContainerPointFromEvent(e: unknown): ContainerPointLike | null {
  if (!e || typeof e !== 'object') return null
  const p = (e as Record<string, unknown>).containerPoint
  if (!p || typeof p !== 'object') return null
  const point = p as Record<string, unknown>
  if (typeof point.x !== 'number' || typeof point.y !== 'number') return null
  return { x: point.x, y: point.y }
}

function getMouseEventFromEvent(e: unknown): MouseEvent | null {
  if (!e || typeof e !== 'object') return null
  const originalEvent = (e as Record<string, unknown>).originalEvent
  if (!originalEvent || typeof originalEvent !== 'object') return null
  const oe = originalEvent as Record<string, unknown>
  if (typeof oe.clientX !== 'number' || typeof oe.clientY !== 'number') return null
  return originalEvent as MouseEvent
}
