import { useCallback, useRef, useState, type ReactNode } from 'react'

export type ConfirmStep = {
  title: string
  body: string
  confirmLabel: string
  requireText?: string
}

export function useConfirmFlow() {
  const [steps, setSteps] = useState<ConfirmStep[] | null>(null)
  const [index, setIndex] = useState(0)
  const [text, setText] = useState('')
  const resolver = useRef<((ok: boolean) => void) | null>(null)

  const ask = useCallback((next: ConfirmStep[]) => {
    setSteps(next)
    setIndex(0)
    setText('')
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const close = (ok: boolean) => {
    resolver.current?.(ok)
    resolver.current = null
    setSteps(null)
    setText('')
    setIndex(0)
  }

  const step = steps?.[index]
  const blocked = Boolean(step?.requireText && text.trim() !== step.requireText)

  const dialog: ReactNode = step ? (
    <div className="fade-in fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Cancel"
        onClick={() => close(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        key={index}
        className="sheet-in relative z-10 w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl dark:bg-zinc-900 sm:rounded-2xl"
      >
        <p className="text-xs text-zinc-500">
          Step {index + 1} of {steps?.length}
        </p>
        <h2 className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          {step.title}
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{step.body}</p>
        {step.requireText && (
          <label className="mt-3 block text-sm">
            <span className="text-zinc-500">Type {step.requireText} to continue</span>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              autoComplete="off"
            />
          </label>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => close(false)}
            className="min-h-11 rounded-lg px-4 py-2 text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={blocked}
            onClick={() => {
              if (blocked || !steps) return
              if (index < steps.length - 1) {
                setIndex(index + 1)
                setText('')
                return
              }
              close(true)
            }}
            className="min-h-11 rounded-full bg-rose-700 px-4 py-2 text-sm text-white disabled:opacity-40"
          >
            {step.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  ) : null

  return { ask, dialog }
}
