import type { ReactNode } from 'react'
import { ENTRY_ICONS, entryTitle, fmtTime, type DayTotals, fmtDuration, fmtVolume } from '../lib/format'
import { useNow } from '../lib/prefs'
import { useApp } from '../state'
import type { Entry } from '../types'
import { Empty } from './ui'

/** Without `onPick` the list is read-only (e.g. a sibling's log shown for comparison). */
export function EntryList({ entries, onPick, empty }: { entries: Entry[]; onPick?: (e: Entry) => void; empty: string }) {
  const { units, user } = useApp()
  const now = useNow(30_000)
  if (!entries.length) return <Empty>{empty}</Empty>
  return (
    <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200 dark:divide-slate-700 dark:bg-slate-800 dark:ring-slate-700">
      {entries.map((e) => (
        <li key={e.id}>
          <Row onClick={onPick && (() => onPick(e))}>
            <span className="text-2xl" aria-hidden>
              {ENTRY_ICONS[e.type]}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{entryTitle(e, units, now)}</span>
              <span className="block truncate text-sm text-slate-500 dark:text-slate-400">
                {e.type === 'sleep' && e.endTime ? `${fmtTime(e.time)} – ${fmtTime(e.endTime)}` : fmtTime(e.time)}
                {e.by !== user?.uid && ` · ${e.byName}`}
                {e.note && ` · ${e.note}`}
              </span>
            </span>
            {onPick && (
              <span className="text-slate-400" aria-hidden>
                ›
              </span>
            )}
          </Row>
        </li>
      ))}
    </ul>
  )
}

function Row({ onClick, children }: { onClick?: () => void; children: ReactNode }) {
  const className = 'flex w-full items-center gap-3 px-4 py-3 text-left'
  return onClick ? (
    <button type="button" onClick={onClick} className={`${className} active:bg-slate-100 dark:active:bg-slate-700`}>
      {children}
    </button>
  ) : (
    <div className={className}>{children}</div>
  )
}

export function Totals({ totals }: { totals: DayTotals }) {
  const { units } = useApp()
  const items = [
    { label: 'Milk', value: totals.milkMl ? fmtVolume(totals.milkMl, units.volume) : '–' },
    { label: 'Feeds', value: String(totals.feeds) },
    { label: 'Breast', value: totals.breastMs ? fmtDuration(totals.breastMs) : '–' },
    { label: 'Wet', value: String(totals.wet) },
    { label: 'Dirty', value: String(totals.dirty) },
    { label: 'Sleep', value: totals.sleepMs ? fmtDuration(totals.sleepMs) : '–' },
  ]
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((i) => (
        <div key={i.label} className="rounded-2xl bg-white px-3 py-3 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
          <div className="text-xs font-medium text-slate-500 uppercase dark:text-slate-400">{i.label}</div>
          <div className="mt-0.5 text-lg font-bold tabular-nums">{i.value}</div>
        </div>
      ))}
    </div>
  )
}
