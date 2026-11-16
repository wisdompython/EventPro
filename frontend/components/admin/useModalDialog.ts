'use client'

import { useEffect, type RefObject } from 'react'

/** Native modal dialogs keep background content inert and contain keyboard focus. */
export function useModalDialog(ref: RefObject<HTMLDialogElement | null>, open = true) {
  useEffect(() => {
    if (!open || !ref.current) return
    const dialog = ref.current
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog.showModal()
    return () => {
      dialog.close()
      if (opener?.isConnected) opener.focus()
    }
  }, [ref, open])
}
