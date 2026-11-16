import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useDialogFocus } from '../lib/dialogFocus'
import { useEscapeLayer } from '../lib/layers'
import type { ConfirmStep } from './ConfirmDialog'

/** Rendered on <body> above the phone nav, so the nav can never cover its buttons. */
export function ConfirmPanel({
  step,
  index,
  total,
  text,
  blocked,
  onText,
  onCancel,
  onConfirm,
}: {
  step: ConfirmStep
  index: number
  total: number
  text: string
  blocked: boolean
  onText: (value: string) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useDialogFocus(panelRef)
  useEscapeLayer(true, onCancel)
  // A later step brings its own field or Cancel into focus.
  useEffect(() => {
    if (index > 0) panelRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
  }, [index])

  return createPortal(
    <div className="fade-in fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0" aria-label="Cancel" tabIndex={-1} onClick={onCancel} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="sheet-in relative z-10 w-full max-w-md rounded-t-2xl bg-ledger p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl outline-none sm:rounded-2xl"
      >
        <p className="text-xs text-paper-3">
          Step {index + 1} of {total}
        </p>
        <h2 id={titleId} className="mt-1 text-lg font-semibold text-paper">
          {step.title}
        </h2>
        <p className="mt-2 text-sm text-paper-2">{step.body}</p>
        {step.requireText && (
          <label className="mt-3 block text-sm">
            <span className="text-paper-3">Type {step.requireText} to continue</span>
            <input
              value={text}
              onChange={(e) => onText(e.target.value)}
              data-autofocus
              className="mt-1 w-full rounded-xl border border-paper-3 bg-ledger-2 px-3 py-2"
              autoComplete="off"
            />
          </label>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            data-autofocus={step.requireText ? undefined : true}
            className="min-h-11 rounded-lg px-4 py-2 text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={blocked}
            onClick={onConfirm}
            className="min-h-11 rounded-full bg-rose-700 px-4 py-2 text-sm text-white disabled:opacity-40"
          >
            {step.confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
