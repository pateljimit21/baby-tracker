import type { Category } from '../lib/activity'
import { fmtDuration, fmtTemp, fmtVolume, type DayTotals } from '../lib/format'
import { useApp } from '../state'
import type { Baby } from '../types'
import { SeriesDot } from './CompareWith'
import { Card } from './ui'

export interface CardSide {
  baby: Baby
  totals: DayTotals
}

const BADGE = ['#99f6e4', '#fde68a'] as const

/**
 * Nara-style totals: one card per activity with a count and what made it up.
 * With two sides (comparing siblings), each card lists both babies.
 */
export function ActivityCards({ sides, categories, empty = 'Nothing logged.' }: { sides: CardSide[]; categories?: Set<Category>; empty?: string }) {
  const { units } = useApp()
  const vol = (ml: number) => fmtVolume(ml, units.volume)

  const cards: { cat: Category; icon: string; title: string; count: (t: DayTotals) => number; lines: (t: DayTotals) => string[] }[] = [
    {
      cat: 'feed',
      icon: '🍼',
      title: 'Bottle feed',
      count: (t) => t.bottles,
      lines: (t) => [
        `${vol(t.milkMl)} total`,
        ...(t.breastMilkMl ? [`${vol(t.breastMilkMl)} breast milk`] : []),
        ...(t.formulaMl ? [`${vol(t.formulaMl)} formula`] : []),
      ],
    },
    {
      cat: 'feed',
      icon: '🤱',
      title: 'Breastfeed',
      count: (t) => t.breastfeeds,
      lines: (t) => [`${fmtDuration(t.breastMs)} total`, ...(t.leftMs || t.rightMs ? [`Left ${fmtDuration(t.leftMs)} · Right ${fmtDuration(t.rightMs)}`] : [])],
    },
    { cat: 'feed', icon: '🥣', title: 'Solids', count: (t) => t.solids, lines: (t) => (t.foods.length ? [[...new Set(t.foods)].join(', ')] : []) },
    { cat: 'pump', icon: '🥛', title: 'Pumping', count: (t) => t.pumps, lines: (t) => [`${vol(t.pumpMl)} total`] },
    { cat: 'diaper', icon: '🧷', title: 'Diaper', count: (t) => t.diapers, lines: (t) => [`${t.wet} wet`, `${t.dirty} dirty`] },
    { cat: 'sleep', icon: '😴', title: 'Sleep', count: (t) => t.sleeps, lines: (t) => [`${fmtDuration(t.sleepMs)} total`] },
    { cat: 'health', icon: '💊', title: 'Medicine', count: (t) => t.meds.length, lines: (t) => [[...new Set(t.meds)].join(', ')] },
    { cat: 'health', icon: '🌡️', title: 'Temperature', count: (t) => t.temps, lines: (t) => (t.maxTempC != null ? [`Highest ${fmtTemp(t.maxTempC, units.temp)}`] : []) },
  ]
  // Sleep that started the day before still counts toward the day's total.
  const has = (c: (typeof cards)[number], t: DayTotals) => c.count(t) > 0 || (c.cat === 'sleep' && t.sleepMs > 0)
  const shown = cards.filter((c) => (!categories || categories.has(c.cat)) && sides.some((s) => has(c, s.totals)))

  if (!shown.length) return <Card className="text-sm text-slate-500 dark:text-slate-400">{empty}</Card>

  return (
    <div className="space-y-3">
      {shown.map((c) => (
        <Card key={c.title} className="flex gap-3">
          <span className="text-3xl" aria-hidden>
            {c.icon}
          </span>
          <div className="min-w-0 flex-1">
            {sides.length === 1 ? (
              <>
                <h3 className="flex items-center gap-2 text-lg font-semibold">
                  {c.title}
                  <Badge n={c.count(sides[0].totals)} index={0} />
                </h3>
                <Lines lines={c.lines(sides[0].totals)} />
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold">{c.title}</h3>
                <div className="divide-y divide-slate-200 dark:divide-slate-700">
                  {sides.map((s, i) => (
                    <div key={s.baby.id} className="py-2">
                      <div className="flex items-center gap-2">
                        <SeriesDot index={i as 0 | 1} />
                        <span className="font-medium">{s.baby.name}</span>
                        <Badge n={c.count(s.totals)} index={i} />
                      </div>
                      {has(c, s.totals) ? <Lines lines={c.lines(s.totals)} /> : <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">None</p>}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </Card>
      ))}
    </div>
  )
}

function Badge({ n, index }: { n: number; index: number }) {
  return (
    <span className="rounded-lg px-2 py-0.5 text-sm font-bold text-slate-900 tabular-nums" style={{ background: BADGE[index] }}>
      {n}
    </span>
  )
}

function Lines({ lines }: { lines: string[] }) {
  return (
    <ul className="mt-1 text-[15px] text-slate-700 tabular-nums dark:text-slate-200">
      {lines.map((l) => (
        <li key={l}>{l}</li>
      ))}
    </ul>
  )
}
