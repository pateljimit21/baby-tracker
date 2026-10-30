import { CATEGORIES, CATEGORY_OF, type Category } from '../lib/activity'
import { addDays } from '../lib/format'
import type { Entry } from '../types'
import { SeriesDot } from './CompareWith'
import { cx } from './ui'

export interface TimelineLane {
  /** 0 = this baby, 1 = sibling (only shown when comparing). */
  index: 0 | 1
  name: string
  dayStart: number
  entries: Entry[]
  /** Nothing to show, e.g. the sibling isn't this old yet. */
  blank?: boolean
}

export interface TimelineColumn {
  key: number
  label: string
  lanes: TimelineLane[]
  selected: boolean
}

const H = 640 // px for 24 hours
const DAY = 86_400_000
const HOURS = [0, 3, 6, 9, 12, 15, 18, 21, 24]

/** How each activity group is drawn: color for the main three, shape for the rest. */
const MARK: Record<Category, { className: string; style?: React.CSSProperties }> = {
  feed: { className: 'rounded-[3px]', style: { background: 'var(--c-feed)' } },
  diaper: { className: 'rounded-[3px]', style: { background: 'var(--c-diaper)' } },
  sleep: { className: 'rounded-[3px] opacity-90', style: { background: 'var(--c-sleep)' } },
  pump: { className: 'rounded-[3px] border-2 border-slate-500 bg-transparent dark:border-slate-300' },
  health: { className: 'mx-auto !w-2 rounded-full bg-slate-500 dark:bg-slate-300' },
}

/**
 * Nara-style day timeline: one column per day (or per age when comparing, with a lane per baby),
 * 12 AM at the top to 12 AM at the bottom, a block wherever something was logged.
 */
export function Timeline({
  columns,
  categories,
  now,
  onPick,
  onSelect,
}: {
  columns: TimelineColumn[]
  categories: Set<Category>
  now: number
  onPick: (e: Entry, lane: TimelineLane) => void
  onSelect: (key: number) => void
}) {
  const comparing = columns.some((c) => c.lanes.length > 1)

  return (
    <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
      <Legend categories={categories} />

      {/* Column headers: tap one to see that day's totals and log below. */}
      <div className="flex border-b border-slate-200 pl-10 dark:border-slate-700">
        {columns.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => onSelect(c.key)}
            aria-pressed={c.selected}
            className={cx('flex-1 px-0.5 pt-2 pb-1.5 text-center', c.selected && 'bg-teal-50 dark:bg-slate-700')}
          >
            <span className="block text-xs font-semibold whitespace-nowrap text-teal-800 dark:text-teal-300">{c.label}</span>
            {comparing && (
              <span className="mt-1 flex justify-around">
                {c.lanes.map((l) => (
                  <span key={l.index} className="inline-flex items-center gap-0.5 text-[10px] text-slate-600 dark:text-slate-300">
                    <SeriesDot index={l.index} />
                    {l.name.charAt(0)}
                  </span>
                ))}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="relative flex pl-10" style={{ height: H }}>
        {/* Night shading and hour lines */}
        <div className="pointer-events-none absolute inset-x-0 top-0 bg-slate-100/70 dark:bg-slate-900/40" style={{ height: H / 4 }} />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-slate-100/70 dark:bg-slate-900/40" style={{ height: H / 4 }} />
        {HOURS.map((h) => (
          <div key={h} className="pointer-events-none absolute inset-x-0" style={{ top: (h / 24) * H }}>
            {h > 0 && h < 24 && <div className="ml-10 border-t border-dashed border-slate-300 dark:border-slate-600" />}
            <span className="absolute left-1 -translate-y-1/2 text-[10px] leading-tight font-medium text-slate-500 dark:text-slate-400">
              {h === 0 || h === 24 ? '12 AM' : h === 12 ? '12 PM' : h < 12 ? `${h} AM` : `${h - 12} PM`}
            </span>
          </div>
        ))}

        {columns.map((c) => (
          <div key={c.key} className={cx('relative flex flex-1 gap-1 px-1', c.selected && 'bg-teal-50/60 dark:bg-slate-700/40')}>
            {c.lanes.map((lane) => (
              <Lane key={lane.index} lane={lane} categories={categories} now={now} onPick={(e) => onPick(e, lane)} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function Lane({ lane, categories, now, onPick }: { lane: TimelineLane; categories: Set<Category>; now: number; onPick: (e: Entry) => void }) {
  const dayEnd = addDays(lane.dayStart, 1)
  const items = lane.blank
    ? []
    : lane.entries.filter((e) => {
        if (!categories.has(CATEGORY_OF[e.type])) return false
        const end = e.endTime ?? (e.type === 'sleep' || e.type === 'breast' ? now : e.time)
        return e.time < dayEnd && end >= lane.dayStart
      })

  return (
    <div className={cx('relative flex-1', lane.blank && 'bg-[repeating-linear-gradient(135deg,transparent,transparent_6px,rgba(148,163,184,0.15)_6px,rgba(148,163,184,0.15)_8px)]')}>
      {items.map((e) => {
        const cat = CATEGORY_OF[e.type]
        const timed = e.type === 'sleep' || e.type === 'breast'
        const start = Math.max(e.time, lane.dayStart)
        const end = timed ? Math.min(e.endTime ?? now, dayEnd) : start
        const top = ((start - lane.dayStart) / DAY) * H
        const height = Math.max(6, ((end - start) / DAY) * H)
        const mark = MARK[cat]
        return (
          <button
            key={e.id}
            type="button"
            onClick={() => onPick(e)}
            aria-label={`${CATEGORIES.find((c) => c.key === cat)?.label} at ${new Date(e.time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
            className="absolute inset-x-0 -my-1 py-1"
            style={{ top, height: height + 8 }}
          >
            <span className={cx('block h-full w-full ring-1 ring-white dark:ring-slate-800', mark.className)} style={mark.style} />
          </button>
        )
      })}
      {lane.dayStart <= now && now < dayEnd && (
        <div className="pointer-events-none absolute inset-x-0 border-t-2 border-teal-600" style={{ top: ((now - lane.dayStart) / DAY) * H }} />
      )}
    </div>
  )
}

function Legend({ categories }: { categories: Set<Category> }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 border-b border-slate-200 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
      {CATEGORIES.filter((c) => categories.has(c.key)).map((c) => (
        <span key={c.key} className="inline-flex items-center gap-1.5">
          <span className={cx('inline-block h-2.5 w-4', MARK[c.key].className)} style={MARK[c.key].style} />
          {c.label}
        </span>
      ))}
    </div>
  )
}
