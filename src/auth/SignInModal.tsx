import { useEffect, useMemo, useState } from 'react'
import { ApiError } from '../api/http'
import { authLogin, authRegister, type LoginRequest, type RegisterRequest } from '../api/archiveApi'
import { Modal } from '../ui/Modal'

type Mode = 'login' | 'register'

function toErrorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const fromBody = apiErrorBodyMessage(e.body)
    if (fromBody) return fromBody
    if (e.status === 401) return 'Invalid email or password'
    if (e.status === 400) return 'Invalid input'
    return `Request failed (${e.status})`
  }
  return e instanceof Error ? e.message : 'Something went wrong'
}

function apiErrorBodyMessage(body: unknown): string | null {
  if (!body) return null
  if (typeof body === 'string') return body
  if (typeof body !== 'object') return null
  const obj = body as Record<string, unknown>
  const msg =
    (typeof obj.message === 'string' && obj.message.trim()) ||
    (typeof obj.error === 'string' && obj.error.trim()) ||
    (typeof obj.detail === 'string' && obj.detail.trim())
  if (msg) return msg
  const errors = obj.errors
  if (Array.isArray(errors)) {
    const first = errors.find((x) => typeof x === 'string' && x.trim())
    if (typeof first === 'string') return first
  }
  return null
}

function GoogleIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.55 0 6.2 1.54 7.63 2.83l5.55-5.55C33.8 3.84 29.28 2 24 2 14.62 2 6.51 7.38 2.56 15.19l6.46 5.01C11.03 13.44 17.06 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46 24.5c0-1.6-.14-2.77-.45-3.98H24v7.53h12.8c-.26 2.04-1.67 5.11-4.8 7.16l7.33 5.69C43.56 43.99 46 35.41 46 24.5z"
      />
      <path
        fill="#FBBC05"
        d="M9.02 28.2c-.5-1.5-.8-3.1-.8-4.7s.29-3.2.79-4.7l-6.46-5.01C1.3 16.2 0 20.2 0 23.5c0 3.3 1.3 7.3 2.55 9.71l6.47-5.01z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.28 0 9.72-1.74 12.96-4.74l-7.33-5.69c-1.96 1.37-4.6 2.33-7.63 2.33-6.94 0-12.97-3.94-14.98-9.7l-6.47 5.01C6.51 40.62 14.62 46 24 46z"
      />
    </svg>
  )
}

export function SignInModal({
  open,
  onClose,
  onStartGoogle,
  onSignedIn,
}: {
  open: boolean
  onClose: () => void
  onStartGoogle: () => Promise<void> | void
  onSignedIn: (accessToken: string, label: string) => void
}) {
  const [mode, setMode] = useState<Mode>('login')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [surname, setSurname] = useState('')

  const canSubmit = useMemo(() => {
    if (!email.trim() || !password.trim()) return false
    if (mode === 'register' && (!name.trim() || !surname.trim())) return false
    return true
  }, [email, password, name, surname, mode])

  useEffect(() => {
    if (!open) return
    setError(null)
    setBusy(false)
  }, [open])

  const submit = async () => {
    if (!canSubmit || busy) return
    setBusy(true)
    setError(null)
    try {
      if (mode === 'login') {
        const req: LoginRequest = { email: email.trim(), password: password.trim() }
        const res = await authLogin(req)
        if (!res.accessToken) throw new Error('Missing accessToken in response')
        onSignedIn(res.accessToken, 'Signed in')
        onClose()
        return
      }
      const req: RegisterRequest = {
        email: email.trim(),
        password: password.trim(),
        name: name.trim(),
        surname: surname.trim(),
      }
      const res = await authRegister(req)
      if (!res.accessToken) throw new Error('Missing accessToken in response')
      onSignedIn(res.accessToken, 'Account created')
      onClose()
    } catch (e) {
      setError(toErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} title={mode === 'login' ? 'Sign in' : 'Register'} onClose={onClose} width={460}>
      <button
        className="btn btnGoogle"
        disabled={busy}
        onClick={async () => {
          try {
            setError(null)
            await onStartGoogle()
          } catch (e) {
            setError(toErrorMessage(e))
          }
        }}
      >
        <GoogleIcon />
        Continue with Google
      </button>

      <div className="authDivider" role="separator" aria-label="or" />

      <div className="authMode">
        <button
          className={mode === 'login' ? 'btn authModeBtn authModeBtnActive' : 'btn authModeBtn'}
          onClick={() => setMode('login')}
          disabled={busy}
        >
          Sign in
        </button>
        <button
          className={mode === 'register' ? 'btn authModeBtn authModeBtnActive' : 'btn authModeBtn'}
          onClick={() => setMode('register')}
          disabled={busy}
        >
          Register
        </button>
      </div>

      <form
        className="authForm"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <label className="authField">
          <span>Email</span>
          <input
            className="input"
            inputMode="email"
            autoComplete="email"
            placeholder="user@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
            required
          />
        </label>

        {mode === 'register' && (
          <div className="authGrid2">
            <label className="authField">
              <span>Name</span>
              <input
                className="input"
                autoComplete="given-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={busy}
                required
              />
            </label>
            <label className="authField">
              <span>Surname</span>
              <input
                className="input"
                autoComplete="family-name"
                value={surname}
                onChange={(e) => setSurname(e.target.value)}
                disabled={busy}
                required
              />
            </label>
          </div>
        )}

        <label className="authField">
          <span>Password</span>
          <input
            className="input"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            required
          />
        </label>

        {error && (
          <div className="authError" role="alert">
            {error}
          </div>
        )}

        <button className="btn btnPrimary" type="submit" disabled={!canSubmit || busy}>
          {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <div className="authHint">
        {mode === 'login' ? (
          <span>
            No account?{' '}
            <button className="btn authLinkBtn" onClick={() => setMode('register')} disabled={busy}>
              Register
            </button>
          </span>
        ) : (
          <span>
            Already have an account?{' '}
            <button className="btn authLinkBtn" onClick={() => setMode('login')} disabled={busy}>
              Sign in
            </button>
          </span>
        )}
      </div>
    </Modal>
  )
}

