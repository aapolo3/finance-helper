type ToggleProps = {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  /** `sm` is for dense list rows; the hit area stays 44px tall. */
  size?: 'md' | 'sm'
}

export function Toggle({ checked, onChange, label, size = 'md' }: ToggleProps) {
  const small = size === 'sm'
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={small ? 'flex h-11 shrink-0 items-center px-1' : 'shrink-0'}
    >
      <span
        className={`relative block rounded-full transition-colors duration-200 ease-out ${
          small ? 'h-6 w-10' : 'h-8 w-14'
        } ${checked ? 'bg-emerald-600' : 'bg-zinc-400 dark:bg-zinc-600'}`}
      >
        <span
          className={`absolute rounded-full bg-white shadow-sm transition-transform duration-200 ease-out ${
            small ? 'top-0.5 left-0.5 h-5 w-5' : 'top-1 left-1 h-6 w-6'
          } ${checked ? (small ? 'translate-x-4' : 'translate-x-6') : 'translate-x-0'}`}
        />
      </span>
    </button>
  )
}
