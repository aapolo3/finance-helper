import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

const EXIT_MS = 220

/** Bottom sheet that scrolls its own body and keeps Save reachable on mobile. */
export function Sheet({
  title,
  onClose,
  mobileActions,
  children,
}: {
  title: string
  onClose: () => void
  /** Shown beside the title below the `sm` breakpoint. */
  mobileActions?: ReactNode
  children: ReactNode
}) {
  const [closing, setClosing] = useState(false)
  const closeTimer = useRef<number | null>(null)
  // Play the exit animation, then let the parent unmount the sheet.
  const requestClose = useCallback(() => {
    if (closeTimer.current != null) return
    setClosing(true)
    closeTimer.current = window.setTimeout(onClose, EXIT_MS)
  }, [onClose])

  useEffect(
    () => () => {
      if (closeTimer.current != null) window.clearTimeout(closeTimer.current)
    },
    [],
  )

  useEffect(() => {
    const html = document.documentElement
    const body = document.body
    const scrollY = window.scrollY
    const previous = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyLeft: body.style.left,
      bodyRight: body.style.right,
      bodyWidth: body.style.width,
    }
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.left = '0'
    body.style.right = '0'
    body.style.width = '100%'
    return () => {
      html.style.overflow = previous.htmlOverflow
      body.style.overflow = previous.bodyOverflow
      body.style.position = previous.bodyPosition
      body.style.top = previous.bodyTop
      body.style.left = previous.bodyLeft
      body.style.right = previous.bodyRight
      body.style.width = previous.bodyWidth
      window.scrollTo(0, scrollY)
    }
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') requestClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [requestClose])

  // iOS keeps the layout viewport tall under the keyboard, so fit the sheet to what is visible.
  const overlayRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const viewport = window.visualViewport
    const overlay = overlayRef.current
    if (!viewport || !overlay || !window.matchMedia('(pointer: coarse)').matches) return
    const fit = () => {
      // A person's own pinch zoom is theirs: leave the sheet full size.
      const zoomed = viewport.scale > 1.01
      overlay.style.top = zoomed ? '' : `${viewport.offsetTop}px`
      overlay.style.bottom = zoomed ? '' : 'auto'
      overlay.style.height = zoomed ? '' : `${viewport.height}px`
    }
    fit()
    viewport.addEventListener('resize', fit)
    viewport.addEventListener('scroll', fit)
    return () => {
      viewport.removeEventListener('resize', fit)
      viewport.removeEventListener('scroll', fit)
    }
  }, [])

  return (
    <div ref={overlayRef} className={`${closing ? 'fade-out' : 'fade-in'} fixed inset-0 z-50 bg-black/40 sm:flex sm:items-center sm:justify-center sm:p-4`}>
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Close"
        onClick={requestClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`${closing ? 'sheet-out' : 'sheet-in'} relative z-10 grid h-full w-full grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-white dark:bg-zinc-900 sm:h-auto sm:max-h-[min(90dvh,100%)] sm:max-w-md sm:rounded-2xl`}
      >
        <div className="flex items-center justify-between gap-3 px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-1">
          <h2 className="font-display text-xl tracking-[-0.01em] text-paper">
            {title}
          </h2>
          {mobileActions ? (
            <div className="flex shrink-0 items-center gap-1 md:hidden">{mobileActions}</div>
          ) : null}
        </div>
        {children}
      </div>
    </div>
  )
}

export const sheetFormClass =
  'grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] overflow-hidden'
export const sheetBodyClass =
  'min-h-0 touch-pan-y space-y-3 overflow-y-auto overscroll-contain px-5 py-3'
export const sheetFooterClass =
  'flex justify-end gap-2 border-t border-zinc-200 bg-white px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-zinc-800 dark:bg-zinc-900'

/** Check and X for mobile editors. Desktop keeps the footer buttons. */
export function MobileFormActions({
  formId,
  onClose,
}: {
  formId: string
  onClose: () => void
}) {
  return (
    <>
      <button
        type="button"
        onClick={onClose}
        aria-label="Cancel"
        className="flex h-11 w-11 items-center justify-center rounded-full text-zinc-700 dark:text-zinc-200"
      >
        <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden="true">
          <path
            d="M5 5l10 10M15 5L5 15"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      </button>
      <button
        type="submit"
        form={formId}
        aria-label="Save"
        className="flex h-11 w-11 items-center justify-center rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-medium"
      >
        <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden="true">
          <path
            d="M4.5 10.5l3.5 3.5 7.5-8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </>
  )
}
