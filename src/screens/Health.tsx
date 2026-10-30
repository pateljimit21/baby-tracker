import { useMemo, useState } from 'react'
import { EntrySheet } from '../components/EntrySheet'
import { RecordSheet } from '../components/RecordSheet'
import { Button, Card, Empty, Input, SectionTitle, cx } from '../components/ui'
import { newId } from '../lib/backend'
import { fmtAgo, fmtDate, fmtDay, fmtTemp, fmtTime, startOfDay } from '../lib/format'
import { useNow } from '../lib/prefs'
import { useBaby } from '../state'
import type { Entry, HealthRecord } from '../types'

export function Health() {
  const { records, entries, units } = useBaby()
  const now = useNow(60_000)
  const [recordSheet, setRecordSheet] = useState<{ type: 'visit' | 'vaccine'; record?: HealthRecord } | null>(null)
  const [entrySheet, setEntrySheet] = useState<{ type: 'med' | 'temp'; entry?: Entry } | null>(null)

  const visits = records.filter((r) => r.type === 'visit')
  const vaccines = records.filter((r) => r.type === 'vaccine')
  const upcoming = visits
    .filter((v) => v.followUp && v.followUp >= startOfDay(now))
    .sort((a, b) => a.followUp! - b.followUp!)
  const temps = entries.filter((e) => e.type === 'temp').slice(0, 5)
  const lastByMed = useMemo(() => {
    const seen = new Map<string, Entry>()
    for (const e of entries) if (e.type === 'med' && e.medName && !seen.has(e.medName.toLowerCase())) seen.set(e.medName.toLowerCase(), e)
    return [...seen.values()]
  }, [entries])

  return (
    <>
      {upcoming.length > 0 && (
        <Card skin="bg-sky-50 ring-1 ring-sky-200 dark:bg-sky-950 dark:ring-sky-900">
          <div className="text-sm font-semibold text-sky-900 dark:text-sky-200">Upcoming appointments</div>
          {upcoming.map((v) => (
            <button key={v.id} type="button" onClick={() => setRecordSheet({ type: 'visit', record: v })} className="mt-2 block w-full text-left">
              <span className="font-semibold">
                {fmtDay(v.followUp!, now)} at {fmtTime(v.followUp!)}
              </span>
              <span className="block text-sm text-slate-600 dark:text-slate-300">
                Follow-up: {[v.reason, v.place, v.doctor].filter(Boolean).join(' · ')}
              </span>
            </button>
          ))}
        </Card>
      )}

      <Questions />

      <SectionTitle action={<AddButton onClick={() => setRecordSheet({ type: 'visit' })} />}>Visits</SectionTitle>
      {visits.length ? (
        <List>
          {visits.map((v) => (
            <Row key={v.id} onClick={() => setRecordSheet({ type: 'visit', record: v })} title={v.reason || v.place || 'Visit'} sub={[fmtDate(v.time), v.place, v.doctor].filter(Boolean).join(' · ')} detail={v.note} />
          ))}
        </List>
      ) : (
        <Empty>No visits yet. Add one after each checkup or hospital trip.</Empty>
      )}

      <SectionTitle action={<AddButton onClick={() => setEntrySheet({ type: 'med' })} />}>Medicines</SectionTitle>
      {lastByMed.length ? (
        <List>
          {lastByMed.map((e) => (
            <Row key={e.id} onClick={() => setEntrySheet({ type: 'med' })} title={e.medName!} sub={`Last given ${fmtAgo(e.time, now)} (${fmtDay(e.time, now)} ${fmtTime(e.time)})${e.dose ? ` · ${e.dose}` : ''}`} />
          ))}
        </List>
      ) : (
        <Empty>No medicine in the last week.</Empty>
      )}

      <SectionTitle action={<AddButton onClick={() => setEntrySheet({ type: 'temp' })} />}>Temperature</SectionTitle>
      {temps.length ? (
        <List>
          {temps.map((e) => (
            <Row key={e.id} onClick={() => setEntrySheet({ type: 'temp', entry: e })} title={fmtTemp(e.tempC ?? 0, units.temp)} sub={`${fmtDay(e.time, now)} ${fmtTime(e.time)}${e.note ? ` · ${e.note}` : ''}`} />
          ))}
        </List>
      ) : (
        <Empty>No temperatures in the last week.</Empty>
      )}

      <SectionTitle action={<AddButton onClick={() => setRecordSheet({ type: 'vaccine' })} />}>Vaccines</SectionTitle>
      {vaccines.length ? (
        <List>
          {vaccines.map((v) => (
            <Row key={v.id} onClick={() => setRecordSheet({ type: 'vaccine', record: v })} title={v.vaccine!} sub={fmtDate(v.time)} detail={v.note} />
          ))}
        </List>
      ) : (
        <Empty>No vaccines recorded yet.</Empty>
      )}

      {recordSheet && <RecordSheet type={recordSheet.type} record={recordSheet.record} onClose={() => setRecordSheet(null)} />}
      {entrySheet && <EntrySheet type={entrySheet.type} entry={entrySheet.entry} onClose={() => setEntrySheet(null)} />}
    </>
  )
}

/** Things to ask at the next appointment. Anyone in the family can add one. */
function Questions() {
  const { records, saveRecord, deleteRecord } = useBaby()
  const [text, setText] = useState('')
  const [showDone, setShowDone] = useState(false)
  const questions = records.filter((r) => r.type === 'question')
  const open = questions.filter((q) => !q.done)
  const done = questions.filter((q) => q.done)

  const add = () => {
    if (!text.trim()) return
    saveRecord({ id: newId(), type: 'question', time: Date.now(), text: text.trim(), done: false })
    setText('')
  }

  return (
    <>
      <SectionTitle>Questions for the doctor</SectionTitle>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Is this rash normal?" />
        <Button type="submit" disabled={!text.trim()}>
          Add
        </Button>
      </form>
      {open.length > 0 && (
        <List className="mt-2">
          {open.map((q) => (
            <Question key={q.id} q={q} onToggle={() => saveRecord({ ...q, done: true })} onDelete={() => deleteRecord(q.id)} />
          ))}
        </List>
      )}
      {done.length > 0 && (
        <button type="button" onClick={() => setShowDone(!showDone)} className="mt-2 px-1 text-sm font-medium text-teal-700 dark:text-teal-400">
          {showDone ? 'Hide' : 'Show'} asked questions ({done.length})
        </button>
      )}
      {showDone && done.length > 0 && (
        <List className="mt-2">
          {done.map((q) => (
            <Question key={q.id} q={q} onToggle={() => saveRecord({ ...q, done: false })} onDelete={() => deleteRecord(q.id)} />
          ))}
        </List>
      )}
    </>
  )
}

function Question({ q, onToggle, onDelete }: { q: HealthRecord; onToggle: () => void; onDelete: () => void }) {
  return (
    <li className="flex items-center gap-3 px-4 py-2">
      <input type="checkbox" checked={!!q.done} onChange={onToggle} aria-label="Asked" className="size-6 accent-teal-700" />
      <span className={cx('flex-1', q.done && 'text-slate-400 line-through')}>
        {q.text}
        <span className="block text-xs text-slate-500 no-underline dark:text-slate-400">Added by {q.byName}</span>
      </span>
      <button type="button" onClick={() => confirm('Delete this question?') && onDelete()} aria-label="Delete" className="size-10 text-xl text-slate-400">
        ×
      </button>
    </li>
  )
}

function List({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <ul className={cx('divide-y divide-slate-200 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200 dark:divide-slate-700 dark:bg-slate-800 dark:ring-slate-700', className)}>
      {children}
    </ul>
  )
}

function Row({ title, sub, detail, onClick }: { title: string; sub: string; detail?: string; onClick: () => void }) {
  return (
    <li>
      <button type="button" onClick={onClick} className="w-full px-4 py-3 text-left active:bg-slate-100 dark:active:bg-slate-700">
        <span className="block font-medium">{title}</span>
        <span className="block text-sm text-slate-500 dark:text-slate-400">{sub}</span>
        {detail && <span className="mt-1 block text-sm whitespace-pre-line text-slate-700 dark:text-slate-300">{detail}</span>}
      </button>
    </li>
  )
}

function AddButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="min-h-10 rounded-full px-3 text-sm font-semibold text-teal-700 active:bg-teal-50 dark:text-teal-400 dark:active:bg-slate-800">
      + Add
    </button>
  )
}

export { List, Row, AddButton }
