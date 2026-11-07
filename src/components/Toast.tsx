import { useEffect, type ReactNode } from 'react'

/** Bottom toast with one action. Clears itself after `timeoutMs`; sits above the phone nav. */
export function Toast({
  children,
  actionLabel,
  onAction,
  onDone,
  timeoutMs = 10000,
}: {
  children: ReactNode
  actionLabel: string
  onAction: () => void
  onDone: () => void
  timeoutMs?: number
}) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, timeoutMs)
    return () => window.clearTimeout(timer)
  }, [onDone, timeoutMs])

  return (
    <div
      role="status"
      className="toast-in fixed inset-x-4 z-40 flex items-center justify-between gap-3 rounded-xl bg-ledger-4 px-4 py-2 text-sm text-paper shadow-lg ring-1 ring-rule-strong bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] md:inset-x-auto md:right-6 md:bottom-6 md:min-w-80"
    >
      <span>{children}</span>
      <button
        type="button"
        className="press min-h-11 rounded-lg px-3 font-medium text-cash hover:bg-ledger-3"
        onClick={onAction}
      >
        {actionLabel}
      </button>
    </div>
  )
}
