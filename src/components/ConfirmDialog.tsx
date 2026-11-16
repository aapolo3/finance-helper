import { useCallback, useRef, useState, type ReactNode } from 'react'
import { ConfirmPanel } from './ConfirmPanel'

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
    // One panel across steps, so focus returns to the original opener at the end.
    <ConfirmPanel
      step={step}
      index={index}
      total={steps?.length ?? 1}
      text={text}
      blocked={blocked}
      onText={setText}
      onCancel={() => close(false)}
      onConfirm={() => {
        if (blocked || !steps) return
        if (index < steps.length - 1) {
          setIndex(index + 1)
          setText('')
          return
        }
        close(true)
      }}
    />
  ) : null

  return { ask, dialog }
}
