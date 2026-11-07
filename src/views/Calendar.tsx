import { CashflowCalendar } from '../components/CashflowCalendar'
import { PageHeader, Panel } from '../components/ui'
import { periodLabel } from '../lib/periodLabel'
import { usePeriod } from '../state/usePeriod'

export function Calendar() {
  const { income, expenses, goals, meta, range, openingBalance } = usePeriod()
  return (
    <div>
      <PageHeader title="Calendar" subtitle={`Day by day through ${periodLabel(meta.view, range)}`} />
      <Panel>
        <CashflowCalendar
          income={income}
          expenses={expenses}
          goals={goals}
          view={meta.view}
          range={range}
          anchorDate={meta.anchorDate}
          currency={meta.currency}
          weekStartsOn={meta.weekStartsOn}
          currentBalance={openingBalance}
          hideTitle
        />
      </Panel>
    </div>
  )
}
