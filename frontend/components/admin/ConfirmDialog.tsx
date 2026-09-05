'use client'

import { useEffect, useRef } from 'react'

/**
 * In-app confirmation for destructive actions.
 *
 * window.confirm() renders unstyled browser chrome that reads as a different
 * product, so anything the planner could regret asks here instead.
 *
 * Usage: hold a request in state and render the dialog when it is set.
 *
 *   const [ask, setAsk] = useState<ConfirmRequest | null>(null)
 *   ...
 *   {ask && <ConfirmDialog {...ask} onCancel={() => setAsk(null)} />}
 */
export interface ConfirmRequest {
  title: string
  body?: string
  /** Label for the confirming button. Say what will happen, not "OK". */
  confirmLabel?: string
  cancelLabel?: string
  /** Destructive actions get the danger styling; set false for neutral ones. */
  destructive?: boolean
  onConfirm: () => void
}

interface Props extends ConfirmRequest {
  onCancel: () => void
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = true,
  onConfirm,
  onCancel,
}: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  // Focus the confirming button so the dialog is keyboard-usable immediately,
  // and close on Escape from anywhere.
  useEffect(() => {
    confirmRef.current?.focus()
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      className="admin-confirm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-confirm-title"
      onPointerDown={(event) => {
        // A click on the backdrop dismisses, the same as Cancel.
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <div className="admin-confirm__panel">
        <h2 id="admin-confirm-title">{title}</h2>
        {body && <p>{body}</p>}
        <div className="admin-confirm__actions">
          <button type="button" className="admin-secondary-action" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={destructive ? 'admin-danger-action' : 'admin-primary-action'}
            onClick={() => { onConfirm(); onCancel() }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmDialog
