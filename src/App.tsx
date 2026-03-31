import './App.css'
import { useEffect, useMemo, useState } from 'react'
import { AdminPage } from './pages/AdminPage'
import { MapPage } from './pages/MapPage'
import { useHashRoute } from './app/useHashRoute'
import { loadTheme, type Theme, themeLabel } from './app/theme'
import {
  bumpLastLoginAt,
  clearSession,
  decodeRolesFromToken,
  loadSession,
  saveSession,
  type Session,
} from './auth/session'
import { authGoogleCallback, authGoogleLogin } from './api/archiveApi'
import { SignInModal } from './auth/SignInModal'

function App() {
  const [route, setRoute] = useHashRoute()
  const [theme, setTheme] = useState<Theme>(() => loadTheme())
  const [session, setSession] = useState<Session>(() => loadSession())
  const [toast, setToast] = useState<string | null>(null)
  const [signInOpen, setSignInOpen] = useState(false)

  const redirectHome = () => {
    const base = (import.meta.env.BASE_URL as string | undefined) ?? '/'
    window.location.replace(`${base}#/`)
  }

  const roles = useMemo(
    () => decodeRolesFromToken(session.accessToken),
    [session.accessToken],
  )

  const startGoogleLogin = async () => {
    const { authorizationUrl } = await authGoogleLogin()
    if (!authorizationUrl) throw new Error('Missing authorizationUrl from API')
    window.location.assign(authorizationUrl)
  }

  useEffect(() => {
    document.body.dataset.theme = theme
    window.localStorage.setItem('dsa_theme', theme)
  }, [theme])

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 5500)
    return () => window.clearTimeout(id)
  }, [toast])

  useEffect(() => {
    const msg = window.sessionStorage.getItem('dsa_post_login_toast')
    if (!msg) return
    window.sessionStorage.removeItem('dsa_post_login_toast')
    setToast(msg)
  }, [])

  useEffect(() => {
    const token = session.accessToken
    if (!token) {
      window.sessionStorage.removeItem('dsa_prev_login_at')
      window.sessionStorage.removeItem('dsa_current_login_at')
      window.sessionStorage.removeItem('dsa_last_bumped_token')
      return
    }

    const lastBumpedToken = window.sessionStorage.getItem('dsa_last_bumped_token')
    if (lastBumpedToken === token) return
    window.sessionStorage.setItem('dsa_last_bumped_token', token)

    const { previousLoginAt, currentLoginAt } = bumpLastLoginAt(token)
    window.sessionStorage.setItem('dsa_prev_login_at', previousLoginAt ?? '')
    window.sessionStorage.setItem('dsa_current_login_at', currentLoginAt ?? '')
  }, [session.accessToken])

  useEffect(() => {
    const normalized = window.location.pathname.replace(/\/+$/, '')
    if (normalized !== '/api/v1/auth/google/callback') return

    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const state = params.get('state')

    if (!code || !state) {
      window.sessionStorage.setItem(
        'dsa_post_login_toast',
        'Google login failed: missing code/state',
      )
      redirectHome()
      return
    }

    ;(async () => {
      try {
        const query = Object.fromEntries(params.entries())
        const res = await authGoogleCallback(query)
        if (!res.accessToken) throw new Error('Missing accessToken in response')
        window.localStorage.setItem('dsa_access_token', res.accessToken)
        window.sessionStorage.setItem('dsa_post_login_toast', 'Signed in with Google')
      } catch (e) {
      } finally {
        redirectHome()
      }
    })()
  }, [])

  return (
    <div className="appShell">
      <header className="appHeader">
        <div className="brand">
          <h1>Digital Community Archive</h1>
          <span className="badge">Project 26</span>
        </div>

        <div className="headerActions">
          <label className="srOnly" htmlFor="themeSelect">
            Theme
          </label>
          <select
            id="themeSelect"
            className="select"
            value={theme}
            onChange={(e) => setTheme(e.target.value as Theme)}
          >
            <option value="light">{themeLabel('light')}</option>
            <option value="dark">{themeLabel('dark')}</option>
            <option value="contrast">{themeLabel('contrast')}</option>
          </select>

          {roles.has('admin') && (
            <button
              className="btn"
              onClick={() => setRoute(route === 'admin' ? 'map' : 'admin')}
              aria-current={route === 'admin' ? 'page' : undefined}
            >
              {route === 'admin' ? 'Back to map' : 'Admin'}
            </button>
          )}

          {session.accessToken ? (
            <>
              <span className="pill" title="JWT in local storage">
                Signed in ({Array.from(roles).join(', ') || 'unknown role'})
              </span>
              <button
                className="btn"
                onClick={() => {
                  clearSession()
                  setSession(loadSession())
                  setToast('Signed out')
                  redirectHome()
                }}
              >
                Sign out
              </button>
            </>
          ) : (
            <button
              className="btn btnPrimary"
              onClick={() => setSignInOpen(true)}
            >
              Sign in
            </button>
          )}
        </div>
      </header>

      <main className="main">
        {route === 'admin' ? (
          <AdminPage
            session={session}
            roles={roles}
            onToast={setToast}
            onNeedLogin={() => setSignInOpen(true)}
          />
        ) : (
          <MapPage
            session={session}
            roles={roles}
            onToast={setToast}
            onNeedLogin={() => setSignInOpen(true)}
          />
        )}

        <SignInModal
          open={signInOpen}
          onClose={() => setSignInOpen(false)}
          onStartGoogle={startGoogleLogin}
          onSignedIn={(accessToken, label) => {
            saveSession(accessToken)
            setSession(loadSession())
            setToast(label)
          }}
        />

        <div className="toastRegion" aria-live="polite" aria-atomic="true">
          {toast && <div className="toast">{toast}</div>}
        </div>
      </main>
    </div>
  )
}

export default App
