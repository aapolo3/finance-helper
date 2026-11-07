import { APPEARANCES, setAppearance, useAppearance } from '../lib/appearance'

/** Light / Dark / System segmented control. Only changes this device. */
export function AppearanceSwitch({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const appearance = useAppearance()
  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      className="flex gap-0.5 rounded-[10px] bg-ledger-3 p-[3px] ring-1 ring-rule"
    >
      {APPEARANCES.map((option) => {
        const selected = appearance === option.value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setAppearance(option.value)}
            className={`press flex-1 rounded-[7px] px-2.5 ${size === 'sm' ? 'min-h-8 text-xs' : 'min-h-9 text-sm'} ${
              selected
                ? 'bg-ledger font-medium text-paper shadow-[0_1px_2px_rgb(0_0_0/0.08)] ring-1 ring-rule night:bg-ledger-4'
                : 'text-paper-2 hover:text-paper'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
