import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { formatMoney } from '../domain/money'

type Tone = 'cash' | 'copper' | 'due' | 'over' | 'muted' | 'plain'

const TONE_TEXT: Record<Tone, string> = {
  cash: 'text-cash',
  copper: 'text-copper',
  due: 'text-due',
  over: 'text-over',
  muted: 'text-paper-3',
  plain: 'text-paper',
}

/** An amount set like a register entry: monospace, tabular, optional sign. */
export function Money({
  value,
  currency,
  signed = false,
  tone = 'plain',
  className = '',
}: {
  value: number
  currency: string
  signed?: boolean
  tone?: Tone
  className?: string
}) {
  const sign = signed ? (value > 0.004 ? '+' : value < -0.004 ? '−' : '') : value < -0.004 ? '−' : ''
  return (
    <span className={`money ${TONE_TEXT[tone]} ${className}`}>
      {sign}
      {formatMoney(Math.abs(value), currency)}
    </span>
  )
}

/** Quiet sentence-case label for a value or a group. */
export function Label({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`text-xs font-medium text-paper-3 ${className}`}>{children}</p>
}

/** Page title in the display serif, with optional supporting line and actions. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-display text-[28px] leading-tight tracking-[-0.02em] text-balance text-paper">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-paper-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

/** A ledger panel: one step above the canvas, edged by a rule line. */
export function Panel({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return <section className={`card-surface rounded-xl p-4 sm:p-5 ${className}`}>{children}</section>
}

export function PanelHeader({
  title,
  aside,
}: {
  title: string
  aside?: ReactNode
}) {
  return (
    <div className="mb-3 flex min-h-8 items-center justify-between gap-3">
      <h2 className="text-sm font-medium text-paper">{title}</h2>
      {aside && <div className="flex shrink-0 items-center gap-2 text-sm text-paper-3">{aside}</div>}
    </div>
  )
}

export function Button({
  variant = 'quiet',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'quiet' }) {
  const look =
    variant === 'primary'
      ? 'bg-paper text-ink hover:opacity-90'
      : 'text-paper ring-1 ring-rule-strong hover:bg-ledger-3'
  return (
    <button
      type="button"
      {...props}
      className={`press inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium disabled:opacity-50 ${look} ${className}`}
    />
  )
}

export function Pill({ tone = 'muted', children }: { tone?: Tone; children: ReactNode }) {
  const look: Record<Tone, string> = {
    cash: 'bg-cash/12 text-cash',
    copper: 'bg-copper/15 text-copper',
    due: 'bg-due/15 text-due',
    over: 'bg-over/15 text-over',
    muted: 'bg-ledger-3 text-paper-2',
    plain: 'bg-ledger-3 text-paper',
  }
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${look[tone]}`}>
      {children}
    </span>
  )
}
