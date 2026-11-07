// Building a formatter is slow, and AnimatedMoney formats on every frame.
const formatters = new Map<string, Intl.NumberFormat>()

export function formatMoney(amount: number, currency = 'USD'): string {
  let formatter = formatters.get(currency)
  if (!formatter) {
    formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    })
    formatters.set(currency, formatter)
  }
  return formatter.format(amount)
}

export function formatMoneyCompact(amount: number, currency = 'USD'): string {
  const abs = Math.abs(amount)
  if (abs >= 1000) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(amount)
  }
  return formatMoney(amount, currency)
}

export function cadenceLabel(cadence: string): string {
  switch (cadence) {
    case 'once':
      return 'One-time'
    case 'weekly':
      return 'Weekly'
    case 'biweekly':
      return 'Every 2 weeks'
    case 'monthly':
      return 'Monthly'
    case 'yearly':
      return 'Yearly'
    default:
      return cadence
  }
}
