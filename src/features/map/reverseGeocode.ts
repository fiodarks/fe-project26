import type { LatLon } from './coords'

type NominatimReverseResponse = {
  display_name?: string
  name?: string
  address?: Record<string, unknown>
}

function pickString(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s ? s : null
}

function formatFromAddress(address: Record<string, unknown> | undefined): string | null {
  if (!address) return null

  const placeName =
    pickString(address.attraction) ??
    pickString(address.amenity) ??
    pickString(address.leisure) ??
    pickString(address.tourism) ??
    pickString(address.historic) ??
    pickString(address.building) ??
    pickString(address.shop) ??
    pickString(address.office) ??
    pickString(address.club) ??
    pickString(address.craft) ??
    pickString(address.man_made) ??
    pickString(address.aeroway) ??
    pickString(address.railway) ??
    pickString(address.station) ??
    pickString(address.bridge)

  const houseNumber = pickString(address.house_number)
  const road = pickString(address.road) ?? pickString(address.pedestrian) ?? pickString(address.footway)

  const neighbourhood =
    pickString(address.neighbourhood) ??
    pickString(address.suburb) ??
    pickString(address.quarter) ??
    pickString(address.city_district)

  const cityLike =
    pickString(address.city) ??
    pickString(address.town) ??
    pickString(address.village) ??
    pickString(address.municipality) ??
    pickString(address.county)

  if (placeName) {
    if (cityLike) return `${placeName}, ${cityLike}`
    if (road) return placeName
    if (neighbourhood) return `${placeName}, ${neighbourhood}`
    return placeName
  }

  if (road && cityLike) {
    const street = houseNumber ? `${road} ${houseNumber}` : road
    return `${street}, ${cityLike}`
  }
  if (neighbourhood && cityLike) return `${neighbourhood}, ${cityLike}`
  if (cityLike) return cityLike
  return null
}

export async function reverseGeocodeOsmNominatim(
  p: LatLon,
  opts?: { signal?: AbortSignal; zoom?: number },
): Promise<string | null> {
  const zoom = opts?.zoom ?? 18
  const url = new URL('https://nominatim.openstreetmap.org/reverse')
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('lat', String(p.lat))
  url.searchParams.set('lon', String(p.lon))
  url.searchParams.set('zoom', String(zoom))
  url.searchParams.set('addressdetails', '1')

  const lang = typeof navigator !== 'undefined' ? navigator.language : ''
  const headers: HeadersInit = lang ? { 'Accept-Language': lang } : {}

  const res = await fetch(url.toString(), { headers, signal: opts?.signal })
  if (!res.ok) return null

  const data = (await res.json()) as NominatimReverseResponse
  const fromAddress = formatFromAddress(data.address)
  if (fromAddress) return fromAddress

  const name = pickString(data.name)
  if (name) return name

  const display = pickString(data.display_name)
  if (!display) return null

  // Keep it short: first two parts of the display_name.
  const parts = display.split(',').map((x) => x.trim()).filter(Boolean)
  return parts.slice(0, 2).join(', ') || display
}
