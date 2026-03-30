import { type ReactNode, useEffect, useId, useRef } from 'react'

export function Modal({
  open,
  title,
  onClose,
  children,
  width = 420,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  width?: number
}) {
  const titleId = useId()
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
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 4000,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal={true}
        aria-labelledby={titleId}
        style={{
          width: `min(${width}px, 92vw)`,
          maxHeight: 'min(86vh, 820px)',
          border: '1px solid var(--border)',
          background: 'var(--surface-2)',
          borderRadius: 14,
          boxShadow: 'var(--shadow)',
          overflow: 'hidden',
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
          <div id={titleId} style={{ fontWeight: 650 }}>
            {title}
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
