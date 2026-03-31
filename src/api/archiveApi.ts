import { authHeaders, fetchJson, fetchNoContent, makeUrl } from './http'
import type {
  BlockUserCommand,
  AuditAction,
  AuditEventsPageResponse,
  GoogleAuthorizationUrlResponse,
  GoogleCallbackTokenResponse,
  LoginRequest,
  RegisterRequest,
  TokenResponse,
  HierarchyNode,
  HierarchyViewportResponse,
  HierarchyViewportTreeNode,
  MaterialDTO,
  MaterialListResponse,
  MaterialPreviewsResponse,
  MaterialPointsResponse,
  SetUserRolesCommand,
  UpdateMaterialCommand,
  UserAdminDetailsResponse,
  UserRole,
  UsersPageResponse,
} from './types'

export type SearchMaterialsParams = {
  search?: string
  title?: string
  location?: string
  hierarchyLevelId?: string
  dateFrom?: string
  dateTo?: string
  bbox?: [number, number, number, number] // minLon,minLat,maxLon,maxLat
  metadata?: Record<string, string>
  page?: number
  size?: number
}

export type SearchAllMaterialsParams = Omit<SearchMaterialsParams, 'page' | 'size'>

export async function getHierarchy(token: string | null): Promise<HierarchyNode> {
  return fetchJson<HierarchyNode>(makeUrl('/hierarchy/tree'), {
    headers: { ...authHeaders(token) },
  })
}

export type GetHierarchyViewportParams = {
  bbox: [number, number, number, number] // minLon,minLat,maxLon,maxLat
  level: string
  parentId?: string
  search?: string
  limit?: number
  include?: Array<'ancestors' | 'counts' | 'bbox'>
}

export async function getHierarchyViewport(
  token: string | null,
  params: GetHierarchyViewportParams,
): Promise<HierarchyViewportResponse> {
  const query: Record<string, string | undefined> = {
    bbox: params.bbox.join(','),
    level: params.level,
    parentId: params.parentId,
    search: params.search,
    limit: params.limit?.toString(),
    include: params.include?.length ? params.include.join(',') : undefined,
  }
  const raw = await fetchJson<unknown>(makeUrl('/hierarchy', query), {
    headers: { ...authHeaders(token) },
  })
  return normalizeHierarchyViewportResponse(raw, params.level, params.bbox)
}

function normalizeHierarchyViewportResponse(
  raw: unknown,
  fallbackLevel: string,
  fallbackBbox: [number, number, number, number],
): HierarchyViewportResponse {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid hierarchy viewport response')

  const obj = raw as Record<string, unknown>

  // New BE response: { level, bbox, root: {...}, pagination }
  if ('root' in obj && obj.root && typeof obj.root === 'object') {
    return obj as HierarchyViewportResponse
  }

  // Backward-compatible: { level, bbox, data: [...], pagination }
  if (Array.isArray(obj.data)) {
    const children = obj.data
      .filter((n): n is Record<string, unknown> => Boolean(n) && typeof n === 'object')
      .map((n) => coerceHierarchyViewportTreeNodeFromFlat(n))
      .filter((n): n is HierarchyViewportTreeNode => Boolean(n))

    const root: HierarchyViewportTreeNode = {
      id: 'viewport-root',
      name: 'Viewport',
      level: 'root',
      parentId: null,
      hasChildren: true,
      children,
      path: [],
      stats: null,
      extent: null,
    }

    return {
      level: typeof obj.level === 'string' ? obj.level : fallbackLevel,
      bbox: Array.isArray(obj.bbox) ? (obj.bbox as [number, number, number, number]) : fallbackBbox,
      root,
      pagination: obj.pagination as HierarchyViewportResponse['pagination'],
    }
  }

  throw new Error('Unsupported hierarchy viewport response shape')
}

function coerceHierarchyViewportTreeNodeFromFlat(
  n: Record<string, unknown>,
): HierarchyViewportTreeNode | null {
  const id = typeof n.id === 'string' ? n.id : null
  const name = typeof n.name === 'string' ? n.name : null
  const level = typeof n.level === 'string' ? n.level : null
  const parentId = typeof n.parentId === 'string' ? n.parentId : n.parentId === null ? null : null
  const hasChildren = typeof n.hasChildren === 'boolean' ? n.hasChildren : false

  if (!id || !name || !level) return null

  return {
    id,
    name,
    level,
    parentId,
    hasChildren,
    children: [],
    path: (n.path as HierarchyViewportTreeNode['path']) ?? null,
    stats: (n.stats as HierarchyViewportTreeNode['stats']) ?? null,
    extent: (n.extent as HierarchyViewportTreeNode['extent']) ?? null,
  }
}

export async function searchMaterials(
  token: string | null,
  params: SearchMaterialsParams,
): Promise<MaterialListResponse> {
  const query: Record<string, string | undefined> = {
    search: params.search,
    title: params.title,
    location: params.location,
    hierarchyLevelId: params.hierarchyLevelId,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    page: params.page?.toString(),
    size: params.size?.toString(),
  }
  if (params.bbox) query.bbox = params.bbox.join(',')
  if (params.metadata) {
    for (const [k, v] of Object.entries(params.metadata)) {
      const key = k.trim()
      const val = v.trim()
      if (!key || !val) continue
      query[`metadata[${key}]`] = val
    }
  }

  const raw = await fetchJson<unknown>(makeUrl('/materials', query), {
    headers: { ...authHeaders(token) },
  })
  return normalizeMaterialListResponse(raw, params.page ?? 0, params.size ?? 20)
}

export async function searchAllMaterials(
  token: string | null,
  params: SearchAllMaterialsParams,
): Promise<MaterialListResponse> {
  const res = await searchMaterials(token, params)
  return {
    pagination: {
      page: 0,
      size: (res.data ?? []).length,
      totalElements: res.pagination.totalElements ?? (res.data ?? []).length,
      totalPages: 1,
    },
    data: res.data ?? [],
  }
}

export async function getMaterialPoints(
  arg:
    | [number, number, number, number]
    | {
        bbox: [number, number, number, number]
        search?: string
        dateFrom?: string
        dateTo?: string
        hierarchyLevelId?: string | string[]
        filter?: string[] | Record<string, string>
        tags?: string[]
      },
): Promise<MaterialPointsResponse> {
  const params =
    Array.isArray(arg) ? { bbox: arg } : arg

  const query: Record<string, string | undefined | string[]> = {
    bbox: params.bbox.join(','),
    search: params.search,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    hierarchyLevelId: params.hierarchyLevelId,
  }

  if (params.tags?.length) query.tags = params.tags.filter(Boolean)

  if (params.filter) {
    const filters = Array.isArray(params.filter)
      ? params.filter
      : Object.entries(params.filter).map(([k, v]) => `${k}=${v}`)
    query.filter = filters.filter(Boolean)
  }

  const raw = await fetchJson<unknown>(makeUrl('/materials', query), { headers: {} })
  return normalizeMaterialPointsResponse(raw)
}

export async function getMaterialPreviews(ids: string[]): Promise<MaterialPreviewsResponse> {
  const raw = await fetchJson<unknown>(makeUrl('/materialsPreviews'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  })
  return normalizeMaterialPreviewsResponse(raw)
}

export async function getMaterial(
  token: string | null,
  id: string,
): Promise<MaterialDTO> {
  const raw = await fetchJson<unknown>(makeUrl(`/materials/${encodeURIComponent(id)}`), {
    headers: { ...authHeaders(token) },
  })
  return normalizeMaterialDto(raw)
}

export async function createMaterial(
  token: string | null,
  form: FormData,
): Promise<MaterialDTO> {
  const raw = await fetchJson<unknown>(makeUrl('/materials'), {
    method: 'POST',
    headers: { ...authHeaders(token) },
    body: form,
  })
  return normalizeMaterialDto(raw)
}

export async function updateMaterial(
  token: string | null,
  id: string,
  command: UpdateMaterialCommand,
): Promise<MaterialDTO> {
  const raw = await fetchJson<unknown>(makeUrl(`/materials/${encodeURIComponent(id)}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify(command),
  })
  return normalizeMaterialDto(raw)
}

export async function deleteMaterial(
  token: string | null,
  id: string,
): Promise<void> {
  return fetchNoContent(makeUrl(`/materials/${encodeURIComponent(id)}`), {
    method: 'DELETE',
    headers: { ...authHeaders(token) },
  })
}

export async function blockUser(
  token: string | null,
  userId: string,
  command: BlockUserCommand,
): Promise<void> {
  return fetchNoContent(
    makeUrl(`/users/${encodeURIComponent(userId)}/block`),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
      body: JSON.stringify(command),
    },
  )
}

export type ListUsersParams = {
  page?: number
  size?: number
  q?: string
  role?: UserRole
  blocked?: boolean
}

export async function listUsers(
  token: string | null,
  params: ListUsersParams,
): Promise<UsersPageResponse> {
  const query: Record<string, string | undefined> = {
    page: params.page?.toString(),
    size: params.size?.toString(),
    q: params.q,
    role: params.role,
    blocked: typeof params.blocked === 'boolean' ? String(params.blocked) : undefined,
  }
  return fetchJson<UsersPageResponse>(makeUrl('/users', query), {
    headers: { ...authHeaders(token) },
  })
}

export async function getUserAdminDetails(
  token: string | null,
  userId: string,
): Promise<UserAdminDetailsResponse> {
  return fetchJson<UserAdminDetailsResponse>(makeUrl(`/users/${encodeURIComponent(userId)}`), {
    headers: { ...authHeaders(token) },
  })
}

export async function setUserRoles(
  token: string | null,
  userId: string,
  command: SetUserRolesCommand,
): Promise<void> {
  return fetchNoContent(makeUrl(`/users/${encodeURIComponent(userId)}/roles`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify(command),
  })
}

export async function unblockUser(
  token: string | null,
  userId: string,
): Promise<void> {
  return fetchNoContent(makeUrl(`/users/${encodeURIComponent(userId)}/block`), {
    method: 'DELETE',
    headers: { ...authHeaders(token) },
  })
}

export type GetAuditEventsParams = {
  page?: number
  size?: number
  actorUserId?: string
  targetUserId?: string
  action?: AuditAction
  from?: string
  to?: string
}

export async function getAuditEvents(
  token: string | null,
  params: GetAuditEventsParams,
): Promise<AuditEventsPageResponse> {
  const query: Record<string, string | undefined> = {
    page: params.page?.toString(),
    size: params.size?.toString(),
    actorUserId: params.actorUserId,
    targetUserId: params.targetUserId,
    action: params.action,
    from: params.from,
    to: params.to,
  }

  return fetchJson<AuditEventsPageResponse>(makeUrl('/audit/events', query), {
    headers: { ...authHeaders(token) },
  })
}

export async function authGoogleLogin(): Promise<GoogleAuthorizationUrlResponse> {
  return fetchJson<GoogleAuthorizationUrlResponse>(makeUrl('/auth/google/login'), {
    headers: {},
  })
}

export async function authGoogleCallback(
  query: Record<string, string | undefined>,
): Promise<GoogleCallbackTokenResponse> {
  return fetchJson<GoogleCallbackTokenResponse>(
    makeUrl('/auth/google/callback', query),
    { headers: {} },
  )
}

export async function authLogin(body: LoginRequest): Promise<TokenResponse> {
  return fetchJson<TokenResponse>(makeUrl('/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function authRegister(body: RegisterRequest): Promise<TokenResponse> {
  return fetchJson<TokenResponse>(makeUrl('/auth/register'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export type { LoginRequest, RegisterRequest, TokenResponse }

function normalizeMaterialListResponse(
  raw: unknown,
  page: number,
  size: number,
): MaterialListResponse {
  if (Array.isArray(raw)) {
    return {
      pagination: { page, size, totalElements: raw.length, totalPages: 1 },
      data: normalizeMaterialArray(raw),
    }
  }
  if (!raw || typeof raw !== 'object') throw new Error('Unexpected /materials response')

  const obj = raw as Record<string, unknown>
  const data = obj.data

  if (data && Array.isArray(data)) {
    const pagination = obj.pagination
    if (pagination && typeof pagination === 'object') {
      const cast = raw as MaterialListResponse
      return { ...cast, data: normalizeMaterialArray(cast.data as unknown[]) }
    }
    return {
      pagination: { page, size, totalElements: data.length, totalPages: 1 },
      data: normalizeMaterialArray(data),
    }
  }

  throw new Error('Unexpected /materials response')
}

function normalizeMaterialPointsResponse(raw: unknown): MaterialPointsResponse {
  if (!raw) throw new Error('Unexpected /materials response')

  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>
    const maybePoints = obj.points
    if (Array.isArray(maybePoints)) {
      const points = normalizePointsArray(maybePoints)
      const totalFromApi = obj.totalPhotos
      const computedTotal = points.reduce((sum, p) => sum + p.photos.length, 0)
      return {
        points,
        totalPhotos: typeof totalFromApi === 'number' ? totalFromApi : computedTotal,
      }
    }

    const data = obj.data
    if (Array.isArray(data)) {
      const points = pointsFromMaterialsArray(data)
      return { points, totalPhotos: points.reduce((s, p) => s + p.photos.length, 0) }
    }
  }

  if (Array.isArray(raw)) {
    const points = pointsFromMaterialsArray(raw)
    return { points, totalPhotos: points.reduce((s, p) => s + p.photos.length, 0) }
  }

  throw new Error('Unexpected /materials response')
}

function normalizeMaterialPreviewsResponse(raw: unknown): MaterialPreviewsResponse {
  if (!raw || typeof raw !== 'object') throw new Error('Unexpected /materialsPreviews response')
  const obj = raw as Record<string, unknown>
  const dataRaw = obj.data
  if (!Array.isArray(dataRaw)) throw new Error('Unexpected /materialsPreviews response')
  const notFound = obj.notFoundIds
  return {
    data: dataRaw as MaterialPreviewsResponse['data'],
    notFoundIds: Array.isArray(notFound) ? (notFound as string[]) : undefined,
  }
}

type PointPhoto = { id: string; title: string; year: number | null }
type Point = { lat: number; lon: number; title: string; description: string | null; photos: PointPhoto[] }

function normalizePointsArray(points: unknown[]): Point[] {
  const out: Point[] = []
  for (const item of points) {
    if (!item || typeof item !== 'object') continue
    const obj = item as Record<string, unknown>
    const lat = obj.lat
    const lon = obj.lon
    if (typeof lat !== 'number' || typeof lon !== 'number') continue
    const title = typeof obj.title === 'string' ? obj.title : `${lat.toFixed(6)},${lon.toFixed(6)}`
    const description = obj.description === null || typeof obj.description === 'string' ? (obj.description as string | null) : null
    const photosRaw = obj.photos
    const photos: PointPhoto[] = Array.isArray(photosRaw)
      ? photosRaw
          .map((p) => {
            if (!p || typeof p !== 'object') return null
            const po = p as Record<string, unknown>
            const id = typeof po.id === 'string' ? po.id : null
            if (!id) return null
            const pt = typeof po.title === 'string' ? po.title : ''
            const yearRaw = po.year
            const year = typeof yearRaw === 'number' && Number.isFinite(yearRaw) ? yearRaw : null
            return { id, title: pt, year }
          })
          .filter((x): x is PointPhoto => Boolean(x))
      : []

    out.push({ lat, lon, title, description, photos })
  }
  return out
}

function pointsFromMaterialsArray(materials: unknown[]): Point[] {
  const byKey = new Map<string, Point>()

  for (const item of materials) {
    if (!item || typeof item !== 'object') continue
    const m = item as Record<string, unknown>
    const lat = m.lat
    const lon = m.lon
    const id = m.id
    if (typeof lat !== 'number' || typeof lon !== 'number') continue
    if (typeof id !== 'string' || !id) continue

    const key = `${lat.toFixed(6)},${lon.toFixed(6)}`
    const existing = byKey.get(key)
    const title = typeof m.location === 'string' && m.location.trim() ? m.location : typeof m.title === 'string' ? m.title : key

    const photoTitle = typeof m.title === 'string' ? m.title : ''
    const year = yearFromIsoLike(typeof m.creationDate === 'string' ? m.creationDate : typeof m.createdAt === 'string' ? m.createdAt : undefined)

    const photo: PointPhoto = { id, title: photoTitle, year }

    if (!existing) {
      byKey.set(key, {
        lat,
        lon,
        title,
        description: null,
        photos: [photo],
      })
    } else {
      existing.photos.push(photo)
    }
  }

  return Array.from(byKey.values())
}

function yearFromIsoLike(s: string | undefined): number | null {
  if (!s) return null
  const m = s.match(/^(\d{4})/)
  if (!m) return null
  const y = Number(m[1])
  return Number.isFinite(y) ? y : null
}

function normalizeMaterialArray(items: unknown[]): MaterialDTO[] {
  return items
    .map((x) => {
      try {
        return normalizeMaterialDto(x)
      } catch {
        return null
      }
    })
    .filter((x): x is MaterialDTO => Boolean(x))
}

function firstNonEmptyString(...items: unknown[]): string | null {
  for (const item of items) {
    if (typeof item !== 'string') continue
    const v = item.trim()
    if (v) return v
  }
  return null
}

function normalizeMaterialDto(raw: unknown): MaterialDTO {
  if (!raw || typeof raw !== 'object') throw new Error('Unexpected material DTO')
  const obj = raw as Record<string, unknown>

  const ownerFromNested =
    obj.owner && typeof obj.owner === 'object'
      ? firstNonEmptyString(
          (obj.owner as Record<string, unknown>).id,
          (obj.owner as Record<string, unknown>).userId,
          (obj.owner as Record<string, unknown>).user_id,
        )
      : null

  const ownerId =
    firstNonEmptyString(
      obj.ownerId,
      obj.owner_id,
      obj.userId,
      obj.user_id,
      obj.createdBy,
      obj.created_by,
      obj.createdById,
      obj.created_by_id,
    ) ?? ownerFromNested ?? ''

  const authorName =
    firstNonEmptyString(obj.authorName, obj.author_name, obj.uploaderName, obj.uploader_name) ??
    (obj.authorName === null ? null : undefined)
  const authorSurname =
    firstNonEmptyString(obj.authorSurname, obj.author_surname, obj.uploaderSurname, obj.uploader_surname) ??
    (obj.authorSurname === null ? null : undefined)

  return {
    ...(obj as unknown as MaterialDTO),
    ownerId,
    ...(authorName !== undefined ? { authorName } : {}),
    ...(authorSurname !== undefined ? { authorSurname } : {}),
  }
}
