import type { Entry, EntryType, HealthRecord } from '../types'
import type { Draft } from './backend'

// Imports CSV files exported by any baby tracker app.
// Every app lays its file out differently, so this guesses which column is which
// (the import screen lets you correct the guess), then reads each row's values
// for amounts, durations, sides and diaper kinds wherever they appear.

/** What a row becomes. 'feed' = decide bottle or breast from the row itself. */
export type Target = EntryType | 'feed' | 'growth' | 'visit' | 'vaccine' | 'skip'
export type DateOrder = 'MDY' | 'DMY' | 'YMD'

export interface CsvFile {
  name: string
  headers: string[]
  rows: string[][]
}

export interface Mapping {
  date: number
  time: number | null
  end: number | null
  /** Column naming the activity; null = every row is `fixedType`. */
  type: number | null
  fixedType: Target
  note: number | null
  /** For files covering several children: the name column, and which child to import. */
  child: number | null
  childValue: string | null
  dateOrder: DateOrder
  /** Unit for amounts that don't say ml or oz. */
  volumeUnit: 'ml' | 'oz'
  /** Activity value (lowercased) → what it becomes. */
  typeMap: Record<string, Target>
}

export interface ImportResult {
  entries: Draft<Entry>[]
  records: Draft<HealthRecord>[]
  /** Reason → number of rows skipped for it. */
  skipped: Record<string, number>
  /** Birth date found in the file (e.g. Nara's profile row), to check against the baby's. */
  birthDate?: number
}

// ---------- reading the file ----------

export function parseCsv(text: string): string[][] {
  text = text.replace(/^﻿/, '')
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const delim = [',', ';', '\t'].reduce((best, d) => (count(firstLine, d) > count(firstLine, best) ? d : best), ',')

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === delim) {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  row.push(field)
  rows.push(row)
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''))
}

const count = (s: string, ch: string) => s.split(ch).length - 1

export function readCsv(name: string, text: string): CsvFile {
  const [headers = [], ...rows] = parseCsv(text)
  return {
    name,
    headers: headers.map((h) => h.trim()),
    rows: rows.map((r) => headers.map((_, i) => (r[i] ?? '').trim())),
  }
}

// ---------- dates ----------

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const NUMERIC_DATE = /^(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})/
const TIME = /(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?m\.?)?/i

export function looksLikeDate(s: string): boolean {
  const v = s.trim().toLowerCase()
  return NUMERIC_DATE.test(v) || (MONTHS.some((m) => v.includes(m)) && /\d/.test(v))
}

const looksLikeTimeOnly = (s: string) => /^\d{1,2}:\d{2}(:\d{2})?\s*([ap]\.?m\.?)?$/i.test(s.trim())

/** Which way round numeric dates are written, judged from the values. */
export function detectDateOrder(values: string[], fallback: DateOrder): DateOrder {
  let firstOver12 = false
  let secondOver12 = false
  for (const v of values) {
    const m = v.trim().match(NUMERIC_DATE)
    if (!m) continue
    if (m[1].length === 4) return 'YMD'
    if (+m[1] > 12) firstOver12 = true
    if (+m[2] > 12) secondOver12 = true
  }
  if (firstOver12 && !secondOver12) return 'DMY'
  if (secondOver12 && !firstOver12) return 'MDY'
  return fallback
}

/** Reads a date (and time, maybe from a separate column) in local time. NaN if unreadable. */
export function parseWhen(dateStr: string, timeStr: string | undefined, order: DateOrder): number {
  const s = dateStr.trim()
  if (!s) return NaN
  let y: number, mo: number, d: number
  let rest: string
  const num = s.match(NUMERIC_DATE)
  if (num) {
    const [a, b, c] = [+num[1], +num[2], +num[3]]
    if (num[1].length === 4) [y, mo, d] = [a, b, c]
    else if (order === 'DMY') [d, mo, y] = [a, b, c]
    else if (order === 'YMD') [y, mo, d] = [a, b, c]
    else [mo, d, y] = [a, b, c]
    rest = s.slice(num[0].length)
  } else {
    // "Oct 22, 2026 2:47 PM", "22 October 2026", "Thu, Oct 22 2026"
    const lower = s.toLowerCase()
    const mi = MONTHS.findIndex((m) => lower.includes(m))
    if (mi < 0) return NaN
    const nums = lower.replace(TIME, ' ').match(/\d+/g)?.map(Number) ?? []
    const year = nums.find((n) => n > 31)
    const day = nums.find((n) => n >= 1 && n <= 31)
    if (year == null || day == null) return NaN
    ;[y, mo, d] = [year, mi + 1, day]
    rest = s
  }
  if (y < 100) y += 2000
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return NaN

  let h = 0
  let mi = 0
  let sec = 0
  const t = (timeStr?.trim() || rest).match(TIME)
  if (t) {
    h = +t[1]
    mi = +t[2]
    sec = +(t[3] ?? 0)
    const ampm = t[4]?.[0]?.toLowerCase()
    if (ampm === 'p' && h < 12) h += 12
    if (ampm === 'a' && h === 12) h = 0
  }
  // A "Z" or "+05:30" on the end means the time isn't local.
  const zone = (timeStr?.trim() || rest).match(/(Z|[+-]\d{2}:?\d{2})$/)
  if (zone && /T|\d{2}:\d{2}/.test(rest)) {
    const iso = `${String(y).padStart(4, '0')}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}:${pad(sec)}${zone[1].length === 5 ? zone[1].slice(0, 3) + ':' + zone[1].slice(3) : zone[1]}`
    return Date.parse(iso)
  }
  return new Date(y, mo - 1, d, h, mi, sec).getTime()
}

const pad = (n: number) => String(n).padStart(2, '0')

// ---------- guessing ----------

/** What an activity name probably means. */
export function guessTarget(raw: string): Target {
  const v = raw.toLowerCase()
  if (/solid|food|meal|puree|purée|cereal|snack/.test(v)) return 'solid'
  if (/pump|express/.test(v)) return 'pump'
  if (/breast\s*feed|nurs|latch|left|right/.test(v)) return 'breast'
  if (/bottle|formula|breast\s*milk/.test(v)) return 'bottle'
  if (/^breast$/.test(v.trim())) return 'breast'
  if (/diaper|nappy|pee|poo|poop|wet|dirty|stool|urine/.test(v)) return 'diaper'
  if (/sleep|nap\b|naps/.test(v)) return 'sleep'
  if (/temp|fever/.test(v)) return 'temp'
  if (/vaccin|immuni|shot/.test(v)) return 'vaccine'
  if (/medic|vitamin|drops|dose|tylenol|paracetamol|acetaminophen|ibuprofen/.test(v)) return 'med'
  if (/growth|weight|height|length|head|measure/.test(v)) return 'growth'
  if (/doctor|visit|appointment|checkup|check-up|hospital|pediatric|paediatric/.test(v)) return 'visit'
  if (/feed|meal|milk|eat/.test(v)) return 'feed'
  return 'skip'
}

export function guessMapping(file: CsvFile, fallbackOrder: DateOrder): Mapping {
  const h = file.headers.map((x) => x.toLowerCase())
  const sample = file.rows.slice(0, 200)
  const col = (i: number) => sample.map((r) => r[i]).filter(Boolean)
  const share = (i: number, test: (s: string) => boolean) => {
    const vals = col(i)
    return vals.length ? vals.filter(test).length / vals.length : 0
  }
  const isEnd = (i: number) => /end|stop|finish|wake|until/.test(h[i])
  const idx = h.map((_, i) => i)

  const dateCols = idx.filter((i) => share(i, looksLikeDate) >= 0.6)
  const date =
    dateCols.find((i) => !isEnd(i) && /start|date|time|begin|when/.test(h[i])) ?? dateCols.find((i) => !isEnd(i)) ?? dateCols[0] ?? 0
  const hasTimeInDate = share(date, (s) => TIME.test(s)) >= 0.6
  const time = hasTimeInDate
    ? null
    : (idx.find((i) => i !== date && !isEnd(i) && share(i, looksLikeTimeOnly) >= 0.6) ?? null)
  const end = idx.find((i) => i !== date && i !== time && isEnd(i) && share(i, (s) => looksLikeDate(s) || looksLikeTimeOnly(s)) >= 0.6) ?? null

  const used = new Set([date, time, end])
  const type =
    idx.find((i) => !used.has(i) && /type|activity|event|category|kind|action|^log$|entry/.test(h[i]) && share(i, (s) => guessTarget(s) !== 'skip') >= 0.3) ??
    idx.find((i) => !used.has(i) && new Set(col(i)).size <= 30 && share(i, (s) => guessTarget(s) !== 'skip') >= 0.5) ??
    null
  const note = idx.find((i) => !used.has(i) && i !== type && /note|comment|memo|description|remark/.test(h[i])) ?? null
  const child = idx.find((i) => !used.has(i) && i !== type && /child|baby|kid|infant|^name$/.test(h[i]) && new Set(col(i)).size >= 2 && new Set(col(i)).size <= 6) ?? null

  const fromName = guessTarget(file.name.replace(/\.[a-z]+$/i, '').replace(/[_-]/g, ' '))
  // A file named "Diapers.csv" whose "Status" column says Wet/Dirty is one activity, not several.
  const kinds = type == null ? new Set() : new Set(col(type).map(guessTarget).filter((t) => t !== 'skip'))
  const typeCol = fromName !== 'skip' && kinds.size <= 1 ? null : type

  const typeMap: Record<string, Target> = {}
  if (typeCol != null) for (const v of new Set(file.rows.map((r) => r[typeCol]))) typeMap[v.trim().toLowerCase()] = guessTarget(v)

  const allText = (file.headers.join(' ') + ' ' + sample.flat().join(' ')).toLowerCase()
  return {
    date,
    time,
    end,
    type: typeCol,
    fixedType: fromName === 'skip' ? 'feed' : fromName,
    note,
    child,
    childValue: child == null ? null : (file.rows[0]?.[child] ?? null),
    dateOrder: detectDateOrder(col(date), fallbackOrder),
    volumeUnit: /\boz\b|fl\.?\s*oz|ounce/.test(allText) && !/\bml\b/.test(allText) ? 'oz' : 'ml',
    typeMap,
  }
}

/** Distinct activity values with how many rows each, most common first. */
export function activityValues(file: CsvFile, typeCol: number): { value: string; key: string; count: number }[] {
  const counts = new Map<string, { value: string; count: number }>()
  for (const r of file.rows) {
    const key = r[typeCol].trim().toLowerCase()
    const c = counts.get(key)
    if (c) c.count++
    else counts.set(key, { value: r[typeCol].trim() || '(blank)', count: 1 })
  }
  return [...counts].map(([key, c]) => ({ key, ...c })).sort((a, b) => b.count - a.count)
}

// ---------- reading values out of a row ----------

interface Cell {
  h: string
  v: string
}

const ML_PER_OZ = 29.5735
const num = (s: string) => parseFloat(s.replace(',', '.'))
const truthy = (s: string) => /^(1|y|yes|true|x|✓|✔)$/i.test(s.trim())

function volumeMl(cells: Cell[], fallback: 'ml' | 'oz', side?: 'left' | 'right'): number | null {
  for (const { h, v } of cells) {
    if (side && !h.includes(side)) continue
    if (!side && /left|right/.test(h)) continue
    const withUnit = v.match(/(\d+(?:[.,]\d+)?)\s*(ml|cc|fl\.?\s*oz|oz|ounces?)\b/i)
    if (withUnit) return toMl(num(withUnit[1]), /ml|cc/i.test(withUnit[2]) ? 'ml' : 'oz')
    if (/amount|volume|quantity|qty|\bml\b|\boz\b|ounce|total/.test(h) && /^\d+(?:[.,]\d+)?$/.test(v.trim()) && !/dur|min|sec|time/.test(h))
      return toMl(num(v), /\bml\b/.test(h) ? 'ml' : /\boz\b|ounce/.test(h) ? 'oz' : fallback)
  }
  return null
}
/** Volume from columns whose header matches `which`, e.g. Nara's "Breast Milk Volume" and "Formula Volume". */
const volumeIn = (cells: Cell[], which: RegExp, fallback: 'ml' | 'oz') => volumeMl(cells.filter((c) => which.test(c.h) && !/name|brand/.test(c.h)), fallback)

const toMl = (n: number, u: 'ml' | 'oz') => Math.round((u === 'ml' ? n : n * ML_PER_OZ) * 100) / 100

/** "1:05:30", "0:15", "15 min", "1h 20m", "90" (minutes). Returns seconds. */
export function parseDuration(v: string, header = ''): number | null {
  const s = v.trim().toLowerCase()
  if (!s) return null
  const clock = s.match(/^(\d+):(\d{2})(?::(\d{2}))?$/)
  if (clock) return clock[3] != null ? +clock[1] * 3600 + +clock[2] * 60 + +clock[3] : /sec/.test(header) ? +clock[1] * 60 + +clock[2] : +clock[1] * 3600 + +clock[2] * 60
  let total = 0
  let found = false
  for (const m of s.matchAll(/(\d+(?:[.,]\d+)?)\s*(h(?:ours?|rs?)?|m(?:in(?:ute)?s?)?|s(?:ec(?:ond)?s?)?)\b/g)) {
    found = true
    const n = num(m[1])
    total += m[2].startsWith('h') ? n * 3600 : m[2].startsWith('m') ? n * 60 : n
  }
  if (found) return Math.round(total)
  if (/^\d+(?:[.,]\d+)?$/.test(s)) {
    const n = num(s)
    return Math.round(/sec/.test(header) ? n : /hour|hr/.test(header) ? n * 3600 : n * 60)
  }
  return null
}

function durationSec(cells: Cell[], side?: 'left' | 'right'): number | null {
  for (const { h, v } of cells) {
    if (side ? !h.includes(side) : /left|right/.test(h)) continue
    if (!/dur|length|time|min|sec|hour|total/.test(h) || /amount|volume|ml|oz/.test(h)) continue
    if (looksLikeDate(v)) continue
    const d = parseDuration(v, h)
    if (d != null) return d
  }
  return null
}

/** Huckleberry-style "0:15L" / "12m R" markers inside text. */
function sideDurations(text: string): { left: number; right: number } | null {
  let left = 0
  let right = 0
  for (const m of text.matchAll(/(\d+:\d{2}|\d+\s*(?:minutes?|mins?|m)(?![a-z]))\s*\(?(left|right|l|r)\b/gi)) {
    // "0:15" reads as 15 minutes; "15:30" would be 15½ hours, so that one means 15 min 30 s.
    const asHours = parseDuration(m[1], 'min') ?? 0
    const secs = m[1].includes(':') && asHours > 3 * 3600 ? (parseDuration(m[1], 'sec') ?? 0) : asHours
    if (m[2].toLowerCase().startsWith('l')) left += secs
    else right += secs
  }
  return left || right ? { left, right } : null
}

function diaperKind(text: string, cells: Cell[]): Entry['diaper'] | null {
  let wet = /pee|wet|urine|\bwee\b/.test(text)
  let dirty = /poo|dirty|stool|\bbm\b|bowel|poop|soiled/.test(text)
  if (/both|mixed|mixte/.test(text)) wet = dirty = true
  for (const { h, v } of cells) {
    if (/pee|wet|urine/.test(h) && truthy(v)) wet = true
    if (/poo|dirty|stool|bowel/.test(h) && truthy(v)) dirty = true
  }
  return wet && dirty ? 'both' : wet ? 'wet' : dirty ? 'dirty' : null
}

function tempC(cells: Cell[]): number | null {
  for (const { h, v } of cells) {
    const m = v.match(/(\d{2,3}(?:[.,]\d+)?)\s*°?\s*([cf])?\b/i)
    if (!m) continue
    const n = num(m[1])
    const f = m[2]?.toLowerCase() === 'f' || /°f|fahrenheit/.test(h) || (n >= 86 && n <= 113)
    const c = f ? ((n - 32) * 5) / 9 : n
    if (c > 30 && c < 45) return Math.round(c * 100) / 100
  }
  return null
}

function measure(cells: Cell[], what: 'weight' | 'length' | 'head', volumeUnit: 'ml' | 'oz', activity = ''): number | null {
  const header = { weight: /weight|\bwt\b|mass/, length: /length|height|\bht\b/, head: /head|\bhc\b|circumference/ }[what]
  // Activity "Weight" with the number in an "Amount" column.
  const fromActivity = header.test(activity.toLowerCase()) && !(what !== 'head' && /head/.test(activity.toLowerCase()))
  for (const { h, v } of cells) {
    if (!header.test(h) && !(fromActivity && /amount|value|quantity|qty|measure/.test(h))) continue
    if (what !== 'head' && /head/.test(h)) continue
    const m = v.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|lbs?|oz|cm|mm|in(?:ch(?:es)?)?|")?/i)
    if (!m) continue
    const n = num(m[1])
    const u = (m[2] ?? (h.match(/\b(kg|g|lbs?|oz|cm|mm|in|inch(?:es)?)\b/)?.[1] ?? '')).toLowerCase()
    if (what === 'weight') {
      if (u === 'g') return n / 1000
      if (u.startsWith('lb')) return n * 0.45359237
      if (u === 'oz') return (n / 16) * 0.45359237
      if (u === 'kg') return n
      return volumeUnit === 'oz' || n > 30 ? n * 0.45359237 : n
    }
    if (u === 'mm') return n / 10
    if (u.startsWith('in') || u === '"') return n * 2.54
    if (u === 'cm') return n
    return volumeUnit === 'oz' ? n * 2.54 : n
  }
  return null
}

const pick = (cells: Cell[], header: RegExp) => cells.find((c) => header.test(c.h) && c.v)?.v

// ---------- converting rows ----------

function hashId(parts: unknown[]): string {
  // FNV-1a over the row's key values: the same row always gets the same id,
  // so importing a file twice doesn't create duplicates.
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (const ch of JSON.stringify(parts)) {
    const c = ch.charCodeAt(0)
    h1 = Math.imul(h1 ^ c, 0x01000193)
    h2 = Math.imul(h2 ^ c, 0x5bd1e995)
  }
  return 'imp' + (h1 >>> 0).toString(36).padStart(7, '0') + (h2 >>> 0).toString(36).padStart(7, '0')
}

export function convert(file: CsvFile, m: Mapping, now = Date.now()): ImportResult {
  if (isOurEntries(file.headers)) return convertOurEntries(file)
  if (isOurRecords(file.headers)) return convertOurRecords(file)

  const out: ImportResult = { entries: [], records: [], skipped: {} }
  const skip = (reason: string) => (out.skipped[reason] = (out.skipped[reason] ?? 0) + 1)
  const used = new Set([m.date, m.time, m.end, m.type, m.note, m.child])
  // Columns that are bookkeeping, not baby data. Their random IDs could otherwise contain "wet" or "poo".
  const ignored = (h: string) => /^_|key$|\bkey\b|\bid$|uuid|epoch|time\s*zone|caregiver|created|updated|logged\s*by|profile/i.test(h.trim())
  const isUnit = (h: string) => /^(units?|uom)$|\bunits?$/i.test(h.trim())
  // The app's own id for each row, if it has one: re-importing then updates rows instead of adding them again.
  const keyCol = file.headers.findIndex((h) => /(activity|entry|record|event|log)[\s_-]?(key|id)$|^_?id$|uuid/i.test(h.trim()))
  const birthCol = file.headers.findIndex((h) => /birth\s*date|date of birth|\bdob\b/i.test(h) && !/adjusted/i.test(h))
  if (birthCol >= 0) {
    const raw = file.rows.find((r) => r[birthCol])?.[birthCol]
    const t = raw ? parseWhen(raw, '12:00', m.dateOrder) : NaN
    if (!Number.isNaN(t)) out.birthDate = t
  }

  for (const row of file.rows) {
    if (m.child != null && row[m.child] !== m.childValue) continue
    const typeText = m.type != null ? row[m.type].trim() : ''
    const target = m.type != null ? (m.typeMap[typeText.toLowerCase()] ?? 'skip') : m.fixedType
    if (target === 'skip') {
      skip(typeText ? `"${typeText}" isn't something Sip & Snooze tracks` : 'Activity left blank')
      continue
    }
    const time = parseWhen(row[m.date], m.time != null ? row[m.time] : undefined, m.dateOrder)
    if (Number.isNaN(time)) {
      skip('Date not readable')
      continue
    }
    if (time > now + 86_400_000) {
      skip('Date is in the future')
      continue
    }
    let end: number | null = null
    if (m.end != null && row[m.end]) {
      const raw = row[m.end]
      end = looksLikeDate(raw) ? parseWhen(raw, undefined, m.dateOrder) : parseWhen(row[m.date], raw, m.dateOrder)
      if (Number.isNaN(end)) end = null
      else if (end < time) end += 86_400_000 // ended after midnight
    }

    const cells: Cell[] = []
    file.headers.forEach((h, i) => {
      if (used.has(i) || i === keyCol || !row[i].trim() || ignored(h)) return
      if (isUnit(h)) {
        // "Formula Volume: 1.5" + "Formula Volume Unit: FLOZ" → "Formula Volume: 1.5 FLOZ".
        // Matched by name, else the number just before it ("Amount" + "Unit").
        const base = h.trim().replace(/\s*units?$/i, '').toLowerCase()
        const target = cells.find((c) => c.h === base) ?? cells[cells.length - 1]
        if (target && /^\d+(?:[.,]\d+)?$/.test(target.v.trim())) target.v = `${target.v.trim()} ${row[i].trim()}`
        return
      }
      cells.push({ h: h.trim().toLowerCase(), v: row[i] })
    })
    const text = [typeText, ...cells.map((c) => c.v)].join(' ').toLowerCase()
    const note = (m.note != null ? row[m.note].trim() : '') || undefined
    const base = { time, note }

    const breastMilkMl = volumeIn(cells, /breast\s*milk|breastmilk/, m.volumeUnit)
    const formulaMl = volumeIn(cells, /formula/, m.volumeUnit)
    const ml = breastMilkMl != null || formulaMl != null ? (breastMilkMl ?? 0) + (formulaMl ?? 0) : volumeMl(cells, m.volumeUnit)
    const dur = durationSec(cells) ?? (end != null ? Math.round((end - time) / 1000) : null)
    const leftSec = durationSec(cells, 'left')
    const rightSec = durationSec(cells, 'right')
    const marked = sideDurations(text)
    const side = /\bleft\b/.test(text) ? 'L' : /\bright\b/.test(text) ? 'R' : null
    const breastWords = /breast\s*feed|nurs|latch/.test(text) || leftSec != null || rightSec != null || marked != null

    let kind: Target = target
    if (kind === 'feed') {
      if (/pump|express/.test(text) && ml) kind = 'pump'
      else if (ml && !breastWords) kind = 'bottle'
      else if (breastWords || dur) kind = 'breast'
      else {
        skip('Feed with no amount or duration')
        continue
      }
    }

    const key = keyCol >= 0 ? row[keyCol].trim() : ''
    const entry = (e: Omit<Draft<Entry>, 'id'>) =>
      out.entries.push({ ...e, id: hashId(key ? ['key', key] : [e.type, e.time, e.amountMl, e.leftSec, e.rightSec, e.diaper, e.medName, e.tempC, e.leftMl, e.endTime]) })
    const record = (r: Omit<Draft<HealthRecord>, 'id'>) =>
      out.records.push({ ...r, id: hashId(key ? ['key', key] : [r.type, r.time, r.weightKg, r.lengthCm, r.headCm, r.vaccine, r.reason]) })

    switch (kind) {
      case 'bottle': {
        if (!ml) {
          skip('Bottle with no amount')
          break
        }
        if (breastMilkMl && formulaMl) {
          entry({ ...base, type: 'bottle', amountMl: ml, milk: 'mixed', breastMilkMl })
          break
        }
        const milk = formulaMl
          ? 'formula'
          : breastMilkMl
            ? 'breastmilk'
            : /formula/.test(text)
              ? 'formula'
              : /breast\s*milk|breastmilk|expressed|pumped/.test(text)
                ? 'breastmilk'
                : undefined
        entry({ ...base, type: 'bottle', amountMl: ml, milk })
        break
      }
      case 'breast': {
        let l = leftSec ?? marked?.left ?? 0
        let r = rightSec ?? marked?.right ?? 0
        if (!l && !r) {
          if (!dur) {
            skip('Breastfeed with no duration')
            break
          }
          if (side === 'R') r = dur
          else l = dur
        }
        entry({ ...base, type: 'breast', leftSec: l, rightSec: r, activeSide: null, activeSince: null, endTime: end ?? time + (l + r) * 1000 })
        break
      }
      case 'pump': {
        const l = volumeMl(cells, m.volumeUnit, 'left')
        const r = volumeMl(cells, m.volumeUnit, 'right')
        if (!l && !r && !ml) {
          skip('Pumping with no amount')
          break
        }
        entry({ ...base, type: 'pump', leftMl: l ?? (r ? 0 : ml!), rightMl: r ?? 0 })
        break
      }
      case 'diaper': {
        const d = diaperKind(text, cells)
        entry({ ...base, type: 'diaper', diaper: d ?? 'wet', note: d ? note : [note, 'Imported: wet/dirty not recorded'].filter(Boolean).join(' · ') })
        break
      }
      case 'sleep': {
        const stop = end ?? (dur ? time + dur * 1000 : null)
        if (!stop || stop <= time) {
          skip('Sleep with no end time or duration')
          break
        }
        entry({ ...base, type: 'sleep', endTime: stop })
        break
      }
      case 'solid': {
        const food = pick(cells, /food|item|what|name|details/) ?? (/^(solids?|solid feed|food|meal)$/i.test(typeText) ? '' : typeText)
        const mealRaw = (pick(cells, /meal/) ?? '').toLowerCase()
        const meal = (['breakfast', 'lunch', 'dinner', 'snack'] as const).find((x) => mealRaw.includes(x))
        entry({ ...base, type: 'solid', food: food.replace(/\s*\n\s*/g, ', ').trim() || undefined, meal })
        break
      }
      case 'med': {
        const named = pick(cells, /name|medicine|medication|drug|\bmed\b|details|item/)
        const medName = (named ?? (/^(medicine|medication|meds?)$/i.test(typeText) ? '' : typeText)) || 'Medicine'
        entry({ ...base, type: 'med', medName, dose: pick(cells, /dose|dosage|amount|qty|quantity/) })
        break
      }
      case 'temp': {
        const c = tempC(cells)
        if (c == null) {
          skip('Temperature with no reading')
          break
        }
        entry({ ...base, type: 'temp', tempC: c })
        break
      }
      case 'growth': {
        const weightKg = measure(cells, 'weight', m.volumeUnit, typeText)
        const lengthCm = measure(cells, 'length', m.volumeUnit, typeText)
        const headCm = measure(cells, 'head', m.volumeUnit, typeText)
        if (weightKg == null && lengthCm == null && headCm == null) {
          skip('Growth with no measurement')
          break
        }
        record({
          ...base,
          type: 'growth',
          weightKg: weightKg == null ? undefined : Math.round(weightKg * 1000) / 1000,
          lengthCm: lengthCm == null ? undefined : Math.round(lengthCm * 10) / 10,
          headCm: headCm == null ? undefined : Math.round(headCm * 10) / 10,
        })
        break
      }
      case 'visit':
        record({
          ...base,
          type: 'visit',
          reason: pick(cells, /reason|title|purpose|description|details/) ?? (typeText || 'Visit'),
          place: pick(cells, /place|location|hospital|clinic/),
          doctor: pick(cells, /doctor|provider|physician/),
          followUp: null,
        })
        break
      case 'vaccine':
        record({ ...base, type: 'vaccine', vaccine: pick(cells, /vaccine|name|details|item/) ?? (typeText || 'Vaccine') })
        break
    }
  }
  return out
}

// ---------- our own export (exact round trip) ----------

const OUR_ENTRY_HEADERS = ['type', 'start', 'end', 'amount_ml', 'milk', 'left_min', 'right_min', 'left_ml', 'right_ml', 'diaper', 'medicine', 'dose', 'temp_c', 'note', 'logged_by', 'breast_milk_ml', 'food', 'meal']
const OUR_RECORD_HEADERS = ['type', 'date', 'reason', 'place', 'doctor', 'follow_up', 'vaccine', 'weight_kg', 'length_cm', 'head_cm', 'question', 'asked', 'notes', 'logged_by']
const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x.toLowerCase() === b[i])
// Older exports stop earlier: no breast_milk_ml (before mixed bottles), no food/meal (before solids).
export const isOurEntries = (headers: string[]) => [15, 16, 18].some((n) => same(headers, OUR_ENTRY_HEADERS.slice(0, n)))
export const isOurRecords = (headers: string[]) => same(headers, OUR_RECORD_HEADERS)
export const isOurs = (headers: string[]) => isOurEntries(headers) || isOurRecords(headers)

const opt = (s: string) => (s.trim() ? s.trim() : undefined)
const optNum = (s: string) => (s.trim() ? Number(s) : undefined)
const when = (s: string) => (s.trim() ? parseWhen(s, undefined, 'YMD') : null)

function convertOurEntries(file: CsvFile): ImportResult {
  const out: ImportResult = { entries: [], records: [], skipped: {} }
  const types: EntryType[] = ['bottle', 'breast', 'solid', 'pump', 'diaper', 'sleep', 'med', 'temp']
  for (const r of file.rows) {
    const [type, start, end, amount, milk, lmin, rmin, lml, rml, diaper, med, dose, temp, note, , bmMl = '', food = '', meal = ''] = r
    const time = when(start)
    if (!types.includes(type as EntryType) || time == null || Number.isNaN(time)) {
      out.skipped['Row not readable'] = (out.skipped['Row not readable'] ?? 0) + 1
      continue
    }
    const e: Omit<Draft<Entry>, 'id'> = {
      type: type as EntryType,
      time,
      endTime: type === 'breast' || type === 'sleep' ? when(end) : undefined,
      amountMl: optNum(amount),
      milk: (opt(milk) as Entry['milk']) ?? undefined,
      breastMilkMl: optNum(bmMl),
      food: opt(food),
      meal: (opt(meal) as Entry['meal']) ?? undefined,
      leftSec: lmin.trim() ? Math.round(Number(lmin) * 60) : type === 'breast' ? 0 : undefined,
      rightSec: rmin.trim() ? Math.round(Number(rmin) * 60) : type === 'breast' ? 0 : undefined,
      activeSide: type === 'breast' ? null : undefined,
      activeSince: type === 'breast' ? null : undefined,
      leftMl: optNum(lml),
      rightMl: optNum(rml),
      diaper: (opt(diaper) as Entry['diaper']) ?? undefined,
      medName: opt(med),
      dose: opt(dose),
      tempC: optNum(temp),
      note: opt(note),
    }
    // A timer still running when exported has no end; finish it at its start.
    if ((type === 'breast' || type === 'sleep') && e.endTime == null) e.endTime = time
    out.entries.push({ ...e, id: hashId([e.type, e.time, e.amountMl, e.leftSec, e.rightSec, e.diaper, e.medName, e.tempC, e.leftMl, e.endTime]) })
  }
  return out
}

function convertOurRecords(file: CsvFile): ImportResult {
  const out: ImportResult = { entries: [], records: [], skipped: {} }
  for (const r of file.rows) {
    const [type, date, reason, place, doctor, followUp, vaccine, w, l, hc, question, asked, notes] = r
    const time = when(date)
    if (!['visit', 'vaccine', 'growth', 'question'].includes(type) || time == null || Number.isNaN(time)) {
      out.skipped['Row not readable'] = (out.skipped['Row not readable'] ?? 0) + 1
      continue
    }
    const rec: Omit<Draft<HealthRecord>, 'id'> = {
      type: type as HealthRecord['type'],
      time,
      reason: opt(reason),
      place: opt(place),
      doctor: opt(doctor),
      followUp: type === 'visit' ? when(followUp) : undefined,
      vaccine: opt(vaccine),
      weightKg: optNum(w),
      lengthCm: optNum(l),
      headCm: optNum(hc),
      text: opt(question),
      done: type === 'question' ? asked === 'yes' : undefined,
      note: opt(notes),
    }
    out.records.push({ ...rec, id: hashId([rec.type, rec.time, rec.weightKg, rec.lengthCm, rec.headCm, rec.vaccine, rec.reason, rec.text]) })
  }
  return out
}
