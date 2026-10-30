import { useMemo, useState, type ReactNode } from 'react'
import { activityValues, convert, guessMapping, guessTarget, isOurs, readCsv, type CsvFile, type DateOrder, type ImportResult, type Mapping, type Target } from '../lib/csvImport'
import { ENTRY_ICONS, addDays, entryTitle, fmtDate, fmtDay, fmtTime, fromInputDate, startOfDay, toInputDate } from '../lib/format'
import { useBaby } from '../state'
import type { Entry } from '../types'
import { Button, Card, Field, Input, Segmented, Sheet, cx } from './ui'

const TARGETS: { value: Target; label: string }[] = [
  { value: 'feed', label: 'Feed (bottle or breast, decided per row)' },
  { value: 'bottle', label: 'Bottle' },
  { value: 'breast', label: 'Breastfeeding' },
  { value: 'pump', label: 'Pumping' },
  { value: 'diaper', label: 'Diaper' },
  { value: 'sleep', label: 'Sleep' },
  { value: 'med', label: 'Medicine' },
  { value: 'temp', label: 'Temperature' },
  { value: 'growth', label: 'Growth (weight, length, head)' },
  { value: 'visit', label: 'Doctor visit' },
  { value: 'vaccine', label: 'Vaccine' },
  { value: 'skip', label: "Don't import" },
]

const RECORD_LABELS: Record<string, string> = { growth: '📏 Growth', visit: '🩺 Visits', vaccine: '💉 Vaccines', question: '❓ Questions' }

// Firebase's free plan allows 20,000 saves a day.
const DAILY_LIMIT = 18_000

interface Loaded {
  file: CsvFile
  mapping: Mapping
}

export function ImportSheet({ onClose }: { onClose: () => void }) {
  const { backend, family, baby, user, units, toast } = useBaby()
  const [files, setFiles] = useState<Loaded[]>([])
  const [readError, setReadError] = useState('')
  const [progress, setProgress] = useState<{ saved: number; total: number; label?: string } | null>(null)
  const [done, setDone] = useState<{ entries: number; records: number; removed: number } | null>(null)
  // Optional date range ('' = no limit), e.g. to leave out days logged on the wrong child.
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [replaceOld, setReplaceOld] = useState(false)

  const fallbackOrder: DateOrder = /^en-US|^en-CA|^es-US/.test(navigator.language) ? 'MDY' : 'DMY'

  const pickFiles = async (list: FileList | null) => {
    if (!list?.length) return
    setReadError('')
    try {
      const loaded = await Promise.all(
        [...list].map(async (f) => {
          const file = readCsv(f.name, await f.text())
          if (!file.headers.length || !file.rows.length) throw new Error(`${f.name} looks empty.`)
          const mapping = guessMapping(file, fallbackOrder)
          if (!/oz|ml/i.test(file.headers.join(' ') + file.rows.slice(0, 50).flat().join(' '))) mapping.volumeUnit = units.volume
          return { file, mapping }
        }),
      )
      setFiles((prev) => [...prev, ...loaded])
    } catch (err) {
      setReadError((err as Error).message || "Couldn't read that file. Is it a .csv file?")
    }
  }

  const results = useMemo(() => files.map(({ file, mapping }) => convert(file, mapping)), [files])
  const everything = useMemo(() => {
    const all: ImportResult = { entries: [], records: [], skipped: {} }
    for (const r of results) {
      all.entries.push(...r.entries)
      all.records.push(...r.records)
      for (const [k, n] of Object.entries(r.skipped)) all.skipped[k] = (all.skipped[k] ?? 0) + n
      all.birthDate ??= r.birthDate
    }
    return all
  }, [results])
  const times = [...everything.entries, ...everything.records].map((x) => x.time)
  const [firstDay, lastDay] = times.length ? [toInputDate(Math.min(...times)), toInputDate(Math.max(...times))] : ['', '']
  const total = useMemo(() => {
    const lo = from ? startOfDay(fromInputDate(from)) : -Infinity
    const hi = to ? addDays(startOfDay(fromInputDate(to)), 1) : Infinity
    const inRange = (x: { time: number }) => x.time >= lo && x.time < hi
    const outside = [...everything.entries, ...everything.records].filter((x) => !inRange(x)).length
    return {
      ...everything,
      entries: everything.entries.filter(inRange),
      records: everything.records.filter(inRange),
      skipped: outside ? { ...everything.skipped, 'Outside the dates you picked': outside } : everything.skipped,
    }
  }, [everything, from, to])
  const birthMismatch = everything.birthDate != null && startOfDay(everything.birthDate) !== startOfDay(baby.birthDate) ? everything.birthDate : null
  const count = total.entries.length + total.records.length

  const update = (i: number, change: Partial<Mapping>) =>
    setFiles((prev) => prev.map((f, j) => (j === i ? { ...f, mapping: { ...f.mapping, ...change } } : f)))

  const startImport = async () => {
    try {
      let removed = 0
      if (replaceOld) {
        setProgress({ saved: 0, total: count, label: 'Removing what you imported before…' })
        removed = await backend.deleteImported(family.id, baby.id)
      }
      setProgress({ saved: 0, total: count })
      await backend.importAll(family.id, baby.id, user, total, (saved, all) => setProgress({ saved, total: all }))
      setDone({ entries: total.entries.length, records: total.records.length, removed })
    } catch (err) {
      console.error(err)
      toast("Import stopped. Check your connection and try again; rows already saved won't be doubled.")
      setProgress(null)
    }
  }

  if (done) {
    return (
      <Sheet title="Import finished" onClose={onClose}>
        <p className="text-center text-5xl">🎉</p>
        <p className="text-center">
          Imported <strong>{done.entries.toLocaleString()}</strong> log entries
          {done.records ? (
            <>
              {' '}
              and <strong>{done.records.toLocaleString()}</strong> health records
            </>
          ) : null}{' '}
          to {baby.name}'s history.
        </p>
        {done.removed > 0 && (
          <p className="text-center text-sm text-slate-600 dark:text-slate-300">Replaced {done.removed.toLocaleString()} {done.removed === 1 ? 'item' : 'items'} from earlier imports.</p>
        )}
        <p className="text-center text-sm text-slate-500 dark:text-slate-400">Find them in the History, Health and Growth tabs.</p>
        <Button className="w-full" onClick={onClose}>
          Done
        </Button>
      </Sheet>
    )
  }

  if (progress) {
    return (
      <Sheet title="Importing…" onClose={() => {}}>
        <p>{progress.label ?? `Saving ${progress.total.toLocaleString()} items.`} Keep the app open.</p>
        <div className="h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
          <div className="h-full bg-teal-600 transition-all" style={{ width: `${(progress.saved / Math.max(1, progress.total)) * 100}%` }} />
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {progress.saved.toLocaleString()} of {progress.total.toLocaleString()}
        </p>
      </Sheet>
    )
  }

  return (
    <Sheet title="Import from another app" onClose={onClose}>
      {files.length === 0 && (
        <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
          <p>
            Bring your history over from apps like Nara, Huckleberry, Baby Tracker or Sprout. In your old app, look for <strong>Export</strong>,{' '}
            <strong>Share data</strong> or <strong>Download CSV</strong> (usually in its settings), and save the file to your phone.
          </p>
          <p>
            Everything is added to <strong>{baby.name}</strong>'s log. You'll see what will be imported before anything is saved, and importing the same file
            twice won't create duplicates.
          </p>
        </div>
      )}

      {files.map(({ file, mapping }, i) => (
        <FileCard key={i} file={file} mapping={mapping} result={results[i]} onChange={(c) => update(i, c)} onRemove={() => setFiles(files.filter((_, j) => j !== i))} />
      ))}

      <label className="block">
        <span className="flex min-h-12 w-full cursor-pointer items-center justify-center rounded-xl bg-white px-4 font-semibold text-slate-900 ring-1 ring-slate-300 active:bg-slate-100 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-600">
          {files.length ? '+ Add another file' : 'Choose CSV file(s)'}
        </span>
        <input type="file" accept=".csv,.txt,text/csv,text/plain" multiple className="sr-only" onChange={(e) => (pickFiles(e.target.files), (e.target.value = ''))} />
      </label>
      {readError && <p className="text-sm text-red-600">{readError}</p>}

      {birthMismatch != null && (
        <Card skin="bg-amber-50 ring-1 ring-amber-200 dark:bg-amber-950 dark:ring-amber-900" className="space-y-2 text-sm text-amber-950 dark:text-amber-100">
          <p>
            This file says the baby was born on <strong>{fmtDate(birthMismatch)}</strong>, but {baby.name}'s birth date here is{' '}
            <strong>{fmtDate(baby.birthDate)}</strong>. Same-age comparisons use the birth date, so it's worth getting right.
          </p>
          <p className="text-xs">If this file isn't {baby.name}'s, close this and switch baby in Settings first.</p>
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => backend.saveBaby(family.id, { ...baby, birthDate: startOfDay(birthMismatch) + 12 * 3_600_000 }).catch(() => toast("Couldn't update the birth date."))}
          >
            Change {baby.name}'s birth date to {fmtDate(birthMismatch)}
          </Button>
        </Card>
      )}

      {files.length > 0 && firstDay && (
        <Card className="space-y-2">
          <div className="font-semibold">Dates to import</div>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            The file covers {fmtDate(fromInputDate(firstDay))} to {fmtDate(fromInputDate(lastDay))}. Narrow it to leave out days, for example ones logged on the
            wrong child.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From">
              <Input type="date" value={from || firstDay} min={firstDay} max={to || lastDay} onChange={(e) => setFrom(e.target.value === firstDay ? '' : e.target.value)} />
            </Field>
            <Field label="To">
              <Input type="date" value={to || lastDay} min={from || firstDay} max={lastDay} onChange={(e) => setTo(e.target.value === lastDay ? '' : e.target.value)} />
            </Field>
          </div>
        </Card>
      )}

      {files.length > 0 && <Summary result={total} />}

      {files.length > 0 && (
        <label className="flex items-start gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
          <input type="checkbox" checked={replaceOld} onChange={(e) => setReplaceOld(e.target.checked)} className="mt-1 size-5 accent-teal-700" />
          <span className="text-sm">
            <span className="block font-semibold">Replace what I imported before</span>
            <span className="text-slate-600 dark:text-slate-300">
              First removes everything earlier imports added to {baby.name}'s log. Entries you added in Sip &amp; Snooze are kept. Use this to redo an
              import that came out wrong.
            </span>
          </span>
        </label>
      )}

      {count > DAILY_LIMIT && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-900">
          That's more than the free plan can save in one day ({DAILY_LIMIT.toLocaleString()}). Import one file today and the rest tomorrow.
        </p>
      )}

      {files.length > 0 && (
        <Button className="sticky bottom-2 w-full shadow-lg" disabled={!count || count > DAILY_LIMIT} onClick={startImport}>
          {count ? `Import ${count.toLocaleString()} item${count === 1 ? '' : 's'}` : 'Nothing to import yet'}
        </Button>
      )}
    </Sheet>
  )
}

function FileCard({
  file,
  mapping: m,
  result,
  onChange,
  onRemove,
}: {
  file: CsvFile
  mapping: Mapping
  result: ImportResult
  onChange: (c: Partial<Mapping>) => void
  onRemove: () => void
}) {
  const [open, setOpen] = useState(false)
  const ours = isOurs(file.headers)
  const found = result.entries.length + result.records.length
  const sample = (i: number) => file.rows.find((r) => r[i])?.[i] ?? ''
  const cols = file.headers.map((h, i) => ({ value: String(i), label: `${h || `Column ${i + 1}`}${sample(i) ? ` (e.g. ${sample(i).slice(0, 24)})` : ''}` }))
  const values = m.type != null ? activityValues(file, m.type) : []
  const childValues = m.child != null ? [...new Set(file.rows.map((r) => r[m.child!]))] : []

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-semibold">📄 {file.name}</div>
          <div className="text-sm text-slate-500 dark:text-slate-400">
            {file.rows.length.toLocaleString()} {file.rows.length === 1 ? 'row' : 'rows'} · {found.toLocaleString()} ready to import
          </div>
        </div>
        <button type="button" onClick={onRemove} aria-label={`Remove ${file.name}`} className="size-10 shrink-0 text-xl text-slate-400">
          ×
        </button>
      </div>

      {ours ? (
        <p className="text-sm text-teal-800 dark:text-teal-300">✓ This is a Sip & Snooze export. Everything will come back exactly.</p>
      ) : (
        <>
          {childValues.length > 1 && (
            <Field label="This file has more than one child. Import rows for:">
              <Select value={m.childValue ?? ''} onChange={(v) => onChange({ childValue: v })} options={childValues.map((v) => ({ value: v, label: v || '(blank)' }))} />
            </Field>
          )}

          {m.type != null ? (
            <div>
              <div className="mb-1 text-sm font-medium text-slate-600 dark:text-slate-300">What each activity becomes</div>
              <ul className="divide-y divide-slate-200 rounded-xl ring-1 ring-slate-200 dark:divide-slate-700 dark:ring-slate-700">
                {values.map((v) => (
                  <li key={v.key} className="flex items-center gap-2 px-3 py-2">
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="block truncate font-medium">{v.value}</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {v.count.toLocaleString()} {v.count === 1 ? 'row' : 'rows'}
                      </span>
                    </span>
                    <Select
                      className="w-36 shrink-0"
                      value={m.typeMap[v.key] ?? 'skip'}
                      onChange={(t) => onChange({ typeMap: { ...m.typeMap, [v.key]: t as Target } })}
                      options={TARGETS}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <Field label="Every row in this file is a">
              <Select value={m.fixedType} onChange={(t) => onChange({ fixedType: t as Target })} options={TARGETS} />
            </Field>
          )}

          <button type="button" onClick={() => setOpen(!open)} className="text-sm font-semibold text-teal-700 dark:text-teal-400">
            {open ? 'Hide' : 'Check'} which column is which {open ? '▲' : '▼'}
          </button>
          {open && (
            <div className="space-y-3">
              <Field label="Date (or date and time)">
                <Select value={String(m.date)} onChange={(v) => onChange({ date: +v })} options={cols} />
              </Field>
              <Field label="Time, if it's in its own column">
                <ColumnSelect value={m.time} onChange={(time) => onChange({ time })} cols={cols} />
              </Field>
              <Field label="End time (optional)">
                <ColumnSelect value={m.end} onChange={(end) => onChange({ end })} cols={cols} />
              </Field>
              <Field label="Activity">
                <ColumnSelect
                  value={m.type}
                  noneLabel="— every row is the same activity —"
                  onChange={(type) =>
                    onChange({
                      type,
                      typeMap: type == null ? {} : Object.fromEntries(activityValues(file, type).map((v) => [v.key, m.typeMap[v.key] ?? guessTarget(v.value)])),
                    })
                  }
                  cols={cols}
                />
              </Field>
              <Field label="Notes (optional)">
                <ColumnSelect value={m.note} onChange={(note) => onChange({ note })} cols={cols} />
              </Field>
              <Field label="Dates are written">
                <Segmented
                  options={[
                    { value: 'MDY', label: 'M/D/Y' },
                    { value: 'DMY', label: 'D/M/Y' },
                    { value: 'YMD', label: 'Y-M-D' },
                  ]}
                  value={m.dateOrder}
                  onChange={(dateOrder) => onChange({ dateOrder })}
                />
              </Field>
              <Field label="Amounts with no unit are in">
                <Segmented
                  options={[
                    { value: 'ml', label: 'ml' },
                    { value: 'oz', label: 'oz' },
                  ]}
                  value={m.volumeUnit}
                  onChange={(volumeUnit) => onChange({ volumeUnit })}
                />
              </Field>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Amounts, durations, sides, diaper kinds and milk types are read from the other columns automatically.
              </p>
            </div>
          )}
        </>
      )}
    </Card>
  )
}


function Summary({ result }: { result: ImportResult }) {
  const { units } = useBaby()
  const byType = new Map<string, number>()
  for (const e of result.entries) byType.set(e.type, (byType.get(e.type) ?? 0) + 1)
  const recordTypes = new Map<string, number>()
  for (const r of result.records) recordTypes.set(r.type, (recordTypes.get(r.type) ?? 0) + 1)
  const times = [...result.entries, ...result.records].map((x) => x.time)
  const newest = [...result.entries].sort((a, b) => b.time - a.time).slice(0, 5)
  const skipped = Object.entries(result.skipped).sort((a, b) => b[1] - a[1])

  return (
    <Card className="space-y-3">
      <div className="font-semibold">What will be imported</div>
      {times.length ? (
        <>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            From {fmtDate(Math.min(...times))} to {fmtDate(Math.max(...times))}
          </p>
          <div className="flex flex-wrap gap-2">
            {[...byType].map(([t, n]) => (
              <Chip key={t}>
                {ENTRY_ICONS[t as Entry['type']]} {n.toLocaleString()}
              </Chip>
            ))}
            {[...recordTypes].map(([t, n]) => (
              <Chip key={t}>
                {RECORD_LABELS[t]} {n.toLocaleString()}
              </Chip>
            ))}
          </div>
          {newest.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-medium text-slate-500 uppercase dark:text-slate-400">Most recent, as they'll appear</div>
              <ul className="space-y-1 text-sm">
                {newest.map((e) => (
                  <li key={e.id} className="flex gap-2">
                    <span aria-hidden>{ENTRY_ICONS[e.type]}</span>
                    <span className="flex-1">{entryTitle({ ...e, by: '', byName: '', updatedAt: 0 }, units, Date.now())}</span>
                    <span className="text-slate-500 dark:text-slate-400">
                      {fmtDay(e.time)} {fmtTime(e.time)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-slate-600 dark:text-slate-300">Nothing yet. Check what each activity becomes above.</p>
      )}
      {skipped.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-slate-600 dark:text-slate-300">
            {(() => {
              const n = skipped.reduce((sum, [, c]) => sum + c, 0)
              return `${n.toLocaleString()} ${n === 1 ? 'row' : 'rows'} will be left out`
            })()}
          </summary>
          <ul className="mt-1 list-disc pl-5 text-slate-500 dark:text-slate-400">
            {skipped.map(([reason, n]) => (
              <li key={reason}>
                {reason}: {n.toLocaleString()}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  )
}

function Chip({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-teal-50 px-3 py-1 text-sm font-semibold text-teal-900 ring-1 ring-teal-200 dark:bg-slate-900 dark:text-teal-200 dark:ring-slate-600">{children}</span>
}

const selectClass =
  'block min-h-11 rounded-xl bg-white px-2 text-sm ring-1 ring-slate-300 outline-none focus:ring-2 focus:ring-teal-600 dark:bg-slate-900 dark:ring-slate-600'

function Select({
  value,
  onChange,
  options,
  className = 'w-full',
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  className?: string
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={cx(selectClass, className)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

function ColumnSelect({
  value,
  onChange,
  cols,
  noneLabel = '— none —',
}: {
  value: number | null
  onChange: (v: number | null) => void
  cols: { value: string; label: string }[]
  noneLabel?: string
}) {
  return <Select value={value == null ? '' : String(value)} onChange={(v) => onChange(v === '' ? null : +v)} options={[{ value: '', label: noneLabel }, ...cols]} />
}
