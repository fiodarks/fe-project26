import { type ReactNode, useEffect, useId, useRef } from 'react'

type Side = 'left' | 'right' | 'bottom'

export function Drawer({
  open,
  side,
  title,
  onClose,
  children,
  modal = false,
}: {
  open: boolean
  side: Side
  title: string
  onClose: () => void
  children: ReactNode
  modal?: boolean
}) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const closeBtnRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    closeBtnRef.current?.focus()
  }, [open])

  if (!open) return null

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: modal ? 'rgba(0,0,0,0.35)' : 'transparent',
        display: 'flex',
        justifyContent:
          side === 'left'
            ? 'flex-start'
            : side === 'right'
              ? 'flex-end'
              : 'center',
        alignItems: side === 'bottom' ? 'flex-end' : 'stretch',
        zIndex: 3000,
        pointerEvents: modal ? 'auto' : 'none',
      }}
      onMouseDown={(e) => {
        if (!modal) return
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal={modal ? true : undefined}
        aria-labelledby={titleId}
        style={{
          pointerEvents: 'auto',
          width: side === 'bottom' ? 'min(980px, 100%)' : 'min(420px, 92vw)',
          height: side === 'bottom' ? 'min(78vh, 720px)' : '100%',
          borderLeft:
            side === 'right' ? '1px solid var(--border)' : undefined,
          borderRight:
            side === 'left' ? '1px solid var(--border)' : undefined,
          borderTop: side === 'bottom' ? '1px solid var(--border)' : undefined,
          background: 'var(--surface-2)',
          boxShadow: 'var(--shadow)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            padding: '10px 12px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--surface)',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div id={titleId} style={{ fontWeight: 650 }}>
              {title}
            </div>
          </div>
          <button ref={closeBtnRef} className="btn" onClick={onClose}>
            Close
          </button>
        </div>
        <div
          style={{
            padding: 12,
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
