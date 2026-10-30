import { useEffect, useState } from 'react'
import { addDays, dayTotals, fmtAge, fmtDuration, fmtVolume, rangeTotals, startOfDay, type DayTotals } from '../lib/format'
import { useNow } from '../lib/prefs'
import { useBaby } from '../state'
import type { Baby, Entry } from '../types'
import { ActivityCards } from './ActivityCards'
import { Segmented, Sheet, cx } from './ui'

/**
 * Top of every screen, like Nara: the baby's name with a dropdown to switch babies
 * (each showing today's totals so far), and a Summary button.
 */
export function BabyHeader({ onManage }: { onManage: () => void }) {
  const { baby, babies, family, families, selectBaby } = useBaby()
  const now = useNow(60_000)
  const [menu, setMenu] = useState(false)
  const [summary, setSummary] = useState(false)

  // Full-screen layers (tap-outside, the Summary sheet) sit outside <header>: its blur would trap them inside it.
  return (
    <>
    {menu && <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} aria-hidden />}
    <header className="pt-safe sticky top-0 z-20 bg-(--page)/90 backdrop-blur">
      <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
        <button type="button" onClick={() => setMenu(!menu)} aria-expanded={menu} className="min-w-0 text-left">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-2xl font-bold">{baby.name}</span>
            <span className={cx('text-xl text-slate-500 transition-transform', menu && 'rotate-180')} aria-hidden>
              ⌄
            </span>
          </span>
          <span className="block text-sm text-slate-500 dark:text-slate-400">
            {fmtAge(baby.birthDate, now)}
            {families && families.length > 1 && ` · ${family.name}`}
          </span>
        </button>
        <button
          type="button"
          onClick={() => (setMenu(false), setSummary(true))}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-white px-3 text-sm font-semibold ring-1 ring-slate-300 dark:bg-slate-800 dark:ring-slate-600"
        >
          <span aria-hidden>📋</span> Summary
        </button>
      </div>

      {menu && (
        <>
          <div className="absolute inset-x-4 z-10 overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
            <div className="px-4 pt-3 pb-1 text-xs font-medium text-slate-500 uppercase dark:text-slate-400">Today so far</div>
            <ul className="divide-y divide-slate-200 dark:divide-slate-700">
              {(babies ?? []).map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => (selectBaby(b.id), setMenu(false))}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-slate-100 dark:active:bg-slate-700"
                  >
                    <span
                      className={cx(
                        'flex size-6 shrink-0 items-center justify-center rounded-full ring-2',
                        b.id === baby.id ? 'ring-teal-700 dark:ring-teal-400' : 'ring-slate-300 dark:ring-slate-600',
                      )}
                    >
                      {b.id === baby.id && <span className="size-3 rounded-full bg-teal-700 dark:bg-teal-400" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{b.name}</span>
                      <TodayLine baby={b} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => (setMenu(false), onManage())}
              className="w-full border-t border-slate-200 px-4 py-3 text-left text-sm font-semibold text-teal-700 dark:border-slate-700 dark:text-teal-400"
            >
              Add or edit babies
            </button>
          </div>
        </>
      )}

    </header>
    {summary && <SummarySheet onClose={() => setSummary(false)} />}
    </>
  )
}

/** One line of today's totals for a baby in the dropdown. Loads that baby's day only while open. */
function TodayLine({ baby }: { baby: Baby }) {
  const { backend, family, units } = useBaby()
  const now = useNow(60_000)
  const today = startOfDay(now)
  const [entries, setEntries] = useState<Entry[] | null>(null)
  useEffect(() => backend.watchEntries(family.id, baby.id, addDays(today, -1), setEntries), [backend, family.id, baby.id, today])

  if (!entries) return <span className="block text-sm text-slate-500 dark:text-slate-400">Loading…</span>
  const t = dayTotals(entries, today, now)
  const parts = [
    t.bottles && `🍼 ${t.bottles} · ${fmtVolume(t.milkMl, units.volume)}`,
    t.breastfeeds && `🤱 ${t.breastfeeds}`,
    t.diapers && `🧷 ${t.diapers}`,
    t.sleepMs && `😴 ${fmtDuration(t.sleepMs)}`,
  ].filter(Boolean)
  return <span className="block truncate text-sm text-slate-600 tabular-nums dark:text-slate-300">{parts.length ? parts.join('   ') : 'Nothing logged yet today'}</span>
}

function SummarySheet({ onClose }: { onClose: () => void }) {
  const { baby, entries } = useBaby()
  const now = useNow(60_000)
  const [range, setRange] = useState<'today' | '24h'>('today')
  const totals: DayTotals = range === 'today' ? dayTotals(entries, startOfDay(now), now) : rangeTotals(entries, now - 86_400_000, now, now)
  return (
    <Sheet title={`${baby.name}'s summary`} onClose={onClose}>
      <Segmented
        options={[
          { value: 'today', label: 'Today' },
          { value: '24h', label: 'Last 24 hours' },
        ]}
        value={range}
        onChange={setRange}
      />
      <ActivityCards sides={[{ baby, totals }]} empty={range === 'today' ? 'Nothing logged yet today.' : 'Nothing logged in the last 24 hours.'} />
    </Sheet>
  )
}
