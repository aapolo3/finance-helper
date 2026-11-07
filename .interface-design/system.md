# Flow design system: Runway ledger

## Direction
A calm paper register, light by default, with light, dark, and system appearance. The person is checking whether they'll make it to the next
paycheck, on a phone between classes or at a desk in the evening. One question leads
every screen: how much is safe to spend before payday. Monarch-style structure
(sidebar, focused pages) with an Origin-style single confident number.

## Tokens (src/index.css @theme)
Values below are the default Paper palette in light. `:root[data-theme='dark']` swaps them for dark, and `:root[data-palette='<id>']` overrides them for the eight palettes listed in `src/lib/palette.ts`.
- Surfaces: ink #f3f0e8 (canvas), ledger #ffffff, ledger-2 #fbf9f4, ledger-3 #ece8de, ledger-4 #e3ded1
- Rules: rule (ink at 8%), rule-strong (16%)
- Text: paper #1b1d1b, paper-2 #434843, paper-3 #525752
- Meaning only: cash #1f6b46 (in / safe), copper #8f4d22 (filling / goals), due #705800 (due soon), over #a5303b (overspent)
- Legacy zinc utilities are remapped onto these inside `.flow-app`.

## Type
- Display: Newsreader, for page titles (28px) and hero figures (44–52px), tracking -0.02em
- Body: IBM Plex Sans, 14px base, ratio 1.25 (11 / 14 / 16 / 18 / 22 / 28 / 44 / 52)
- Amounts and dates: IBM Plex Mono, tabular (`.money`, `<Money>`)
- Labels: sentence case, 12px / 500 / paper-3. No caps eyebrows.

## Depth, spacing, radius
- Borders only (inset rule ring); no drop shadows except popovers
- 4px base; panels pad 16–20px
- Radius: controls 8px, panels 12px, sheets 16px

## Components (src/components/ui.tsx)
- Panel, PanelHeader, PageHeader, Money, Label, Button (primary paper-on-ink / quiet ring), Pill (tone)
- Runway (signature): serif safe-to-spend hero, stepped balance line, due dots, payday marker, mono date axis
