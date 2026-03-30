import type { MaterialDTO } from '../../api/types'
import type { LatLon } from './coords'

export function makePointBbox(
  point: LatLon,
  radiusMeters: number = 15,
): [number, number, number, number] {
  // 1 deg latitude ~= 111_320m; longitude depends on latitude.
  const metersPerDegLat = 111_320
  const metersPerDegLon = metersPerDegLat * Math.max(0.2, Math.cos((point.lat * Math.PI) / 180))
  const dLat = radiusMeters / metersPerDegLat
  const dLon = radiusMeters / metersPerDegLon
  return [point.lon - dLon, point.lat - dLat, point.lon + dLon, point.lat + dLat]
}

function createdAtMs(m: MaterialDTO): number | null {
  const ms = Date.parse(m.createdAt)
  return Number.isFinite(ms) ? ms : null
}

function fallbackOrderKey(m: MaterialDTO): string {
  return `${m.creationDate || ''}|${m.id}`
}

function yearFromIsoLike(s: string | undefined): number | null {
  if (!s) return null
  const m = s.match(/^(\d{4})/)
  if (!m) return null
  const y = Number(m[1])
  return Number.isFinite(y) ? y : null
}

export type MaterialsByYearGroup = {
  year: number | null
  label: string
  items: MaterialDTO[]
}

function sortYearKeysDesc(a: number | null, b: number | null) {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  return b - a
}

function sortByCreatedAtAscThenFallback(a: MaterialDTO, b: MaterialDTO) {
  const am = createdAtMs(a)
  const bm = createdAtMs(b)
  if (am !== null && bm !== null) return am - bm // older -> newer, so new uploads append to the end
  if (am !== null) return 1
  if (bm !== null) return -1
  return fallbackOrderKey(a).localeCompare(fallbackOrderKey(b))
}

export function groupMaterialsByCreatedYear(materials: MaterialDTO[]): MaterialsByYearGroup[] {
  const byYear = new Map<number | null, MaterialDTO[]>()

  for (const m of materials) {
    const ms = createdAtMs(m)
    const year = ms !== null ? new Date(ms).getUTCFullYear() : yearFromIsoLike(m.createdAt)
    const list = byYear.get(year ?? null) ?? []
    list.push(m)
    byYear.set(year ?? null, list)
  }

  const years = Array.from(byYear.keys()).sort(sortYearKeysDesc)

  const out: MaterialsByYearGroup[] = []
  for (const y of years) {
    const items = (byYear.get(y) ?? []).slice()
    items.sort(sortByCreatedAtAscThenFallback)
    out.push({
      year: y,
      label: y === null ? 'Unknown year' : String(y),
      items,
    })
  }
  return out
}

export function groupMaterialsByCreationYear(materials: MaterialDTO[]): MaterialsByYearGroup[] {
  const byYear = new Map<number | null, MaterialDTO[]>()

  for (const m of materials) {
    const year = yearFromIsoLike(m.creationDate)
    const list = byYear.get(year ?? null) ?? []
    list.push(m)
    byYear.set(year ?? null, list)
  }

  const years = Array.from(byYear.keys()).sort(sortYearKeysDesc)
  const out: MaterialsByYearGroup[] = []

  for (const y of years) {
    const items = (byYear.get(y) ?? []).slice()
    // Keep "new upload goes to the end of its year" behavior.
    items.sort(sortByCreatedAtAscThenFallback)
    out.push({
      year: y,
      label: y === null ? 'Unknown year' : String(y),
      items,
    })
  }

  return out
}

export function upsertMaterialIntoList(prev: MaterialDTO[] | null, next: MaterialDTO): MaterialDTO[] {
  const base = prev ? prev.slice() : []
  const idx = base.findIndex((m) => m.id === next.id)
  if (idx >= 0) {
    base[idx] = next
    return base
  }
  base.push(next)
  return base
}
