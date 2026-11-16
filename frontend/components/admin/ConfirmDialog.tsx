'use client'

import { useId, useRef } from 'react'
import { useModalDialog } from './useModalDialog'

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
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  useModalDialog(dialogRef)

  return (
    <dialog
      ref={dialogRef}
      className="admin-confirm"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={body ? descriptionId : undefined}
      onCancel={(event) => { event.preventDefault(); onCancel() }}
      onPointerDown={(event) => {
        // A click on the backdrop dismisses, the same as Cancel.
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <div className="admin-confirm__panel">
        <h2 id={titleId}>{title}</h2>
        {body && <p id={descriptionId}>{body}</p>}
        <div className="admin-confirm__actions">
          <button autoFocus type="button" className="admin-secondary-action" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={destructive ? 'admin-danger-action' : 'admin-primary-action'}
            onClick={() => { onConfirm(); onCancel() }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  )
}

export default ConfirmDialog
