export function apiBaseUrl(): string {
  const raw =
    (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
    'http://localhost:8080/api/v1'
  return raw.replace(/\/+$/, '')
}
