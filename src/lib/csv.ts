import type { Entry, HealthRecord } from '../types'

// Exports are always metric so they read the same for everyone.

const iso = (t?: number | null) => (t ? new Date(t).toLocaleString('sv-SE').slice(0, 16) : '')
const mins = (s?: number) => (s ? String(Math.round((s / 60) * 100) / 100) : '')

function toCsv(header: string[], rows: (string | number | boolean | undefined | null)[][]): string {
  const cell = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\n')
}

export function entriesCsv(entries: Entry[]): string {
  return toCsv(
    ['type', 'start', 'end', 'amount_ml', 'milk', 'left_min', 'right_min', 'left_ml', 'right_ml', 'diaper', 'medicine', 'dose', 'temp_c', 'note', 'logged_by', 'breast_milk_ml', 'food', 'meal'],
    entries.map((e) => [
      e.type,
      iso(e.time),
      iso(e.endTime),
      e.amountMl,
      e.milk,
      mins(e.leftSec),
      mins(e.rightSec),
      e.leftMl,
      e.rightMl,
      e.diaper,
      e.medName,
      e.dose,
      e.tempC,
      e.note,
      e.byName,
      e.breastMilkMl,
      e.food,
      e.meal,
    ]),
  )
}

export function recordsCsv(records: HealthRecord[]): string {
  return toCsv(
    ['type', 'date', 'reason', 'place', 'doctor', 'follow_up', 'vaccine', 'weight_kg', 'length_cm', 'head_cm', 'question', 'asked', 'notes', 'logged_by'],
    records.map((r) => [
      r.type,
      iso(r.time),
      r.reason,
      r.place,
      r.doctor,
      iso(r.followUp),
      r.vaccine,
      r.weightKg,
      r.lengthCm,
      r.headCm,
      r.text,
      r.type === 'question' ? (r.done ? 'yes' : 'no') : '',
      r.note,
      r.byName,
    ]),
  )
}

/** On iPhone this opens the share sheet (save to Files, AirDrop, email); elsewhere it downloads. */
export async function shareFiles(files: { name: string; text: string }[]) {
  const asFiles = files.map((f) => new File([f.text], f.name, { type: 'text/csv' }))
  if (navigator.canShare?.({ files: asFiles })) {
    try {
      await navigator.share({ files: asFiles })
      return
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
    }
  }
  for (const f of asFiles) {
    const url = URL.createObjectURL(f)
    const a = document.createElement('a')
    a.href = url
    a.download = f.name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
