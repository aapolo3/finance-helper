import { PALETTES, usePalette } from '../lib/palette'
import { choosePalette } from '../storage/paletteSync'

function Swatch({ colors }: { colors: readonly [string, string, string] }) {
  const [ground, text, cash] = colors
  return (
    <span
      className="flex h-7 flex-1 items-center justify-center gap-1 rounded-md ring-1 ring-rule"
      style={{ backgroundColor: ground }}
      aria-hidden
    >
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: text }} />
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: cash }} />
    </span>
  )
}

/** Each palette has a light and a dark side; the Appearance setting picks between them. */
export function PalettePicker() {
  const palette = usePalette()
  return (
    <div role="radiogroup" aria-label="Color palette" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {PALETTES.map((option) => {
        const selected = palette === option.id
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => choosePalette(option.id)}
            className={`press flex min-h-11 flex-col gap-2 rounded-xl p-2.5 text-left text-sm ${
              selected
                ? 'bg-ledger-4 font-medium text-paper ring-2 ring-paper'
                : 'bg-ledger-2 text-paper-2 ring-1 ring-rule-strong hover:text-paper'
            }`}
          >
            <span className="flex gap-1">
              <Swatch colors={option.light} />
              <Swatch colors={option.dark} />
            </span>
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
