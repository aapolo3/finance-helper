import { format } from 'date-fns'
import type { DateRange, ViewPeriod } from '../domain/types'

export function periodLabel(view: ViewPeriod, range: DateRange): string {
  if (view === 'monthly') return format(range.start, 'MMMM yyyy')
  return `${format(range.start, 'MMM d')} – ${format(range.end, 'MMM d, yyyy')}`
}
