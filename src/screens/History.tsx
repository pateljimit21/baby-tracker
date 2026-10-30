import { useEffect, useMemo, useState } from 'react'
import { ActivityCards } from '../components/ActivityCards'
import { SeriesDot, useCompareSibling } from '../components/CompareWith'
import { EntryList } from '../components/EntryList'
import { EntrySheet } from '../components/EntrySheet'
import { Timeline, type TimelineColumn, type TimelineLane } from '../components/Timeline'
import { Button, SectionTitle, Segmented, Sheet, cx } from '../components/ui'
import { CATEGORIES, CATEGORY_OF, useCategoryFilter, type Category } from '../lib/activity'
import {
  addDays,
  ageInDays,
  dayTotals,
  entryTitle,
  fmtAgeDays,
  fmtAgeMWD,
  fmtDate,
  fmtDay,
  fmtDuration,
  fmtTime,
  fromInputDate,
  mlTo,
  startOfDay,
  toInputDate,
  type DayTotals,
} from '../lib/format'
import { useNow, usePref } from '../lib/prefs'
import { useSwipe } from '../lib/swipe'
import { useBaby } from '../state'
import type { Entry } from '../types'

export function History() {
  const { backend, family, baby, entries: recentEntries, since, units, toast } = useBaby()
  const now = useNow(60_000)
  const today = startOfDay(now)
  const [day, setDay] = useState(today)
  const [editing, setEditing] = useState<Entry | null>(null)
  const [view, setView] = usePref<'timeline' | 'list'>('history-view', 'timeline')
  const [categories, setCategories] = useCategoryFilter()
  const [sheet, setSheet] = useState<'filter' | 'compare' | null>(null)
  const inFilter = (e: Entry) => categories.has(CATEGORY_OF[e.type])

  // Sibling to compare with, matched by age: this baby's day 20 next to the sibling's day 20.
  const { siblings, sib, setCompareId } = useCompareSibling()
  const age = ageInDays(baby.birthDate, day)
  const sibDayFor = (d: number) => (sib ? addDays(startOfDay(sib.birthDate), ageInDays(baby.birthDate, d)) : 0)

  // 7 days around the chosen day, never past today.
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(Math.min(today, addDays(day, 3)), -i)), [day, today])

  // The app keeps the last week loaded. For older weeks, load just that week, never everything since then.
  const isRecent = weekDays[6] >= since
  const weekFrom = addDays(weekDays[6], -1)
  const weekTo = addDays(weekDays[0], 1)
  const [olderEntries, setOlderEntries] = useState<Entry[]>([])
  useEffect(() => {
    setOlderEntries([])
    if (isRecent) return
    return backend.watchEntries(family.id, baby.id, weekFrom, setOlderEntries, weekTo)
  }, [backend, family.id, baby.id, isRecent, weekFrom, weekTo])
  const entries = isRecent ? recentEntries : olderEntries

  const onDay = (list: Entry[], d: number) =>
    list.filter((e) => (e.time >= d && e.time < addDays(d, 1)) || (e.type === 'sleep' && e.time < d && (e.endTime ?? now) > d))
  const list = useMemo(() => onDay(entries, day).filter(inFilter), [entries, day, now, categories]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load only the sibling's matching week (plus a day before, for sleep that crosses midnight).
  const sibFrom = sib ? addDays(sibDayFor(weekDays[6]), -1) : null
  const sibTo = sib ? addDays(sibDayFor(weekDays[0]), 1) : null
  const [sibEntries, setSibEntries] = useState<Entry[]>([])
  useEffect(() => {
    setSibEntries([])
    if (!sib || sibFrom == null || sibTo == null) return
    return backend.watchEntries(family.id, sib.id, sibFrom, setSibEntries, sibTo)
  }, [backend, family.id, sib?.id, sibFrom, sibTo]) // eslint-disable-line react-hooks/exhaustive-deps

  const sibDay = sibDayFor(day)
  const sibList = useMemo(() => onDay(sibEntries, sibDay).filter(inFilter), [sibEntries, sibDay, now, categories]) // eslint-disable-line react-hooks/exhaustive-deps
  const sibStatus = (d: number): 'ok' | 'unborn' | 'future' =>
    ageInDays(baby.birthDate, d) < 0 ? 'unborn' : sibDayFor(d) > today ? 'future' : 'ok'

  // Timeline: the chosen day and the 3 before it (like Nara), one lane per baby when comparing.
  const columns: TimelineColumn[] = [3, 2, 1, 0].map((back) => {
    const d = addDays(day, -back)
    const lanes: TimelineLane[] = [{ index: 0, name: baby.name, dayStart: d, entries }]
    if (sib) lanes.push({ index: 1, name: sib.name, dayStart: sibDayFor(d), entries: sibEntries, blank: sibStatus(d) !== 'ok' })
    const a = ageInDays(baby.birthDate, d)
    return { key: d, label: sib ? (a >= 0 ? fmtAgeMWD(baby.birthDate, d) : '–') : fmtDayShort(d, now), lanes, selected: d === day }
  })

  const pick = (e: Entry, lane: TimelineLane) => {
    if (lane.index === 0) setEditing(e)
    else toast(`${lane.name}: ${entryTitle(e, units, now)} at ${fmtTime(e.time)}`)
  }

  const filtered = categories.size < CATEGORIES.length

  // Swipe left for the next day, right for the day before, like turning pages.
  // `slide` makes the new day slide in from the side it came from.
  const [slide, setSlide] = useState<'from-left' | 'from-right' | null>(null)
  const goDay = (delta: number) => {
    setSlide(delta > 0 ? 'from-right' : 'from-left')
    setDay(addDays(day, delta))
  }
  const swipe = useSwipe({ onLeft: () => goDay(1), onRight: () => goDay(-1), canLeft: day < today })

  return (
    <div {...swipe.handlers} className="min-h-[70dvh] touch-pan-y">
      <div className="flex items-center justify-between gap-2">
        <NavButton label="Previous day" onClick={() => goDay(-1)}>
          ‹
        </NavButton>
        <label className="relative flex-1 text-center">
          <span className="block text-lg font-bold">{fmtDay(day, now)}</span>
          <span className="block text-sm text-slate-500 dark:text-slate-400">
            {age >= 0 ? `${baby.name} · ${fmtAgeMWD(baby.birthDate, day)} · ${fmtAgeDays(age)}` : `Before ${baby.name} was born`}
          </span>
          <input
            type="date"
            aria-label="Pick a day"
            className="absolute inset-0 opacity-0"
            value={toInputDate(day)}
            max={toInputDate(today)}
            onChange={(e) => e.target.value && setDay(startOfDay(fromInputDate(e.target.value)))}
          />
        </label>
        <NavButton label="Next day" disabled={day >= today} onClick={() => goDay(1)}>
          ›
        </NavButton>
      </div>

      {/* Toolbar, like Nara's: filter, compare, and timeline or list */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ToolButton onClick={() => setSheet('filter')} active={filtered} label="Filter activity types">
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" aria-hidden>
            <path d="M3 5h18l-7 8v6l-4 2v-8z" />
          </svg>
          Filter
          {filtered && <span className="rounded-full bg-teal-700 px-1.5 text-xs text-white">{categories.size}</span>}
        </ToolButton>
        {siblings.length > 0 && (
          <ToolButton onClick={() => setSheet('compare')} active={!!sib} label="Compare with a sibling">
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
              <rect x="3" y="4" width="7" height="16" rx="1.5" />
              <rect x="14" y="4" width="7" height="16" rx="1.5" />
            </svg>
            {sib ? (
              <span className="inline-flex items-center gap-1">
                vs <SeriesDot index={1} /> {sib.name}
              </span>
            ) : (
              'Compare'
            )}
          </ToolButton>
        )}
        <div className="ml-auto w-36 shrink-0">
          <Segmented
            options={[
              { value: 'timeline', label: 'Timeline' },
              { value: 'list', label: 'List' },
            ]}
            value={view}
            onChange={setView}
          />
        </div>
      </div>

      <div
        key={day}
        className={cx(slide && !swipe.offset && `slide-${slide}`, !swipe.offset && 'transition-transform duration-150')}
        style={swipe.offset ? { transform: `translateX(${swipe.offset}px)` } : undefined}
        onAnimationEnd={() => setSlide(null)}
      >
      {sib && sibStatus(day) === 'future' && (
        <div className="mt-3 rounded-2xl bg-amber-50 p-3 text-sm text-amber-950 ring-1 ring-amber-200 dark:bg-amber-950 dark:text-amber-100 dark:ring-amber-900">
          {sib.name} isn't {fmtAgeDays(age).replace(' old', '')} old yet.
          <Button variant="secondary" className="mt-2 w-full" onClick={() => setDay(addDays(startOfDay(baby.birthDate), ageInDays(sib.birthDate, now)))}>
            Go to day {ageInDays(sib.birthDate, now)}, {sib.name}'s age today
          </Button>
        </div>
      )}

      {view === 'timeline' ? (
        <div className="mt-3">
          <Timeline columns={columns} categories={categories} now={now} onPick={pick} onSelect={setDay} />
          <p className="mt-1 px-1 text-xs text-slate-500 dark:text-slate-400">
            Swipe or tap a {sib ? 'age' : 'day'} to see its totals below. Tap a block to {sib ? `see it (${baby.name}'s open to edit)` : 'edit it'}.
          </p>
        </div>
      ) : (
        <>
          <SectionTitle>{sib ? `${baby.name}'s log` : 'Log'}</SectionTitle>
          <EntryList entries={list} onPick={setEditing} empty={filtered ? 'Nothing logged this day for the activities you picked.' : 'Nothing logged this day.'} />
          {sib && sibStatus(day) === 'ok' && (
            <>
              <SectionTitle>
                {sib.name}'s log at the same age · {fmtDate(sibDay)}
              </SectionTitle>
              <EntryList entries={sibList} empty={`Nothing logged for ${sib.name} that day.`} />
            </>
          )}
        </>
      )}

      <SectionTitle>{sib ? `Totals · ${fmtAgeMWD(baby.birthDate, day)}` : `Totals · ${fmtDay(day, now)}`}</SectionTitle>
      {sib && (
        <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 px-1 text-sm text-slate-600 dark:text-slate-300">
          <span className="inline-flex items-center gap-1.5">
            <SeriesDot index={0} />
            <span className="font-semibold text-slate-800 dark:text-slate-100">{baby.name}</span> {fmtDate(day)}
          </span>
          {sibStatus(day) === 'ok' && (
            <span className="inline-flex items-center gap-1.5">
              <SeriesDot index={1} />
              <span className="font-semibold text-slate-800 dark:text-slate-100">{sib.name}</span> {fmtDate(sibDay)}
            </span>
          )}
        </div>
      )}
      <ActivityCards
        sides={[
          { baby, totals: dayTotals(entries, day, now) },
          ...(sib && sibStatus(day) === 'ok' ? [{ baby: sib, totals: dayTotals(sibEntries, sibDay, now) }] : []),
        ]}
        categories={categories}
        empty={sib ? 'Nothing logged for either baby at this age.' : 'Nothing logged this day.'}
      />
      </div>

      <SectionTitle>Week at a glance</SectionTitle>
      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
        {sib ? (
          <CompareWeek
            rows={weekDays.map((d) => ({
              d,
              age: ageInDays(baby.birthDate, d),
              a: dayTotals(entries, d, now),
              b: sibStatus(d) === 'ok' ? dayTotals(sibEntries, sibDayFor(d), now) : null,
            }))}
            day={day}
            names={[baby.name, sib.name]}
            onPick={setDay}
          />
        ) : (
          <table className="w-full text-sm tabular-nums">
            <thead className="text-xs text-slate-500 uppercase dark:text-slate-400">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Day</th>
                <th className="px-1 py-2 text-right font-medium">Milk</th>
                <th className="px-1 py-2 text-right font-medium">Feeds</th>
                <th className="px-1 py-2 text-right font-medium">💧/💩</th>
                <th className="px-3 py-2 text-right font-medium">Sleep</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {weekDays.map((d) => {
                const t = dayTotals(entries, d, now)
                return (
                  <tr key={d} onClick={() => setDay(d)} className={cx('cursor-pointer', d === day && 'bg-teal-50 dark:bg-slate-700')}>
                    <td className="px-3 py-2">{fmtDay(d, now)}</td>
                    <td className="px-1 py-2 text-right">{t.milkMl ? `${mlTo(t.milkMl, units.volume)}` : '–'}</td>
                    <td className="px-1 py-2 text-right">{t.feeds || '–'}</td>
                    <td className="px-1 py-2 text-right">
                      {t.wet}/{t.dirty}
                    </td>
                    <td className="px-3 py-2 text-right">{t.sleepMs ? fmtDuration(t.sleepMs) : '–'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        <p className="px-3 pb-2 text-xs text-slate-500 dark:text-slate-400">Milk in {units.volume}. Tap a day to see it.</p>
      </div>

      {editing && <EntrySheet type={editing.type} entry={editing} onClose={() => setEditing(null)} />}

      {sheet === 'filter' && <FilterSheet shown={categories} onDone={(c) => (setCategories(c), setSheet(null))} onClose={() => setSheet(null)} />}

      {sheet === 'compare' && (
        <Sheet title="Compare at the same age" onClose={() => setSheet(null)}>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Shows {baby.name}'s days next to a sibling's days at the same age, e.g. {baby.name} at 1m 1w 5d next to the sibling at 1m 1w 5d.
          </p>
          <div className="divide-y divide-slate-200 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200 dark:divide-slate-700 dark:bg-slate-800 dark:ring-slate-700">
            {[{ id: '', name: 'No one' }, ...siblings].map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => (setCompareId(b.id), setSheet(null))}
                className="flex min-h-14 w-full items-center gap-3 px-4 text-left active:bg-slate-100 dark:active:bg-slate-700"
              >
                <span
                  className={cx(
                    'flex size-6 shrink-0 items-center justify-center rounded-full ring-2',
                    (sib?.id ?? '') === b.id ? 'ring-teal-700 dark:ring-teal-400' : 'ring-slate-300 dark:ring-slate-600',
                  )}
                >
                  {(sib?.id ?? '') === b.id && <span className="size-3 rounded-full bg-teal-700 dark:bg-teal-400" />}
                </span>
                <span className="font-semibold">{b.name}</span>
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </div>
  )
}

function FilterSheet({ shown, onDone, onClose }: { shown: Set<Category>; onDone: (c: Category[]) => void; onClose: () => void }) {
  const [picked, setPicked] = useState(new Set(shown))
  const toggle = (c: Category) => {
    const next = new Set(picked)
    if (next.has(c)) next.delete(c)
    else next.add(c)
    setPicked(next)
  }
  return (
    <Sheet title="Filters" onClose={onClose}>
      <div className="divide-y divide-slate-200 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200 dark:divide-slate-700 dark:bg-slate-800 dark:ring-slate-700">
        {CATEGORIES.map((c) => (
          <label key={c.key} className="flex min-h-16 items-center gap-4 px-4">
            <span className="text-3xl" aria-hidden>
              {c.icon}
            </span>
            <span className="flex-1 text-lg">{c.label}</span>
            <input type="checkbox" checked={picked.has(c.key)} onChange={() => toggle(c.key)} className="size-6 accent-teal-700" />
          </label>
        ))}
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">Health is medicine and temperature. Applies to the timeline, the log and the totals.</p>
      <Button className="w-full" disabled={!picked.size} onClick={() => onDone(CATEGORIES.map((c) => c.key).filter((k) => picked.has(k)))}>
        Apply
      </Button>
    </Sheet>
  )
}

function ToolButton({ onClick, active, label, children }: { onClick: () => void; active: boolean; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cx(
        'inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold ring-1',
        active
          ? 'bg-teal-50 text-teal-900 ring-teal-300 dark:bg-slate-700 dark:text-teal-200 dark:ring-teal-700'
          : 'bg-white text-slate-700 ring-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-600',
      )}
    >
      {children}
    </button>
  )
}

/** "Mon 19" for timeline column headers. */
function fmtDayShort(d: number, now: number): string {
  const label = fmtDay(d, now)
  if (label === 'Today' || label === 'Yesterday') return label === 'Today' ? 'Today' : 'Yest.'
  const dt = new Date(d)
  return `${dt.toLocaleDateString([], { weekday: 'short' })} ${dt.getDate()}`
}


function CompareWeek({
  rows,
  day,
  names,
  onPick,
}: {
  rows: { d: number; age: number; a: DayTotals; b: DayTotals | null }[]
  day: number
  names: [string, string]
  onPick: (d: number) => void
}) {
  const { units } = useBaby()
  const milk = (t: DayTotals | null) => (!t ? '' : t.milkMl ? String(mlTo(t.milkMl, units.volume)) : '–')
  const sleep = (t: DayTotals | null) => (!t ? '' : t.sleepMs ? fmtDuration(t.sleepMs) : '–')
  return (
    <table className="w-full text-sm tabular-nums">
      <thead className="text-xs text-slate-500 dark:text-slate-400">
        <tr className="uppercase">
          <th rowSpan={2} className="px-3 pt-2 text-left align-bottom font-medium">
            Age
          </th>
          <th colSpan={2} className="px-1 pt-2 text-center font-medium">
            Milk
          </th>
          <th colSpan={2} className="px-3 pt-2 text-center font-medium">
            Sleep
          </th>
        </tr>
        <tr>
          {[0, 1].map((k) =>
            names.map((n, i) => (
              <th key={`${k}${i}`} className={cx('px-1 pb-2 text-right font-semibold text-slate-600 dark:text-slate-300', k === 1 && i === 1 && 'pr-3')}>
                <span className="inline-flex items-center gap-1" title={n}>
                  <SeriesDot index={i as 0 | 1} />
                  {n.charAt(0)}
                </span>
              </th>
            )),
          )}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
        {rows.map(({ d, age, a, b }) => (
          <tr key={d} onClick={() => onPick(d)} className={cx('cursor-pointer', d === day && 'bg-teal-50 dark:bg-slate-700')}>
            <td className="px-3 py-2">{age >= 0 ? `Day ${age}` : '–'}</td>
            <td className="px-1 py-2 text-right">{milk(a)}</td>
            <td className="px-1 py-2 text-right">{milk(b)}</td>
            <td className="px-1 py-2 text-right">{sleep(a)}</td>
            <td className="px-1 py-2 pr-3 text-right">{sleep(b)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function NavButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-12 items-center justify-center rounded-full bg-white text-2xl ring-1 ring-slate-200 disabled:opacity-30 dark:bg-slate-800 dark:ring-slate-700"
    >
      {children}
    </button>
  )
}
