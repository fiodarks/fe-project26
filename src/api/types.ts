export type PartialDate = string

export type HierarchyNode = {
  id: string
  name: string
  level: number
  description?: string
  parentId?: string | null
  children: HierarchyNode[]
}

export type HierarchyViewportPathItem = {
  id: string
  name: string
  level: string
}

export type HierarchyViewportStats = {
  points: number
}

export type HierarchyViewportNode = {
  id: string
  name: string
  level: string
  parentId: string | null
  hasChildren: boolean
  path?: HierarchyViewportPathItem[] | null
  stats?: HierarchyViewportStats | null
  extent?: [number, number, number, number] | null
}

export type HierarchyViewportTreeNode = HierarchyViewportNode & {
  children: HierarchyViewportTreeNode[]
}

export type HierarchyViewportPagination = {
  limit: number
  returned: number
  truncated: boolean
}

export type HierarchyViewportResponse = {
  level: string
  bbox: [number, number, number, number]
  root: HierarchyViewportTreeNode
  pagination: HierarchyViewportPagination
}

export type MaterialDTO = {
  id: string
  title: string
  location: string
  creationDate: PartialDate
  description: string
  hierarchyId: string
  ownerId?: string
  authorName?: string
  authorSurname?: string
  fileUrl?: string
  thumbnailUrl?: string
  metadata: Record<string, string>
  tags?: string[]
  createdAt: string
  updatedAt?: string

  /* Not in current OpenAPI MaterialDTO, but used by UI if your BE returns it later. */
  lat?: number
  lon?: number
  placeId?: string
}

export type MaterialPointPhotoDTO = {
  id: string
  title: string
  year: number | null
}

export type MaterialPointDTO = {
  lat: number
  lon: number
  title: string
  description: string | null
  photos: MaterialPointPhotoDTO[]
}

export type MaterialPointsResponse = {
  points: MaterialPointDTO[]
  totalPhotos: number
}

export type MaterialPreviewDTO = {
  id: string
  title: string
  year: number | null
  thumbnailUrl: string
  fileUrl?: string
}

export type MaterialPreviewsRequest = {
  ids: string[]
}

export type MaterialPreviewsResponse = {
  data: MaterialPreviewDTO[]
  notFoundIds?: string[]
}

export type Pagination = {
  page: number
  size: number
  totalElements: number
  totalPages: number
}

export type MaterialListResponse = {
  pagination: Pagination
  data: MaterialDTO[]
}

export type UpdateMaterialCommand = {
  title: string
  location: string
  creationDate: PartialDate
  description: string
  hierarchyId: string
  metadata?: Record<string, string>
  tags?: string[]
}

export type BlockUserCommand = {
  reason: string
  blockedUntil: string
}

export type UserRole = 'VIEWER' | 'CREATOR' | 'ADMIN'

export type SetUserRolesCommand = {
  roles: UserRole[]
}

export type UserAdminSummaryDTO = {
  userId: string
  email?: string | null
  name?: string | null
  surname?: string | null
  roles: UserRole[]
  blockedUntil?: string | null
  blockedReason?: string | null
  createdAt?: string | null
  lastLoginAt?: string | null
  materialsCount?: number | null
  lastMaterialCreatedAt?: string | null
}

export type UsersPageResponse = {
  items: UserAdminSummaryDTO[]
  pagination: Pagination
}

export type UserAdminDetailsResponse = {
  userId: string
  roles: UserRole[]
  blockedUntil?: string | null
  blockedReason?: string | null
  createdAt?: string | null
  lastLoginAt?: string | null
  materialsCount?: number | null
  lastMaterialCreatedAt?: string | null
  lastModerationAt?: string | null
  strikesCount?: number | null
}

export type AuditAction =
  | 'USER_BLOCKED'
  | 'USER_UNBLOCKED'
  | 'USER_ROLES_CHANGED'
  | 'MATERIAL_UPDATED'
  | 'MATERIAL_DELETED'

export type AuditEventDTO = {
  id: string
  at: string
  action: AuditAction
  actorUserId: string
  targetUserId?: string | null
  materialId?: string | null
  reason?: string | null
  details?: Record<string, string> | null
}

export type AuditEventsPageResponse = {
  items: AuditEventDTO[]
  pagination: Pagination
}

export type GoogleAuthorizationUrlResponse = {
  authorizationUrl: string
}

export type GoogleCallbackTokenResponse = {
  accessToken: string
  tokenType: string
  expiresInSeconds: number
}

export type TokenResponse = {
  accessToken: string
  tokenType: string
  expiresInSeconds: number
  userId: string
  roles: string[]
}

export type LoginRequest = {
  email: string
  password: string
}

export type RegisterRequest = {
  email: string
  name: string
  surname: string
  password: string
}
