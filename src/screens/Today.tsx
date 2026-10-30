import { useMemo, useState } from 'react'
import { EntryList, Totals } from '../components/EntryList'
import { EntrySheet } from '../components/EntrySheet'
import { SectionTitle, Sheet, cx } from '../components/ui'
import { ENTRY_ICONS, breastSeconds, dayTotals, fmtAgo, fmtClock, fmtDuration, fmtTime, mlTo, startOfDay } from '../lib/format'
import { useNow, usePref } from '../lib/prefs'
import { useBaby } from '../state'
import type { Entry, EntryType } from '../types'

// Feeds have their own card (below); these are everything else.
const QUICK: { type: EntryType; label: string }[] = [
  { type: 'diaper', label: 'Diaper' },
  { type: 'sleep', label: 'Sleep' },
  { type: 'pump', label: 'Pump' },
  { type: 'med', label: 'Medicine' },
  { type: 'temp', label: 'Temp' },
]

const FEED_TYPES: EntryType[] = ['bottle', 'breast', 'solid']

const FEED_MENU: { type: EntryType | 'combo'; label: string; icon: string; hint: string }[] = [
  { type: 'breast', label: 'Breastfeed', icon: '🤱', hint: 'Timer for each side, or enter minutes' },
  { type: 'bottle', label: 'Bottle feed', icon: '🍼', hint: 'Breast milk, formula, or both' },
  { type: 'solid', label: 'Solids', icon: '🥣', hint: 'Food and which meal' },
  { type: 'combo', label: 'Combo feed', icon: '🤱🍼', hint: 'Breastfeed, then a top-up bottle' },
]

/** "35m", "2h", "3d": short enough for the small buttons. */
function shortAgo(t: number, now: number): string {
  const m = Math.max(0, Math.floor((now - t) / 60_000))
  if (m < 1) return 'now'
  if (m < 60) return `${m}m ago`
  if (m < 48 * 60) return `${Math.floor(m / 60)}h ago`
  return `${Math.floor(m / 1440)}d ago`
}

export function Today() {
  const { entries, user } = useBaby()
  const now = useNow()
  const [sheet, setSheet] = useState<{ type: EntryType | 'combo'; entry?: Entry } | null>(null)
  const [feedMenu, setFeedMenu] = useState(false)

  const today = startOfDay(now)
  const todays = useMemo(() => entries.filter((e) => e.time >= today || (e.type === 'sleep' && (e.endTime ?? now) >= today)), [entries, today, now])
  const totals = useMemo(() => dayTotals(entries, today, now), [entries, today, now])
  const running = entries.filter((e) => (e.type === 'breast' || e.type === 'sleep') && e.endTime == null)
  const lastSleep = entries.find((e) => e.type === 'sleep' && e.endTime != null)

  const open = (type: EntryType | 'combo', entry?: Entry) =>
    // Tapping Breast or Sleep while one is running opens that timer.
    setSheet({ type, entry: entry ?? running.find((r) => r.type === type) })

  return (
    <>
      {running.map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() => open(r.type, r)}
          className="mt-3 flex w-full items-center gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-left ring-2 ring-amber-300 dark:bg-amber-950 dark:ring-amber-800"
        >
          <span className="text-3xl" aria-hidden>
            {ENTRY_ICONS[r.type]}
          </span>
          <span className="flex-1">
            <span className="block font-semibold">
              {r.type === 'sleep' ? 'Sleeping' : r.activeSide ? `Feeding on the ${r.activeSide === 'L' ? 'left' : 'right'}` : 'Feed paused'}
            </span>
            <span className="block text-sm text-slate-600 dark:text-slate-300">
              Started {fmtTime(r.time)}
              {r.by !== user.uid && ` by ${r.byName}`} · tap to {r.type === 'sleep' ? 'stop' : 'switch or finish'}
            </span>
          </span>
          <span className="text-2xl font-bold tabular-nums">
            {fmtClock(r.type === 'sleep' ? now - r.time : (() => { const s = breastSeconds(r, now); return (s.left + s.right) * 1000 })())}
          </span>
        </button>
      ))}

      <FeedCard now={now} onAdd={() => setFeedMenu(true)} onPick={(e) => open(e.type, e)} />

      <div className="mt-3 grid grid-cols-5 gap-2">
        {QUICK.map((q) => {
          const last = entries.find((e) => e.type === q.type)
          const sub =
            q.type === 'sleep' && running.some((r) => r.type === 'sleep')
              ? 'asleep'
              : q.type === 'sleep' && lastSleep?.endTime
                ? `woke ${shortAgo(lastSleep.endTime, now).replace(' ago', '')}`
                : last
                  ? shortAgo(last.time, now)
                  : ''
          return (
            <button
              key={q.type}
              type="button"
              onClick={() => open(q.type)}
              className="flex min-h-24 flex-col items-center justify-center rounded-2xl bg-white px-1 py-2 ring-1 ring-slate-200 active:bg-slate-100 dark:bg-slate-800 dark:ring-slate-700 dark:active:bg-slate-700"
            >
              <span className="text-3xl" aria-hidden>
                {ENTRY_ICONS[q.type]}
              </span>
              <span className="mt-1 text-xs font-semibold">{q.label}</span>
              <span className="h-4 text-[10px] leading-4 text-slate-500 dark:text-slate-400">{sub}</span>
            </button>
          )
        })}
      </div>

      <SectionTitle>Today so far</SectionTitle>
      <Totals totals={totals} />

      <SectionTitle>Today's log</SectionTitle>
      <EntryList entries={todays} onPick={(e) => open(e.type, e)} empty="Nothing logged yet today. Tap a button above to start." />

      {sheet && <EntrySheet type={sheet.type} entry={sheet.entry} onClose={() => setSheet(null)} />}

      {feedMenu && (
        <Sheet title="Add a feed" onClose={() => setFeedMenu(false)}>
          <div className="divide-y divide-slate-200 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200 dark:divide-slate-700 dark:bg-slate-800 dark:ring-slate-700">
            {FEED_MENU.map((f) => (
              <button
                key={f.type}
                type="button"
                onClick={() => (setFeedMenu(false), open(f.type))}
                className="flex min-h-20 w-full items-center gap-4 px-4 text-left active:bg-slate-100 dark:active:bg-slate-700"
              >
                <span className={cx('w-16 shrink-0 text-center whitespace-nowrap', f.icon.length > 2 ? 'text-2xl tracking-tighter' : 'text-3xl')} aria-hidden>
                  {f.icon}
                </span>
                <span>
                  <span className="block text-lg font-semibold">{f.label}</span>
                  <span className="block text-sm text-slate-500 dark:text-slate-400">{f.hint}</span>
                </span>
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </>
  )
}

/** Like Nara's Feed card: the last feed and how long ago, today's feeds on demand, and + to add one. */
function FeedCard({ now, onAdd, onPick }: { now: number; onAdd: () => void; onPick: (e: Entry) => void }) {
  const { entries, units, user } = useBaby()
  const [more, setMore] = usePref('feed-card-open', false)
  const feeds = entries.filter((e) => FEED_TYPES.includes(e.type))
  const last = feeds[0]
  const today = startOfDay(now)
  const todays = feeds.filter((e) => e.time >= today)
  const feedingNow = last?.type === 'breast' && last.endTime == null

  let big = ''
  let unit = ''
  if (last?.type === 'bottle') {
    big = String(mlTo(last.amountMl ?? 0, units.volume))
    unit = units.volume
  } else if (last?.type === 'breast') {
    const s = breastSeconds(last, last.endTime ?? now)
    big = fmtDuration((s.left + s.right) * 1000)
  } else if (last?.type === 'solid') big = last.food ?? ''

  return (
    <div className="mt-3 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
      <div className="relative flex items-center bg-amber-400 px-4 py-3 text-slate-900 dark:bg-amber-500">
        <h2 className="text-xl font-bold">Feed</h2>
        <button
          type="button"
          onClick={onAdd}
          aria-label="Add a feed"
          className="absolute top-1.5 right-4 flex size-14 items-center justify-center rounded-full bg-teal-700 text-3xl text-white shadow-lg ring-4 ring-white active:bg-teal-800 dark:ring-slate-800"
        >
          +
        </button>
      </div>
      <button type="button" onClick={() => last && onPick(last)} className="flex w-full items-center gap-4 px-4 py-4 text-left">
        <span className="text-4xl" aria-hidden>
          {last ? ENTRY_ICONS[last.type] : '🍼'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-semibold">{feedingNow ? 'Feeding now' : 'Last feeding'}</span>
          <span className="block text-sm text-slate-500 dark:text-slate-400">
            {last ? `${fmtAgo(last.time, now)}${last.by !== user.uid ? ` · ${last.byName}` : ''}` : 'Nothing yet. Tap + to add one.'}
          </span>
        </span>
        {big && (
          <span className="max-w-[45%] truncate text-right text-4xl font-light tabular-nums">
            {big}
            {unit && <span className="ml-0.5 align-top text-base font-medium">{unit}</span>}
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={() => setMore(!more)}
        aria-expanded={more}
        className="flex w-full items-center justify-between border-t border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300"
      >
        {more ? 'Show less' : `Show today's feeds (${todays.length})`}
        <span aria-hidden className={cx('transition-transform', more && 'rotate-180')}>
          ⌄
        </span>
      </button>
      {more && (
        <div className="border-t border-slate-200 dark:border-slate-700">
          <EntryList entries={todays} onPick={onPick} empty="No feeds yet today." />
        </div>
      )}
    </div>
  )
}
