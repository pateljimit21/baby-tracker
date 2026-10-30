import { useState } from 'react'
import { newId } from '../lib/backend'
import { cmTo, fromInputDate, fromInputDateTime, kgTo, kgToLbOz, lbOzToKg, lengthUnit, toCm, toInputDateTime } from '../lib/format'
import { useBaby } from '../state'
import type { HealthRecord } from '../types'
import { LENGTH_OPTIONS, MeasureField, UnitSwitch, WEIGHT_OPTIONS, useEntryUnits } from './UnitSwitch'
import { Button, Field, Input, NumberInput, Sheet, TextArea, parseNum } from './ui'

type SheetType = 'visit' | 'vaccine' | 'growth'

const TITLES: Record<SheetType, string> = { visit: 'Doctor / hospital visit', vaccine: 'Vaccine', growth: 'Measurement' }

export function RecordSheet({ type, record, onClose }: { type: SheetType; record?: HealthRecord; onClose: () => void }) {
  const { saveRecord, deleteRecord } = useBaby()
  const [time, setTime] = useState(() => toInputDateTime(record?.time ?? Date.now()))
  const [note, setNote] = useState(record?.note ?? '')
  const base = { id: record?.id ?? newId(), type, time: fromInputDateTime(time), note: note.trim() || undefined }

  const remove = () => {
    if (record && confirm('Delete this?')) {
      deleteRecord(record.id)
      onClose()
    }
  }

  return (
    <Sheet title={(record ? 'Edit ' : 'Add ') + TITLES[type].toLowerCase()} onClose={onClose}>
      {type === 'visit' && <VisitFields record={record} base={base} onSave={(r) => (saveRecord(r), onClose())} time={time} setTime={setTime} note={note} setNote={setNote} />}
      {type === 'vaccine' && <VaccineFields record={record} base={base} onSave={(r) => (saveRecord(r), onClose())} time={time} setTime={setTime} note={note} setNote={setNote} />}
      {type === 'growth' && <GrowthFields record={record} base={base} onSave={(r) => (saveRecord(r), onClose())} time={time} setTime={setTime} note={note} setNote={setNote} />}
      {record && (
        <Button variant="danger" className="w-full" onClick={remove}>
          Delete
        </Button>
      )}
    </Sheet>
  )
}

interface FieldsProps {
  record?: HealthRecord
  base: Pick<HealthRecord, 'id' | 'type' | 'time' | 'note'>
  onSave: (r: Omit<HealthRecord, 'by' | 'byName' | 'updatedAt'>) => void
  time: string
  setTime: (v: string) => void
  note: string
  setNote: (v: string) => void
}

function Common({ time, setTime, note, setNote, noteLabel = 'Notes', dateOnly }: Pick<FieldsProps, 'time' | 'setTime' | 'note' | 'setNote'> & { noteLabel?: string; dateOnly?: boolean }) {
  return (
    <>
      <Field label="Date">
        {dateOnly ? (
          <Input type="date" value={time.slice(0, 10)} onChange={(e) => e.target.value && setTime(toInputDateTime(fromInputDate(e.target.value)))} />
        ) : (
          <Input type="datetime-local" value={time} onChange={(e) => setTime(e.target.value)} />
        )}
      </Field>
      <Field label={noteLabel}>
        <TextArea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </>
  )
}

function VisitFields({ record, base, onSave, ...common }: FieldsProps) {
  const [place, setPlace] = useState(record?.place ?? '')
  const [doctor, setDoctor] = useState(record?.doctor ?? '')
  const [reason, setReason] = useState(record?.reason ?? '')
  const [followUp, setFollowUp] = useState(record?.followUp ? toInputDateTime(record.followUp) : '')
  return (
    <>
      <Field label="Reason">
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. 2-week checkup, jaundice check" autoFocus={!record} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Hospital / clinic">
          <Input value={place} onChange={(e) => setPlace(e.target.value)} />
        </Field>
        <Field label="Doctor">
          <Input value={doctor} onChange={(e) => setDoctor(e.target.value)} />
        </Field>
      </div>
      <Common {...common} noteLabel="What the doctor said" />
      <Field label="Follow-up appointment (optional)">
        <Input type="datetime-local" value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
      </Field>
      <Button
        className="w-full"
        disabled={!reason.trim() && !place.trim()}
        onClick={() =>
          onSave({
            ...base,
            reason: reason.trim(),
            place: place.trim() || undefined,
            doctor: doctor.trim() || undefined,
            followUp: followUp ? fromInputDateTime(followUp) : null,
          })
        }
      >
        Save
      </Button>
    </>
  )
}

function VaccineFields({ record, base, onSave, ...common }: FieldsProps) {
  const [vaccine, setVaccine] = useState(record?.vaccine ?? '')
  return (
    <>
      <Field label="Vaccine">
        <Input value={vaccine} onChange={(e) => setVaccine(e.target.value)} placeholder="e.g. Hepatitis B (dose 1)" autoFocus={!record} />
      </Field>
      <Common {...common} dateOnly noteLabel="Notes (reaction, batch number…)" />
      <Button className="w-full" disabled={!vaccine.trim()} onClick={() => onSave({ ...base, vaccine: vaccine.trim() })}>
        Save
      </Button>
    </>
  )
}

function GrowthFields({ record, base, onSave, ...common }: FieldsProps) {
  const { weight: u, setWeight: setU, length: lu, setLength: setLu } = useEntryUnits()
  // The length helpers take the matching weight unit: kg ↔ cm, lb ↔ inches.
  const lw = lu === 'cm' ? 'kg' : 'lb'
  const start = record?.weightKg ? kgToLbOz(record.weightKg) : null
  // kg mode uses `weight`; lb mode uses separate pounds and ounces boxes.
  const [weight, setWeight] = useState(record?.weightKg ? String(kgTo(record.weightKg, 'kg')) : '')
  const [lb, setLb] = useState(start ? String(start.lb) : '')
  const [oz, setOz] = useState(start ? String(start.oz) : '')
  const [length, setLength] = useState(record?.lengthCm ? String(cmTo(record.lengthCm, lw)) : '')
  const [head, setHead] = useState(record?.headCm ? String(cmTo(record.headCm, lw)) : '')
  const w = u === 'kg' ? parseNum(weight) : lb || oz ? lbOzToKg(parseNum(lb) ?? 0, parseNum(oz) ?? 0) : null
  const l = parseNum(length)
  const h = parseNum(head)
  return (
    <>
      <MeasureField label="Weight" unit={<UnitSwitch label="Weight unit" value={u} options={WEIGHT_OPTIONS} onChange={setU} />}>
        {u === 'kg' ? (
          <NumberInput value={weight} onChange={setWeight} autoFocus={!record} placeholder="kg, e.g. 3.45" />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label="lb">
              <NumberInput value={lb} onChange={setLb} autoFocus={!record} placeholder="e.g. 7" />
            </Field>
            <Field label="+ oz">
              <NumberInput value={oz} onChange={setOz} placeholder="e.g. 8.5" />
            </Field>
          </div>
        )}
      </MeasureField>
      <MeasureField label="Length and head" unit={<UnitSwitch label="Length unit" value={lu} options={LENGTH_OPTIONS} onChange={setLu} />}>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Length (${lengthUnit(lw)})`}>
            <NumberInput value={length} onChange={setLength} />
          </Field>
          <Field label={`Head (${lengthUnit(lw)})`}>
            <NumberInput value={head} onChange={setHead} />
          </Field>
        </div>
      </MeasureField>
      <Common {...common} dateOnly />
      <Button
        className="w-full"
        disabled={!w && !l && !h}
        onClick={() =>
          onSave({
            ...base,
            weightKg: w ? Math.round(w * 10000) / 10000 : undefined,
            lengthCm: l ? Math.round(toCm(l, lw) * 100) / 100 : undefined,
            headCm: h ? Math.round(toCm(h, lw) * 100) / 100 : undefined,
          })
        }
      >
        Save
      </Button>
    </>
  )
}

