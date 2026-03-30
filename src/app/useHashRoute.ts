import { useEffect, useState } from 'react'

export type RouteId = 'map' | 'admin'

function parseHash(hash: string): RouteId {
  const h = hash.replace(/^#/, '')
  if (h === '/admin' || h === 'admin' || h.startsWith('/admin')) return 'admin'
  return 'map'
}

export function useHashRoute(): [RouteId, (r: RouteId) => void] {
  const [route, setRouteState] = useState<RouteId>(() =>
    parseHash(window.location.hash),
  )

  useEffect(() => {
    const onChange = () => setRouteState(parseHash(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  const setRoute = (r: RouteId) => {
    window.location.hash = r === 'admin' ? '#/admin' : '#/'
    setRouteState(r)
  }

  return [route, setRoute]
}

