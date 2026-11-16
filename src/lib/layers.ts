import { useEffect, useRef } from 'react'

/**
 * Open overlays (sheets, dialogs, menus) register here in the order they open, and one
 * Escape closes only the newest. Without this every overlay listened on its own and a
 * single Escape closed them all at once.
 */
export function createLayerStack() {
  const stack: { onEscape: () => void }[] = []
  return {
    push(onEscape: () => void) {
      const entry = { onEscape }
      stack.push(entry)
      return () => {
        const index = stack.indexOf(entry)
        if (index >= 0) stack.splice(index, 1)
      }
    },
    /** Closes the newest layer. Returns false when nothing is open. */
    escape() {
      const top = stack.at(-1)
      if (!top) return false
      top.onEscape()
      return true
    },
    get size() {
      return stack.length
    },
  }
}

const layers = createLayerStack()
let listening = false

function listen() {
  if (listening || typeof document === 'undefined') return
  listening = true
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return
    if (layers.escape()) event.preventDefault()
  })
}

/** While `active`, Escape calls `onEscape` if this is the newest open layer. */
export function useEscapeLayer(active: boolean, onEscape: () => void) {
  const latest = useRef(onEscape)
  useEffect(() => {
    latest.current = onEscape
  })
  useEffect(() => {
    if (!active) return
    listen()
    return layers.push(() => latest.current())
  }, [active])
}
