import type { MaterialDTO } from '../../api/types'

export type LatLon = { lat: number; lon: number }

export function extractLatLon(m: MaterialDTO): LatLon | null {
  const anyM = m as unknown as Record<string, unknown>
  const directLat = toFiniteNumber(anyM.lat)
  const directLon = toFiniteNumber(anyM.lon)
  if (directLat !== null && directLon !== null) return { lat: directLat, lon: directLon }

  const directLonAlt = toFiniteNumber(anyM.lng)
  if (directLat !== null && directLonAlt !== null) return { lat: directLat, lon: directLonAlt }

  const directLat2 = typeof anyM.latitude === 'number' ? (anyM.latitude as number) : undefined
  const directLon2 = typeof anyM.longitude === 'number' ? (anyM.longitude as number) : undefined
  if (directLat2 !== undefined && directLon2 !== undefined) return { lat: directLat2, lon: directLon2 }

  const directLat3 = toFiniteNumber(anyM.latitude)
  const directLon3 = toFiniteNumber(anyM.longitude)
  if (directLat3 !== null && directLon3 !== null) return { lat: directLat3, lon: directLon3 }

  const metaAny = isRecord(anyM.metadata) ? anyM.metadata : null
  const metaGps = metaAny && isRecord(metaAny.gps) ? metaAny.gps : null

  const candidates = [
    [m.metadata?.lat, m.metadata?.lon],
    [m.metadata?.lat, m.metadata?.lng],
    [m.metadata?.latitude, m.metadata?.longitude],
    [m.metadata?.Lat, m.metadata?.Lon],
    [m.metadata?.Lat, m.metadata?.Lng],
    [m.metadata?.LAT, m.metadata?.LON],
    [m.metadata?.LAT, m.metadata?.LNG],
    [m.metadata?.GPSLatitude, m.metadata?.GPSLongitude],
    [m.metadata?.GPS_LATITUDE, m.metadata?.GPS_LONGITUDE],
    [m.metadata?.gpsLatitude, m.metadata?.gpsLongitude],
    [m.metadata?.gps_lat, m.metadata?.gps_lon],
    [m.metadata?.GpsLat, m.metadata?.GpsLon],
    [metaGps?.lat, metaGps?.lon],
    [metaGps?.lat, metaGps?.lng],
    [metaGps?.latitude, metaGps?.longitude],
  ] as Array<[unknown, unknown]>

  for (const [la, lo] of candidates) {
    if (la === undefined || la === null || lo === undefined || lo === null) continue
    const lat = parseCoordinate(la, 'lat', metaAny, m.metadata)
    const lon = parseCoordinate(lo, 'lon', metaAny, m.metadata)
    if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon }
  }

  const coordsRaw =
    m.metadata?.coordinates ??
    m.metadata?.coord ??
    m.metadata?.Coords ??
    m.metadata?.COORDS ??
    m.metadata?.geo ??
    m.metadata?.GeoJSON

  const fromCoords = tryExtractFromCoordinatesString(coordsRaw)
  if (fromCoords) return fromCoords

  return null
}

function parseCoordinate(
  raw: unknown,
  kind: 'lat' | 'lon',
  metadataAny: Record<string, unknown> | null,
  metadataStringMap: Record<string, string> | undefined,
): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw !== 'string') return Number.NaN

  const s = raw.trim()
  const direct = Number(s.replace(',', '.'))
  if (Number.isFinite(direct)) return direct

  const fromRational = parseExifRationalDms(s)
  if (fromRational !== null)
    return applyHemisphere(fromRational, kind, metadataAny, metadataStringMap, s)

  const fromDms = parseDms(s)
  if (fromDms !== null) return applyHemisphere(fromDms, kind, metadataAny, metadataStringMap, s)

  const fromSpace = parseSimpleSpaceSeparatedDms(s)
  if (fromSpace !== null)
    return applyHemisphere(fromSpace, kind, metadataAny, metadataStringMap, s)

  return Number.NaN
}

function applyHemisphere(
  value: number,
  kind: 'lat' | 'lon',
  metadataAny: Record<string, unknown> | null,
  metadataStringMap: Record<string, string> | undefined,
  raw: string,
): number {
  const upper = raw.toUpperCase()
  if (upper.includes('S') || upper.includes('W')) return -Math.abs(value)
  if (upper.includes('N') || upper.includes('E')) return Math.abs(value)

  const refKey = kind === 'lat' ? 'GPSLatitudeRef' : 'GPSLongitudeRef'
  const refRaw =
    (typeof metadataAny?.[refKey] === 'string' ? (metadataAny?.[refKey] as string) : undefined) ??
    metadataStringMap?.[refKey]
  const ref = refRaw?.trim().toUpperCase()
  if (ref === 'S' || ref === 'W') return -Math.abs(value)
  if (ref === 'N' || ref === 'E') return Math.abs(value)

  return value
}

function parseDms(s: string): number | null {
  const cleaned = s
    .replace(/[^\d.,\-+NSEW°'"’″\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const re =
    /^([+-]?\d+(?:[.,]\d+)?)\s*(?:°|D)?\s*(?:(\d+(?:[.,]\d+)?)\s*(?:'|M)?)?\s*(?:(\d+(?:[.,]\d+)?)\s*(?:"|S)?)?\s*([NSEW])?$/i
  const m = cleaned.match(re)
  if (!m) return null

  const deg = Number(m[1].replace(',', '.'))
  const min = m[2] ? Number(m[2].replace(',', '.')) : 0
  const sec = m[3] ? Number(m[3].replace(',', '.')) : 0
  if (![deg, min, sec].every(Number.isFinite)) return null

  const abs = Math.abs(deg) + min / 60 + sec / 3600
  const signed = deg < 0 ? -abs : abs

  if (!m[4]) return signed
  const hemi = m[4].toUpperCase()
  if (hemi === 'S' || hemi === 'W') return -Math.abs(signed)
  if (hemi === 'N' || hemi === 'E') return Math.abs(signed)
  return signed
}

function parseSimpleSpaceSeparatedDms(s: string): number | null {
  // Example: "52 13 47 N" or "21 0 44 E"
  const cleaned = s.replace(/[^\d.,\-+NSEW\s]/gi, ' ').replace(/\s+/g, ' ').trim()
  const parts = cleaned.split(' ')
  if (parts.length < 2) return null

  const hemi = parts.find((p) => /^[NSEW]$/i.test(p))?.toUpperCase()
  const nums = parts.filter((p) => !/^[NSEW]$/i.test(p)).slice(0, 3)
  if (nums.length < 2) return null

  const deg = Number(nums[0].replace(',', '.'))
  const min = Number(nums[1].replace(',', '.'))
  const sec = nums[2] ? Number(nums[2].replace(',', '.')) : 0
  if (![deg, min, sec].every(Number.isFinite)) return null

  const abs = Math.abs(deg) + min / 60 + sec / 3600
  let signed = deg < 0 ? -abs : abs

  if (hemi === 'S' || hemi === 'W') signed = -Math.abs(signed)
  if (hemi === 'N' || hemi === 'E') signed = Math.abs(signed)
  return signed
}

function parseExifRationalDms(s: string): number | null {
  // Common EXIF-like strings: "52/1, 13/1, 4723/100" or "52/1 13/1 47/1"
  const cleaned = s.replace(/[^\d/.,\s]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!cleaned.includes('/')) return null

  const tokens = cleaned.split(/[,\s]+/).filter(Boolean).slice(0, 3)
  if (tokens.length < 2) return null

  const nums = tokens.map((t) => {
    const [a, b] = t.split('/')
    const na = Number(a?.replace(',', '.'))
    const nb = Number(b?.replace(',', '.'))
    if (!Number.isFinite(na)) return Number.NaN
    if (!b) return na
    if (!Number.isFinite(nb) || nb === 0) return Number.NaN
    return na / nb
  })

  if (nums.some((n) => !Number.isFinite(n))) return null

  const [deg, min, sec] = [nums[0], nums[1], nums[2] ?? 0]
  const abs = Math.abs(deg) + min / 60 + sec / 3600
  return deg < 0 ? -abs : abs
}

function tryExtractFromCoordinatesString(raw: string | undefined): LatLon | null {
  if (!raw) return null
  const s = raw.trim()
  if (!s) return null

  // JSON array: [lon,lat] or [lat,lon] (heuristic)
  if (s.startsWith('[') || s.startsWith('{')) {
    try {
      const parsed = JSON.parse(s) as unknown
      const fromJson = tryExtractFromGeoJsonLike(parsed)
      if (fromJson) return fromJson
    } catch {
      // fallthrough
    }
  }

  // "lon,lat" or "lat,lon"
  const m = s.match(/([+-]?\d+(?:[.,]\d+)?)\s*,\s*([+-]?\d+(?:[.,]\d+)?)/)
  if (!m) return null
  const a = Number(m[1].replace(',', '.'))
  const b = Number(m[2].replace(',', '.'))
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null

  // Prefer [lon,lat] if it looks like it
  if (Math.abs(a) <= 180 && Math.abs(b) <= 90) return { lat: b, lon: a }
  if (Math.abs(a) <= 90 && Math.abs(b) <= 180) return { lat: a, lon: b }
  return null
}

function tryExtractFromGeoJsonLike(v: unknown): LatLon | null {
  if (Array.isArray(v) && v.length >= 2) {
    const a = v[0]
    const b = v[1]
    if (typeof a === 'number' && typeof b === 'number') {
      if (Math.abs(a) <= 180 && Math.abs(b) <= 90) return { lat: b, lon: a } // [lon,lat]
      if (Math.abs(a) <= 90 && Math.abs(b) <= 180) return { lat: a, lon: b } // [lat,lon]
    }
  }

  if (!v || typeof v !== 'object') return null
  const obj = v as Record<string, unknown>
  const coords = obj.coordinates
  if (coords) return tryExtractFromGeoJsonLike(coords)
  return null
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object'
}

function toFiniteNumber(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  if (typeof raw !== 'string') return null
  const n = Number(raw.trim().replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

