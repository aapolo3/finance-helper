import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export type MenuAction = {
  label: string
  onSelect: () => void
  danger?: boolean
  icon?: ReactNode
}

/** A "⋯" button with a small pop-in menu. Danger actions sit below a divider. */
export function ActionMenu({ label, actions }: { label: string; actions: MenuAction[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState<{ top: number; right: number } | null>(null)

  // The menu renders in a portal so later rows (each its own stacking context from the
  // stagger animation) can't paint over it.
  useLayoutEffect(() => {
    if (!open) return
    const update = () => {
      const rect = ref.current?.getBoundingClientRect()
      if (!rect) return
      const menuHeight = menuRef.current?.offsetHeight ?? 140
      const below = rect.bottom + 4
      const top = below + menuHeight > window.innerHeight - 8 ? rect.top - menuHeight - 4 : below
      setPlace({ top, right: window.innerWidth - rect.right })
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const onPointer = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        (ref.current?.contains(event.target) || menuRef.current?.contains(event.target))
      )
        return
      setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open])

  const safe = actions.filter((action) => !action.danger)
  const danger = actions.filter((action) => action.danger)

  const item = (action: MenuAction) => (
    <button
      key={action.label}
      type="button"
      role="menuitem"
      onClick={() => {
        setOpen(false)
        action.onSelect()
      }}
      className={`flex min-h-10 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm hover:bg-black/5 dark:hover:bg-rule ${
        action.danger ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-800 dark:text-zinc-100'
      }`}
    >
      {action.icon}
      {action.label}
    </button>
  )

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={`flex h-11 w-9 items-center justify-center rounded-lg text-zinc-500 hover:bg-black/5 hover:text-zinc-900 dark:hover:bg-rule dark:hover:text-zinc-100 ${
          open ? 'bg-black/5 text-zinc-900 dark:bg-rule dark:text-zinc-100' : ''
        }`}
      >
        <DotsIcon />
      </button>
      {open &&
        createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{ top: place?.top ?? -9999, right: place?.right ?? 0 }}
          className="pop-in fixed z-50 w-48 rounded-xl bg-white p-1 shadow-2xl ring-1 ring-zinc-200 dark:bg-ledger-4 dark:ring-rule-strong"
        >
          {safe.map(item)}
          {danger.length > 0 && safe.length > 0 && (
            <div className="my-1 h-px bg-zinc-200 dark:bg-rule-strong" />
          )}
          {danger.map(item)}
        </div>,
          document.body,
        )}
    </div>
  )
}

function DotsIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <circle cx="4.5" cy="10" r="1.5" />
      <circle cx="10" cy="10" r="1.5" />
      <circle cx="15.5" cy="10" r="1.5" />
    </svg>
  )
}

export function EditIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 opacity-70" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M13.5 3.5 16.5 6.5 7 16H4v-3z" strokeLinejoin="round" />
    </svg>
  )
}

export function CopyIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 opacity-70" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="7" y="7" width="9" height="9" rx="2" />
      <path d="M13 7V5.5A1.5 1.5 0 0 0 11.5 4h-6A1.5 1.5 0 0 0 4 5.5v6A1.5 1.5 0 0 0 5.5 13H7" />
    </svg>
  )
}

export function TrashIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M4 6h12M8 6V4.5h4V6M6 6l.7 9.5h6.6L14 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
