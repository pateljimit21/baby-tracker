import { useMemo, useState, type ReactNode } from 'react'
import { newId } from '../lib/backend'
import {
  breastSeconds,
  cTo,
  fmtAgo,
  fmtClock,
  fmtTime,
  fmtVolume,
  fromInputDateTime,
  lastBreastSide,
  mlTo,
  toC,
  toInputDateTime,
  toMl,
} from '../lib/format'
import { usePref, useNow } from '../lib/prefs'
import { useBaby } from '../state'
import type { Entry, EntryType, Meal } from '../types'
import { MeasureField, TEMP_OPTIONS, UnitSwitch, VOLUME_OPTIONS, useEntryUnits } from './UnitSwitch'
import { Button, Field, Input, NumberInput, Segmented, Sheet, TextArea, cx, parseNum } from './ui'

const TITLES: Record<EntryType | 'combo', string> = {
  bottle: 'Bottle feed',
  breast: 'Breastfeed',
  solid: 'Solids',
  combo: 'Combo feed',
  pump: 'Pumping',
  diaper: 'Diaper',
  sleep: 'Sleep',
  med: 'Medicine',
  temp: 'Temperature',
}

// Forms with a single Save get it in the sheet header too, like Nara; it submits this form.
const FORM_ID = 'entry-form'
const HEADER_SAVE = new Set(['bottle', 'solid', 'combo'])

/** Add a new entry of `type`, or edit `entry`. 'combo' logs a breastfeed and a top-up bottle together. */
export function EntrySheet({ type, entry, onClose }: { type: EntryType | 'combo'; entry?: Entry; onClose: () => void }) {
  return (
    <Sheet
      title={(entry ? 'Edit ' : '') + (entry ? TITLES[type].toLowerCase() : TITLES[type])}
      onClose={onClose}
      action={
        HEADER_SAVE.has(type) && (
          <button type="submit" form={FORM_ID} className="min-h-10 rounded-full px-3 font-bold text-teal-700 dark:text-teal-300">
            Save
          </button>
        )
      }
    >
      {type === 'bottle' && <BottleForm entry={entry} onDone={onClose} />}
      {type === 'breast' && <BreastForm entry={entry} onDone={onClose} />}
      {type === 'solid' && <SolidForm entry={entry} onDone={onClose} />}
      {type === 'combo' && <ComboForm onDone={onClose} />}
      {type === 'pump' && <PumpForm entry={entry} onDone={onClose} />}
      {type === 'diaper' && <DiaperForm entry={entry} onDone={onClose} />}
      {type === 'sleep' && <SleepForm entry={entry} onDone={onClose} />}
      {type === 'med' && <MedForm entry={entry} onDone={onClose} />}
      {type === 'temp' && <TempForm entry={entry} onDone={onClose} />}
    </Sheet>
  )
}

/** Wraps a form so the header Save (and Enter on the keyboard) saves it. */
function SaveForm({ onSave, children }: { onSave: () => void; children: ReactNode }) {
  return (
    <form
      id={FORM_ID}
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        onSave()
      }}
    >
      {children}
    </form>
  )
}

interface FormProps {
  entry?: Entry
  onDone: () => void
}

/** Time, note, Save and Delete: shared by every form. */
function useCommon(entry: Entry | undefined) {
  const [time, setTime] = useState(() => toInputDateTime(entry?.time ?? Date.now()))
  const [note, setNote] = useState(entry?.note ?? '')
  return { time, setTime, note, setNote, base: { id: entry?.id ?? newId(), time: fromInputDateTime(time), note: note.trim() || undefined } }
}

function TimeField({ label = 'Time', value, onChange }: { label?: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <Input type="datetime-local" value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  )
}

function NoteField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Field label="Note (optional)">
      <TextArea value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  )
}

function Actions({ entry, onSave, onDone, saveLabel = 'Save', disabled }: FormProps & { onSave?: () => void; saveLabel?: string; disabled?: boolean }) {
  const { deleteEntry } = useBaby()
  return (
    <div className="space-y-2 pt-2">
      {onSave && (
        <Button className="w-full" onClick={onSave} disabled={disabled}>
          {saveLabel}
        </Button>
      )}
      {entry && (
        <Button
          variant="danger"
          className="w-full"
          onClick={() => {
            if (confirm('Delete this entry?')) {
              deleteEntry(entry.id)
              onDone()
            }
          }}
        >
          Delete
        </Button>
      )}
    </div>
  )
}

function Chips({ values, onPick, format }: { values: number[]; onPick: (v: number) => void; format: (v: number) => ReactNode }) {
  return (
    <div className="flex flex-wrap gap-2">
      {values.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onPick(v)}
          className="min-h-10 rounded-full bg-teal-50 px-4 text-sm font-semibold text-teal-800 ring-1 ring-teal-200 active:bg-teal-100 dark:bg-slate-900 dark:text-teal-300 dark:ring-slate-600"
        >
          {format(v)}
        </button>
      ))}
    </div>
  )
}

// --- bottle ---

/** Catches a likely unit mix-up (120 typed with fl oz on, or 4 with ml on) with a one-tap fix. */
function UnitHint({ total, vol, onSwitch }: { total: number; vol: 'ml' | 'oz'; onSwitch: (v: 'ml' | 'oz') => void }) {
  const other = vol === 'oz' && total > 12 ? 'ml' : vol === 'ml' && total > 0 && total < 5 ? 'oz' : null
  if (!other) return null
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-950 ring-1 ring-amber-200 dark:bg-amber-950 dark:text-amber-100 dark:ring-amber-900">
      <span>
        {Math.round(total * 100) / 100} {vol === 'oz' ? 'fl oz' : 'ml'} is {vol === 'oz' ? 'a lot' : 'very little'} for one bottle. Did you mean {other === 'oz' ? 'fl oz' : 'ml'}?
      </span>
      <Button variant="secondary" className="min-h-10 shrink-0 px-3" onClick={() => onSwitch(other)}>
        Use {other === 'oz' ? 'fl oz' : 'ml'}
      </Button>
    </div>
  )
}

type Milk = NonNullable<Entry['milk']>

/** Breast milk / formula as two big round buttons, like Nara. Both on = a mixed bottle. */
function MilkPicker({ bm, fm, onChange }: { bm: boolean; fm: boolean; onChange: (bm: boolean, fm: boolean) => void }) {
  const round = (on: boolean) =>
    cx(
      'flex size-24 items-center justify-center rounded-full text-center text-base leading-tight font-bold ring-2 transition-colors',
      on
        ? 'bg-teal-700 text-white ring-teal-700 dark:bg-teal-600 dark:ring-teal-600'
        : 'bg-white text-teal-800 ring-teal-300 dark:bg-slate-900 dark:text-teal-300 dark:ring-slate-600',
    )
  return (
    <div>
      <div className="flex justify-center gap-6">
        <button type="button" aria-pressed={bm} aria-label="Breast milk" className={round(bm)} onClick={() => onChange(!bm, fm)}>
          Breast
          <br />
          milk
        </button>
        <button type="button" aria-pressed={fm} className={round(fm)} onClick={() => onChange(bm, !fm)}>
          Formula
        </button>
      </div>
      <p className="mt-2 text-center text-xs text-slate-500 dark:text-slate-400">Pick both for a bottle with some of each.</p>
    </div>
  )
}

const milkOf = (bm: boolean, fm: boolean): Milk | undefined => (bm && fm ? 'mixed' : bm ? 'breastmilk' : fm ? 'formula' : undefined)

/** Amount fields for a bottle: one box, or two when it's breast milk + formula. Shared by Bottle and Combo. */
function useBottleAmounts(entry: Entry | undefined) {
  const { entries } = useBaby()
  const { volume: vol, setVolume: setVol } = useEntryUnits()
  const [lastMilk, setLastMilk] = usePref<Milk>('last-milk', 'formula')
  const start = entry?.milk ?? lastMilk
  const [bmOn, setBmOn] = useState(start === 'breastmilk' || start === 'mixed')
  const [fmOn, setFmOn] = useState(start === 'formula' || start === 'mixed')
  const show = (ml?: number) => (ml != null ? String(mlTo(ml, vol)) : '')
  const [amount, setAmount] = useState(entry?.milk !== 'mixed' ? show(entry?.amountMl) : '')
  const [bm, setBm] = useState(entry?.milk === 'mixed' ? show(entry.breastMilkMl) : '')
  const [fm, setFm] = useState(entry?.milk === 'mixed' ? show((entry.amountMl ?? 0) - (entry.breastMilkMl ?? 0)) : '')
  const milk = milkOf(bmOn, fmOn)
  const total = milk === 'mixed' ? (parseNum(bm) ?? 0) + (parseNum(fm) ?? 0) : (parseNum(amount) ?? 0)
  const lastBottle = entries.find((e) => e.type === 'bottle' && e.id !== entry?.id && e.amountMl)

  const useLast = () => {
    if (!lastBottle) return
    if (lastBottle.milk === 'mixed') {
      setBmOn(true)
      setFmOn(true)
      setBm(show(lastBottle.breastMilkMl))
      setFm(show((lastBottle.amountMl ?? 0) - (lastBottle.breastMilkMl ?? 0)))
    } else {
      setAmount(show(lastBottle.amountMl))
      if (lastBottle.milk) {
        setBmOn(lastBottle.milk === 'breastmilk')
        setFmOn(lastBottle.milk === 'formula')
      }
    }
  }

  /** The bottle part of an entry, or null if no amount was given. */
  const toEntry = (): Pick<Entry, 'amountMl' | 'milk' | 'breastMilkMl'> | null => {
    if (total <= 0) return null
    if (milk) setLastMilk(milk)
    if (milk === 'mixed') {
      const bmMl = toMl(parseNum(bm) ?? 0, vol)
      return { amountMl: bmMl + toMl(parseNum(fm) ?? 0, vol), milk, breastMilkMl: bmMl }
    }
    return { amountMl: toMl(total, vol), milk, breastMilkMl: undefined }
  }

  const unitSwitch = <UnitSwitch label="Amount unit" value={vol} options={VOLUME_OPTIONS} onChange={setVol} />
  const quick = vol === 'ml' ? [30, 60, 90, 120, 150, 180] : [1, 1.5, 2, 2.5, 3, 3.5, 4, 5]
  const fields = (autoFocus: boolean) => (
    <>
      <MilkPicker
        bm={bmOn}
        fm={fmOn}
        onChange={(b, f) => {
          setBmOn(b)
          setFmOn(f)
        }}
      />
      {milk === 'mixed' ? (
        <>
          <MeasureField label="Amounts" unit={unitSwitch}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Breast milk">
                <NumberInput value={bm} onChange={setBm} placeholder="0" autoFocus={autoFocus} className="text-xl font-semibold" />
              </Field>
              <Field label="Formula">
                <NumberInput value={fm} onChange={setFm} placeholder="0" className="text-xl font-semibold" />
              </Field>
            </div>
          </MeasureField>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Total: {Math.round(total * 100) / 100} {vol === 'oz' ? 'fl oz' : 'ml'}
          </p>
        </>
      ) : (
        <>
          <MeasureField label="Amount" unit={unitSwitch}>
            <NumberInput value={amount} onChange={setAmount} placeholder="0" autoFocus={autoFocus} className="text-2xl font-semibold" />
          </MeasureField>
          <Chips values={quick} onPick={(v) => setAmount(String(v))} format={(v) => `${v} ${vol}`} />
        </>
      )}
      <UnitHint total={total} vol={vol} onSwitch={setVol} />
      {!entry && lastBottle && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
          <span className="text-sm font-medium">
            Use last amount: {fmtVolume(lastBottle.amountMl ?? 0, vol)}
            {lastBottle.milk === 'mixed' ? ' (both)' : lastBottle.milk === 'breastmilk' ? ' breast milk' : lastBottle.milk === 'formula' ? ' formula' : ''}?
          </span>
          <Button variant="secondary" className="min-h-10 px-4" onClick={useLast}>
            Yes
          </Button>
        </div>
      )}
    </>
  )
  return { fields, toEntry, total }
}

function BottleForm({ entry, onDone }: FormProps) {
  const { saveEntry } = useBaby()
  const bottle = useBottleAmounts(entry)
  const c = useCommon(entry)

  const save = () => {
    const b = bottle.toEntry()
    if (!b) return
    saveEntry({ ...c.base, type: 'bottle', ...b })
    onDone()
  }

  return (
    <SaveForm onSave={save}>
      {bottle.fields(!entry)}
      <TimeField label="Start time" value={c.time} onChange={c.setTime} />
      <NoteField value={c.note} onChange={c.setNote} />
      <Actions entry={entry} onDone={onDone} onSave={save} disabled={bottle.total <= 0} />
    </SaveForm>
  )
}

// --- solids ---

const MEALS = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
] as const

function mealFor(t: number): Meal {
  const h = new Date(t).getHours()
  return h < 10 ? 'breakfast' : h < 14 ? 'lunch' : h >= 17 && h < 20 ? 'dinner' : 'snack'
}

function SolidForm({ entry, onDone }: FormProps) {
  const { entries, saveEntry } = useBaby()
  const c = useCommon(entry)
  const [food, setFood] = useState(entry?.food ?? '')
  const [meal, setMeal] = useState<Meal>(entry?.meal ?? mealFor(Date.now()))
  const recent = useMemo(
    () => [...new Set(entries.filter((e) => e.type === 'solid' && e.food).map((e) => e.food!))].slice(0, 8),
    [entries],
  )

  const save = () => {
    if (!food.trim()) return
    saveEntry({ ...c.base, type: 'solid', food: food.trim(), meal })
    onDone()
  }

  return (
    <SaveForm onSave={save}>
      <Field label="Food">
        <Input value={food} onChange={(e) => setFood(e.target.value)} placeholder="e.g. Oatmeal, banana" autoFocus={!entry} list="foods" />
        <datalist id="foods">
          {recent.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
      </Field>
      {!entry && recent.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {recent.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFood(f)}
              className="min-h-10 rounded-full bg-teal-50 px-4 text-sm font-semibold text-teal-800 ring-1 ring-teal-200 dark:bg-slate-900 dark:text-teal-300 dark:ring-slate-600"
            >
              {f}
            </button>
          ))}
        </div>
      )}
      <Segmented options={[...MEALS]} value={meal} onChange={setMeal} />
      <TimeField value={c.time} onChange={c.setTime} />
      <NoteField value={c.note} onChange={c.setNote} />
      <Actions entry={entry} onDone={onDone} onSave={save} disabled={!food.trim()} />
    </SaveForm>
  )
}

// --- combo: breastfeed, then a top-up bottle ---

function ComboForm({ onDone }: { onDone: () => void }) {
  const { saveEntry } = useBaby()
  const c = useCommon(undefined)
  const bottle = useBottleAmounts(undefined)
  const [left, setLeft] = useState('')
  const [right, setRight] = useState('')
  const l = Math.round((parseNum(left) ?? 0) * 60)
  const r = Math.round((parseNum(right) ?? 0) * 60)

  const save = () => {
    const b = bottle.toEntry()
    if (!b && !l && !r) return
    // Logged just after it happened (start time ≈ now)? Then the breastfeed ended now, not in the future.
    const start = Math.min(c.base.time, Date.now() - (l + r) * 1000)
    const breastEnd = start + (l + r) * 1000
    if (l || r)
      saveEntry({ id: newId(), type: 'breast', time: start, endTime: breastEnd, leftSec: l, rightSec: r, activeSide: null, activeSince: null, note: c.base.note })
    // The bottle comes right after the breastfeed.
    if (b) saveEntry({ id: newId(), type: 'bottle', time: breastEnd, ...b, note: l || r ? undefined : c.base.note })
    onDone()
  }

  return (
    <SaveForm onSave={save}>
      <p className="text-sm text-slate-600 dark:text-slate-300">Breastfed, then topped up with a bottle. Saved as two entries.</p>
      <div className="font-semibold">🤱 Breastfeed (minutes)</div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Left">
          <NumberInput value={left} onChange={setLeft} placeholder="0" autoFocus />
        </Field>
        <Field label="Right">
          <NumberInput value={right} onChange={setRight} placeholder="0" />
        </Field>
      </div>
      <div className="pt-2 font-semibold">🍼 Then a bottle</div>
      {bottle.fields(false)}
      <TimeField label="Start time" value={c.time} onChange={c.setTime} />
      <NoteField value={c.note} onChange={c.setNote} />
      <Actions onDone={onDone} onSave={save} disabled={bottle.total <= 0 && !l && !r} />
    </SaveForm>
  )
}

// --- pump ---

function PumpForm({ entry, onDone }: FormProps) {
  const { saveEntry } = useBaby()
  const { volume: vol, setVolume: setVol } = useEntryUnits()
  const show = (ml?: number) => (ml ? String(mlTo(ml, vol)) : '')
  const [left, setLeft] = useState(show(entry?.leftMl))
  const [right, setRight] = useState(show(entry?.rightMl))
  const c = useCommon(entry)
  const l = parseNum(left) ?? 0
  const r = parseNum(right) ?? 0

  const save = () => {
    saveEntry({ ...c.base, type: 'pump', leftMl: toMl(l, vol), rightMl: toMl(r, vol) })
    onDone()
  }

  return (
    <>
      <MeasureField label="Amount pumped" unit={<UnitSwitch label="Amount unit" value={vol} options={VOLUME_OPTIONS} onChange={setVol} />}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Left">
            <NumberInput value={left} onChange={setLeft} placeholder="0" autoFocus={!entry} />
          </Field>
          <Field label="Right">
            <NumberInput value={right} onChange={setRight} placeholder="0" />
          </Field>
        </div>
      </MeasureField>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Total: {Math.round((l + r) * 100) / 100} {vol === 'oz' ? 'fl oz' : 'ml'}
      </p>
      <TimeField value={c.time} onChange={c.setTime} />
      <NoteField value={c.note} onChange={c.setNote} />
      <Actions entry={entry} onDone={onDone} onSave={save} disabled={l + r <= 0} />
    </>
  )
}

// --- diaper ---

const DIAPERS = [
  { value: 'wet', label: '💧 Wet' },
  { value: 'dirty', label: '💩 Dirty' },
  { value: 'both', label: '💧💩 Both' },
] as const

function DiaperForm({ entry, onDone }: FormProps) {
  const { saveEntry } = useBaby()
  const [kind, setKind] = useState(entry?.diaper)
  const c = useCommon(entry)
  const save = (diaper: Entry['diaper']) => {
    saveEntry({ ...c.base, type: 'diaper', diaper })
    onDone()
  }

  return (
    <>
      {entry ? (
        <Segmented options={[...DIAPERS]} value={kind} onChange={setKind} />
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {DIAPERS.map((d) => (
            <Button key={d.value} variant="secondary" className="min-h-20 text-base" onClick={() => save(d.value)}>
              {d.label}
            </Button>
          ))}
        </div>
      )}
      <TimeField value={c.time} onChange={c.setTime} />
      <NoteField value={c.note} onChange={c.setNote} />
      {entry ? (
        <Actions entry={entry} onDone={onDone} onSave={() => save(kind)} />
      ) : (
        <p className="text-sm text-slate-500 dark:text-slate-400">Tap a button above to save.</p>
      )}
    </>
  )
}

// --- sleep ---

function SleepForm({ entry, onDone }: FormProps) {
  const { saveEntry } = useBaby()
  const now = useNow()
  const c = useCommon(entry)
  const [end, setEnd] = useState(() => (entry?.endTime ? toInputDateTime(entry.endTime) : ''))
  const [manual, setManual] = useState(false)

  if (entry && entry.endTime == null) {
    const start = fromInputDateTime(c.time)
    return (
      <>
        <div className="py-4 text-center">
          <div className="text-5xl font-bold tabular-nums">{fmtClock(now - start)}</div>
          <div className="mt-1 text-slate-500 dark:text-slate-400">Asleep since {fmtTime(start)}</div>
        </div>
        <Button
          className="min-h-16 w-full text-lg"
          onClick={() => {
            saveEntry({ ...entry, ...c.base, endTime: Date.now() })
            onDone()
          }}
        >
          ☀️ Woke up
        </Button>
        <TimeField label="Fell asleep at" value={c.time} onChange={c.setTime} />
        <NoteField value={c.note} onChange={c.setNote} />
        <Actions entry={entry} onDone={onDone} onSave={() => (saveEntry({ ...entry, ...c.base }), onDone())} saveLabel="Save changes" />
      </>
    )
  }

  if (!entry && !manual) {
    return (
      <>
        <Button
          className="min-h-20 w-full text-lg"
          onClick={() => {
            saveEntry({ id: newId(), type: 'sleep', time: Date.now(), endTime: null })
            onDone()
          }}
        >
          😴 Start sleep timer now
        </Button>
        <Button variant="secondary" className="w-full" onClick={() => setManual(true)}>
          Add a past sleep
        </Button>
      </>
    )
  }

  const endMs = end ? fromInputDateTime(end) : null
  const valid = endMs != null && endMs > c.base.time
  return (
    <>
      <TimeField label="Fell asleep" value={c.time} onChange={c.setTime} />
      <TimeField label="Woke up" value={end} onChange={setEnd} />
      {end && !valid && <p className="text-sm text-red-600">Woke up must be after fell asleep.</p>}
      <NoteField value={c.note} onChange={c.setNote} />
      <Actions
        entry={entry}
        onDone={onDone}
        disabled={!valid}
        onSave={() => {
          saveEntry({ ...c.base, type: 'sleep', endTime: endMs })
          onDone()
        }}
      />
    </>
  )
}

// --- breastfeeding ---

function BreastForm({ entry: editing, onDone }: FormProps) {
  const { entries, saveEntry } = useBaby()
  const now = useNow()
  const [manual, setManual] = useState(false)
  const c = useCommon(editing)
  const lastFinished = useMemo(() => entries.find((e) => e.type === 'breast' && e.endTime != null), [entries])
  const lastSide = lastBreastSide(lastFinished)
  // Always use the latest copy: side switches (from this phone or another) arrive through `entries`.
  // A timer someone already started takes over this sheet.
  const entry = editing
    ? (entries.find((e) => e.id === editing.id) ?? editing)
    : entries.find((e) => e.type === 'breast' && e.endTime == null)

  // Timer running: big Left / Right buttons that switch or pause.
  if (entry && entry.endTime == null) {
    const { left, right } = breastSeconds(entry, now)
    const tap = (side: 'L' | 'R') => {
      const t = Date.now()
      const s = breastSeconds(entry, t)
      const pause = entry.activeSide === side
      saveEntry({ ...entry, leftSec: s.left, rightSec: s.right, activeSide: pause ? null : side, activeSince: pause ? null : t })
    }
    const finish = () => {
      const t = Date.now()
      const s = breastSeconds(entry, t)
      saveEntry({ ...entry, note: c.base.note, leftSec: s.left, rightSec: s.right, activeSide: null, activeSince: null, endTime: t })
      onDone()
    }
    return (
      <>
        <div className="text-center text-slate-500 dark:text-slate-400">
          Total {fmtClock((left + right) * 1000)} · started {fmtTime(entry.time)}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <SideButton label="Left" seconds={left} active={entry.activeSide === 'L'} onClick={() => tap('L')} />
          <SideButton label="Right" seconds={right} active={entry.activeSide === 'R'} onClick={() => tap('R')} />
        </div>
        <p className="text-center text-sm text-slate-500 dark:text-slate-400">Tap a side to switch. Tap the running side to pause.</p>
        <Button className="min-h-14 w-full text-lg" onClick={finish}>
          Done
        </Button>
        <NoteField value={c.note} onChange={c.setNote} />
        <Actions entry={entry} onDone={onDone} />
      </>
    )
  }

  if (!entry && !manual) {
    const start = (side: 'L' | 'R') => {
      const t = Date.now()
      saveEntry({ id: newId(), type: 'breast', time: t, endTime: null, leftSec: 0, rightSec: 0, activeSide: side, activeSince: t })
    }
    const suggest = lastSide === 'L' ? 'R' : lastSide === 'R' ? 'L' : null
    return (
      <>
        {lastFinished && (
          <p className="text-center text-slate-600 dark:text-slate-300">
            Last feed ended {fmtAgo(lastFinished.endTime!, now)} on the {lastSide === 'L' ? 'left' : 'right'}.
            {suggest && (
              <>
                <br />
                <strong>Start on the {suggest === 'L' ? 'left' : 'right'}.</strong>
              </>
            )}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <SideButton label="Start left" highlight={suggest === 'L'} onClick={() => start('L')} />
          <SideButton label="Start right" highlight={suggest === 'R'} onClick={() => start('R')} />
        </div>
        <Button variant="secondary" className="w-full" onClick={() => setManual(true)}>
          Enter minutes instead
        </Button>
      </>
    )
  }

  // Manual entry, or editing a finished feed.
  return <BreastManual entry={entry} onDone={onDone} common={c} />
}

function BreastManual({ entry, onDone, common: c }: FormProps & { common: ReturnType<typeof useCommon> }) {
  const { saveEntry } = useBaby()
  const mins = (s?: number) => (s ? String(Math.round((s / 60) * 10) / 10) : '')
  const [left, setLeft] = useState(mins(entry?.leftSec))
  const [right, setRight] = useState(mins(entry?.rightSec))
  const l = Math.round((parseNum(left) ?? 0) * 60)
  const r = Math.round((parseNum(right) ?? 0) * 60)
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Left (minutes)">
          <NumberInput value={left} onChange={setLeft} placeholder="0" />
        </Field>
        <Field label="Right (minutes)">
          <NumberInput value={right} onChange={setRight} placeholder="0" />
        </Field>
      </div>
      <TimeField label="Started" value={c.time} onChange={c.setTime} />
      <NoteField value={c.note} onChange={c.setNote} />
      <Actions
        entry={entry}
        onDone={onDone}
        disabled={l + r <= 0}
        onSave={() => {
          saveEntry({
            ...c.base,
            type: 'breast',
            leftSec: l,
            rightSec: r,
            activeSide: null,
            activeSince: null,
            endTime: c.base.time + (l + r) * 1000,
          })
          onDone()
        }}
      />
    </>
  )
}

function SideButton({
  label,
  seconds,
  active,
  highlight,
  onClick,
}: {
  label: string
  seconds?: number
  active?: boolean
  highlight?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'flex min-h-32 flex-col items-center justify-center rounded-2xl text-lg font-semibold ring-2 transition-colors',
        active
          ? 'bg-teal-700 text-white ring-teal-700 dark:bg-teal-600 dark:ring-teal-600'
          : highlight
            ? 'bg-teal-50 text-teal-900 ring-teal-500 dark:bg-slate-900 dark:text-teal-200'
            : 'bg-white text-slate-800 ring-slate-300 dark:bg-slate-900 dark:text-slate-100 dark:ring-slate-600',
      )}
    >
      <span>{label}</span>
      {seconds != null && <span className="mt-1 text-3xl tabular-nums">{fmtClock(seconds * 1000)}</span>}
      {active && <span className="mt-1 text-xs font-medium opacity-80">running · tap to pause</span>}
    </button>
  )
}

// --- medicine ---

function MedForm({ entry, onDone }: FormProps) {
  const { entries, saveEntry } = useBaby()
  const now = useNow(30_000)
  const [name, setName] = useState(entry?.medName ?? '')
  const [dose, setDose] = useState(entry?.dose ?? '')
  const c = useCommon(entry)
  const meds = useMemo(() => [...new Set(entries.filter((e) => e.type === 'med').map((e) => e.medName ?? ''))].filter(Boolean), [entries])
  const lastDose = entries.find((e) => e.type === 'med' && e.id !== entry?.id && e.medName?.toLowerCase() === name.trim().toLowerCase())

  return (
    <>
      <Field label="Medicine">
        <Input value={name} onChange={(e) => setName(e.target.value)} list="med-names" placeholder="e.g. Vitamin D" autoFocus={!entry} />
        <datalist id="med-names">
          {meds.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </Field>
      {!entry && meds.length > 0 && <Chips values={meds.map((_, i) => i)} onPick={(i) => setName(meds[i])} format={(i) => meds[i]} />}
      {lastDose && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-900">
          Last given <strong>{fmtAgo(lastDose.time, now)}</strong> ({fmtTime(lastDose.time)}) by {lastDose.byName}
          {lastDose.dose ? `, ${lastDose.dose}` : ''}.
        </p>
      )}
      <Field label="Dose (optional)">
        <Input value={dose} onChange={(e) => setDose(e.target.value)} placeholder="e.g. 1 drop, 2.5 ml" />
      </Field>
      <TimeField value={c.time} onChange={c.setTime} />
      <NoteField value={c.note} onChange={c.setNote} />
      <Actions
        entry={entry}
        onDone={onDone}
        disabled={!name.trim()}
        onSave={() => {
          saveEntry({ ...c.base, type: 'med', medName: name.trim(), dose: dose.trim() || undefined })
          onDone()
        }}
      />
    </>
  )
}

// --- temperature ---

function TempForm({ entry, onDone }: FormProps) {
  const { saveEntry } = useBaby()
  const { temp: unit, setTemp: setUnit } = useEntryUnits()
  const [value, setValue] = useState(entry?.tempC != null ? String(cTo(entry.tempC, unit)) : '')
  const c = useCommon(entry)
  const n = parseNum(value)
  const tempC = n == null ? null : toC(n, unit)
  const plausible = tempC != null && tempC > 30 && tempC < 45

  return (
    <>
      <MeasureField label="Temperature" unit={<UnitSwitch label="Temperature unit" value={unit} options={TEMP_OPTIONS} onChange={setUnit} />}>
        <NumberInput value={value} onChange={setValue} placeholder={unit === 'C' ? '37.0' : '98.6'} autoFocus={!entry} className="text-2xl font-semibold" />
      </MeasureField>
      {n != null && !plausible && <p className="text-sm text-red-600">That doesn't look like a body temperature in °{unit}. Check the °F / °C switch.</p>}
      <TimeField value={c.time} onChange={c.setTime} />
      <NoteField value={c.note} onChange={c.setNote} />
      <Actions
        entry={entry}
        onDone={onDone}
        disabled={!plausible}
        onSave={() => {
          saveEntry({ ...c.base, type: 'temp', tempC: Math.round(tempC! * 100) / 100 })
          onDone()
        }}
      />
    </>
  )
}

