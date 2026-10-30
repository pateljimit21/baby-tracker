import type { Entry } from '../types'

export type VolumeUnit = 'ml' | 'oz'
export type WeightUnit = 'kg' | 'lb'
export type TempUnit = 'C' | 'F'

export interface Units {
  volume: VolumeUnit
  weight: WeightUnit
  temp: TempUnit
}

/** Starting units for a new phone: US customary in the US, metric elsewhere. */
export function defaultUnits(language = navigator.language): Units {
  return /^en-US|^es-US/i.test(language) ? { volume: 'oz', weight: 'lb', temp: 'F' } : { volume: 'ml', weight: 'kg', temp: 'C' }
}

const ML_PER_OZ = 29.5735
const KG_PER_LB = 0.45359237
const CM_PER_IN = 2.54

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places

// --- conversions: display <-> stored metric ---

// Kept to 2 decimal places so 2.25 oz comes back as 2.25 oz, and 92.5 ml as 92.5 ml.
export const mlTo = (ml: number, u: VolumeUnit) => (u === 'ml' ? round(ml, 1) : round(ml / ML_PER_OZ, 2))
export const toMl = (v: number, u: VolumeUnit) => round(u === 'ml' ? v : v * ML_PER_OZ, 2)
export const fmtVolume = (ml: number, u: VolumeUnit) => `${mlTo(ml, u)} ${u}`

export const kgTo = (kg: number, u: WeightUnit) => (u === 'kg' ? round(kg, 3) : round(kg / KG_PER_LB, 2))
export const toKg = (v: number, u: WeightUnit) => (u === 'kg' ? v : v * KG_PER_LB)
/** Pounds and ounces → kg. */
export const lbOzToKg = (lb: number, oz: number) => (lb + oz / 16) * KG_PER_LB
/** kg → whole pounds plus ounces (to 0.1 oz). */
export function kgToLbOz(kg: number): { lb: number; oz: number } {
  const totalOz = round((kg / KG_PER_LB) * 16, 1)
  return { lb: Math.floor(totalOz / 16), oz: round(totalOz % 16, 1) }
}
export function fmtWeight(kg: number, u: WeightUnit): string {
  if (u === 'kg') return `${round(kg, 3)} kg`
  const { lb, oz } = kgToLbOz(kg)
  return `${lb} lb ${oz} oz`
}

/** Lengths follow the weight unit: kg → cm, lb → inches. */
export const cmTo = (cm: number, u: WeightUnit) => (u === 'kg' ? round(cm, 1) : round(cm / CM_PER_IN, 2))
export const toCm = (v: number, u: WeightUnit) => (u === 'kg' ? v : v * CM_PER_IN)
export const lengthUnit = (u: WeightUnit) => (u === 'kg' ? 'cm' : 'in')
export const fmtLength = (cm: number, u: WeightUnit) => `${cmTo(cm, u)} ${lengthUnit(u)}`

export const cTo = (c: number, u: TempUnit) => (u === 'C' ? round(c, 1) : round((c * 9) / 5 + 32, 1))
export const toC = (v: number, u: TempUnit) => (u === 'C' ? v : ((v - 32) * 5) / 9)
export const fmtTemp = (c: number, u: TempUnit) => `${cTo(c, u)}°${u}`

// --- times ---

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

export function startOfDay(t: number): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Whole days from birth to the day of `t`: 0 on the day they were born. */
export function ageInDays(birth: number, t: number): number {
  return Math.round((startOfDay(t) - startOfDay(birth)) / DAY)
}

/** Age as calendar months, weeks and days, the way Nara shows it: "1m 1w 5d", "3w 2d", "0d". */
export function fmtAgeMWD(birth: number, t: number): string {
  const b = new Date(startOfDay(birth))
  const d = new Date(startOfDay(t))
  if (d < b) return ''
  let months = (d.getFullYear() - b.getFullYear()) * 12 + d.getMonth() - b.getMonth()
  if (d.getDate() < b.getDate()) months--
  // Born on the 31st: a month later is the 30th/28th, not the start of the next month.
  const daysInTarget = new Date(b.getFullYear(), b.getMonth() + months + 1, 0).getDate()
  const afterMonths = new Date(b.getFullYear(), b.getMonth() + months, Math.min(b.getDate(), daysInTarget))
  const rest = Math.round((d.getTime() - afterMonths.getTime()) / DAY)
  const parts = [months && `${months}m`, Math.floor(rest / 7) && `${Math.floor(rest / 7)}w`, rest % 7 && `${rest % 7}d`].filter(Boolean)
  return parts.length ? parts.join(' ') : '0d'
}

/** "Day of birth", "1 day old", "20 days old" */
export function fmtAgeDays(days: number): string {
  return days === 0 ? 'Day of birth' : days === 1 ? '1 day old' : `${days} days old`
}

export function addDays(t: number, days: number): number {
  const d = new Date(t)
  d.setDate(d.getDate() + days)
  return d.getTime()
}

/** 1h 05m, 12m, 45s */
export function fmtDuration(ms: number): string {
  const totalMin = Math.floor(Math.max(0, ms) / MIN)
  if (totalMin === 0) return `${Math.floor(Math.max(0, ms) / 1000)}s`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`
}

/** 12:05 for running timers */
export function fmtClock(ms: number): string {
  const s = Math.floor(Math.max(0, ms) / 1000)
  const h = Math.floor(s / 3600)
  const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0')
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

export function fmtAgo(t: number, now: number): string {
  const ms = now - t
  if (ms < MIN) return 'just now'
  return `${fmtDuration(ms)} ago`
}

export const fmtTime = (t: number) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

export function fmtDay(t: number, now = Date.now()): string {
  const day = startOfDay(t)
  const today = startOfDay(now)
  if (day === today) return 'Today'
  if (day === addDays(today, -1)) return 'Yesterday'
  if (day === addDays(today, 1)) return 'Tomorrow'
  return new Date(t).toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: new Date(t).getFullYear() === new Date(now).getFullYear() ? undefined : 'numeric',
  })
}

export const fmtDate = (t: number) => new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })

export function fmtAge(birth: number, now: number): string {
  const days = Math.floor((startOfDay(now) - startOfDay(birth)) / DAY)
  if (days < 0) return 'Not born yet'
  if (days < 14) return days === 1 ? '1 day old' : `${days} days old`
  if (days < 7 * 13) {
    const w = Math.floor(days / 7)
    const d = days % 7
    return `${w} weeks${d ? ` ${d} day${d > 1 ? 's' : ''}` : ''} old`
  }
  const b = new Date(birth)
  const n = new Date(now)
  let months = (n.getFullYear() - b.getFullYear()) * 12 + n.getMonth() - b.getMonth()
  if (n.getDate() < b.getDate()) months--
  if (months < 24) return `${months} months old`
  return `${Math.floor(months / 12)} years old`
}

/** Value for <input type="datetime-local"> in local time. */
export function toInputDateTime(t: number): string {
  const d = new Date(t - new Date(t).getTimezoneOffset() * MIN)
  return d.toISOString().slice(0, 16)
}
export const fromInputDateTime = (s: string) => new Date(s).getTime()

export const toInputDate = (t: number) => toInputDateTime(t).slice(0, 10)
/** Noon avoids the date slipping a day in other time zones. */
export const fromInputDate = (s: string) => new Date(`${s}T12:00`).getTime()

// --- entries ---

/** Breastfeeding seconds per side, including the side running now. */
export function breastSeconds(e: Entry, now: number): { left: number; right: number } {
  const running = e.activeSide && e.activeSince ? Math.max(0, (now - e.activeSince) / 1000) : 0
  return {
    left: (e.leftSec ?? 0) + (e.activeSide === 'L' ? running : 0),
    right: (e.rightSec ?? 0) + (e.activeSide === 'R' ? running : 0),
  }
}

export const isRunning = (e: Entry) => (e.type === 'breast' || e.type === 'sleep') && e.endTime == null

/** Which side to start on next time: the one not used last. */
export function lastBreastSide(e: Entry | undefined): 'L' | 'R' | null {
  if (!e) return null
  const { left, right } = breastSeconds(e, e.endTime ?? Date.now())
  if (!left && !right) return null
  return e.activeSide ?? (right > left ? 'R' : 'L')
}

export function entryTitle(e: Entry, u: Units, now: number): string {
  switch (e.type) {
    case 'bottle':
      if (e.milk === 'mixed') {
        const bm = e.breastMilkMl ?? 0
        return `Bottle · ${fmtVolume(e.amountMl ?? 0, u.volume)} (${fmtVolume(bm, u.volume)} breast milk + ${fmtVolume((e.amountMl ?? 0) - bm, u.volume)} formula)`
      }
      return `Bottle · ${fmtVolume(e.amountMl ?? 0, u.volume)}${e.milk === 'breastmilk' ? ' breast milk' : e.milk === 'formula' ? ' formula' : ''}`
    case 'breast': {
      const { left, right } = breastSeconds(e, e.endTime ?? now)
      const parts = [left && `L ${fmtDuration(left * 1000)}`, right && `R ${fmtDuration(right * 1000)}`].filter(Boolean)
      return `Breastfeed${parts.length ? ' · ' + parts.join(', ') : ''}${e.endTime == null ? ' (running)' : ''}`
    }
    case 'solid':
      return `Solids · ${e.food || 'food'}${e.meal ? ` (${e.meal})` : ''}`
    case 'pump':
      return `Pump · ${fmtVolume((e.leftMl ?? 0) + (e.rightMl ?? 0), u.volume)}`
    case 'diaper':
      return `Diaper · ${e.diaper === 'both' ? 'wet + dirty' : e.diaper}`
    case 'sleep':
      return e.endTime == null ? 'Sleeping (running)' : `Sleep · ${fmtDuration(e.endTime - e.time)}`
    case 'med':
      return `Medicine · ${e.medName}${e.dose ? ` (${e.dose})` : ''}`
    case 'temp':
      return `Temperature · ${fmtTemp(e.tempC ?? 0, u.temp)}`
  }
}

export const ENTRY_ICONS: Record<Entry['type'], string> = {
  bottle: '🍼',
  breast: '🤱',
  solid: '🥣',
  pump: '🥛',
  diaper: '🧷',
  sleep: '😴',
  med: '💊',
  temp: '🌡️',
}

export interface DayTotals {
  /** All bottle milk; breastMilkMl + formulaMl, plus bottles that didn't say which. */
  milkMl: number
  breastMilkMl: number
  formulaMl: number
  bottles: number
  breastfeeds: number
  /** bottles + breastfeeds */
  feeds: number
  breastMs: number
  leftMs: number
  rightMs: number
  /** Solid food: how many times, and what. */
  solids: number
  foods: string[]
  diapers: number
  wet: number
  dirty: number
  sleeps: number
  sleepMs: number
  pumps: number
  pumpMl: number
  meds: string[]
  temps: number
  maxTempC: number | null
}

/** Totals for the day starting at `dayStart`. Sleep that crosses midnight is split between days. */
export function dayTotals(entries: Entry[], dayStart: number, now: number): DayTotals {
  return rangeTotals(entries, dayStart, addDays(dayStart, 1), now)
}

/** Totals from `dayStart` up to `dayEnd` (e.g. the last 24 hours). Sleep is cut to the range. */
export function rangeTotals(entries: Entry[], dayStart: number, dayEnd: number, now: number): DayTotals {
  const t: DayTotals = {
    milkMl: 0,
    breastMilkMl: 0,
    formulaMl: 0,
    bottles: 0,
    breastfeeds: 0,
    feeds: 0,
    breastMs: 0,
    leftMs: 0,
    rightMs: 0,
    solids: 0,
    foods: [],
    diapers: 0,
    wet: 0,
    dirty: 0,
    sleeps: 0,
    sleepMs: 0,
    pumps: 0,
    pumpMl: 0,
    meds: [],
    temps: 0,
    maxTempC: null,
  }
  for (const e of entries) {
    if (e.type === 'sleep') {
      const start = Math.max(e.time, dayStart)
      const end = Math.min(e.endTime ?? now, dayEnd)
      if (end > start) t.sleepMs += end - start
      if (e.time >= dayStart && e.time < dayEnd) t.sleeps++
      continue
    }
    if (e.time < dayStart || e.time >= dayEnd) continue
    if (e.type === 'bottle') {
      const ml = e.amountMl ?? 0
      t.milkMl += ml
      if (e.milk === 'breastmilk') t.breastMilkMl += ml
      else if (e.milk === 'formula') t.formulaMl += ml
      else if (e.milk === 'mixed') {
        t.breastMilkMl += e.breastMilkMl ?? 0
        t.formulaMl += ml - (e.breastMilkMl ?? 0)
      }
      t.bottles++
      t.feeds++
    } else if (e.type === 'breast') {
      const { left, right } = breastSeconds(e, e.endTime ?? now)
      t.breastMs += (left + right) * 1000
      t.leftMs += left * 1000
      t.rightMs += right * 1000
      t.breastfeeds++
      t.feeds++
    } else if (e.type === 'solid') {
      t.solids++
      if (e.food) t.foods.push(e.food)
    } else if (e.type === 'diaper') {
      t.diapers++
      if (e.diaper === 'wet' || e.diaper === 'both') t.wet++
      if (e.diaper === 'dirty' || e.diaper === 'both') t.dirty++
    } else if (e.type === 'pump') {
      t.pumps++
      t.pumpMl += (e.leftMl ?? 0) + (e.rightMl ?? 0)
    } else if (e.type === 'med') {
      if (e.medName) t.meds.push(e.medName)
    } else if (e.type === 'temp' && e.tempC != null) {
      t.temps++
      t.maxTempC = Math.max(t.maxTempC ?? -Infinity, e.tempC)
    }
  }
  return t
}
