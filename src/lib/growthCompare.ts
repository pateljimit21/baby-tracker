import type { HealthRecord } from '../types'
import { ageInDays } from './format'

export type Measure = 'weightKg' | 'lengthCm' | 'headCm'

export interface Point {
  age: number
  value: number
}

/** One baby's measurements of one kind, by age in days, oldest first (one per day: the last that day). */
export function pointsByAge(records: HealthRecord[], birthDate: number, measure: Measure): Point[] {
  const byAge = new Map<number, { time: number; value: number }>()
  for (const r of records) {
    const value = r[measure]
    if (r.type !== 'growth' || value == null) continue
    const age = ageInDays(birthDate, r.time)
    if (age < 0) continue
    const prev = byAge.get(age)
    if (!prev || r.time > prev.time) byAge.set(age, { time: r.time, value })
  }
  return [...byAge].map(([age, { value }]) => ({ age, value })).sort((a, b) => a.age - b.age)
}

/**
 * A sibling's value at a given age. A measurement within `tolerance` days counts as measured.
 * Otherwise, if there are measurements on both sides no more than `maxGap` days apart,
 * it's estimated in a straight line between them. Babies aren't weighed daily, so this is
 * what "at the same age" can honestly mean.
 */
export function valueAtAge(points: Point[], age: number, tolerance = 3, maxGap = 60): { value: number; measuredAt: number; estimated: boolean } | null {
  if (!points.length) return null
  const nearest = points.reduce((best, p) => (Math.abs(p.age - age) < Math.abs(best.age - age) ? p : best))
  if (Math.abs(nearest.age - age) <= tolerance) return { value: nearest.value, measuredAt: nearest.age, estimated: false }
  const before = [...points].reverse().find((p) => p.age < age)
  const after = points.find((p) => p.age > age)
  if (!before || !after || after.age - before.age > maxGap) return null
  const f = (age - before.age) / (after.age - before.age)
  return { value: before.value + f * (after.value - before.value), measuredAt: age, estimated: true }
}
