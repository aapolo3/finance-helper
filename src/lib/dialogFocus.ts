import { useEffect, useState, type RefObject } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function focusables(root: HTMLElement) {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (element) => element.getClientRects().length > 0,
  )
}

/**
 * Modal focus for a dialog panel: moves focus in on open (to `[data-autofocus]`, an
 * element that already took focus, or the panel itself), keeps Tab inside, and hands
 * focus back to whatever opened it on close. The panel needs `tabIndex={-1}`.
 */
export function useDialogFocus(ref: RefObject<HTMLElement | null>) {
  // Read during the first render, before an autoFocus field inside takes focus.
  const [opener] = useState(() =>
    typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  )
  useEffect(() => {
    const panel = ref.current
    if (!panel) return
    if (!panel.contains(document.activeElement)) {
      const preferred = panel.querySelector<HTMLElement>('[data-autofocus]')
      ;(preferred ?? panel).focus({ preventScroll: true })
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const items = focusables(panel)
      if (items.length === 0) {
        event.preventDefault()
        panel.focus({ preventScroll: true })
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    panel.addEventListener('keydown', onKey)
    return () => {
      panel.removeEventListener('keydown', onKey)
      if (opener && opener.isConnected) opener.focus({ preventScroll: true })
    }
  }, [ref, opener])
}
