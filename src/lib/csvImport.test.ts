import { describe, expect, test } from 'vitest'
import type { Entry, HealthRecord } from '../types'
import { entriesCsv, recordsCsv } from './csv'
import { convert, guessMapping, parseCsv, parseDuration, parseWhen, readCsv } from './csvImport'

const local = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime()
const NOW = local(2026, 10, 22, 12)

function run(name: string, text: string) {
  const file = readCsv(name, text)
  const mapping = guessMapping(file, 'MDY')
  return { file, mapping, ...convert(file, mapping, NOW) }
}

describe('reading CSV', () => {
  test('quotes, commas inside quotes, CRLF and a byte-order mark', () => {
    expect(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n\r\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
    ])
  })
  test('semicolon files (common in Europe)', () => {
    expect(parseCsv('Date;Amount\n22/10/2026;120')).toEqual([
      ['Date', 'Amount'],
      ['22/10/2026', '120'],
    ])
  })
})

describe('dates and durations', () => {
  test.each([
    ['2026-10-22 14:47', undefined, 'MDY', local(2026, 10, 22, 14, 47)],
    ['2026-10-22T14:47:00', undefined, 'MDY', local(2026, 10, 22, 14, 47)],
    ['10/22/2026 2:47 PM', undefined, 'MDY', local(2026, 10, 22, 14, 47)],
    ['22/10/2026', '14:47', 'DMY', local(2026, 10, 22, 14, 47)],
    ['22.10.26', '2:47 pm', 'DMY', local(2026, 10, 22, 14, 47)],
    ['Oct 22, 2026 12:05 AM', undefined, 'MDY', local(2026, 10, 22, 0, 5)],
    ['22 October 2026', '09:30', 'MDY', local(2026, 10, 22, 9, 30)],
  ] as const)('%s %s', (d, t, order, expected) => {
    expect(parseWhen(d, t, order)).toBe(expected)
  })

  test('UTC times convert to local', () => {
    expect(parseWhen('2026-10-22T14:47:00Z', undefined, 'MDY')).toBe(Date.UTC(2026, 9, 22, 14, 47))
  })

  test.each([
    ['0:20', '', 20 * 60],
    ['01:30:00', '', 90 * 60],
    ['15 min', '', 15 * 60],
    ['1h 20m', '', 80 * 60],
    ['90', 'duration (min)', 90 * 60],
    ['45', 'seconds', 45],
  ])('duration %s', (v, h, expected) => {
    expect(parseDuration(v, h)).toBe(expected)
  })
})

describe('Sip & Snooze export round trip', () => {
  test('entries and records come back the same, and re-importing gives the same ids', () => {
    const base = { by: 'u', byName: 'Mom', updatedAt: 0 }
    const entries: Entry[] = [
      { ...base, id: '1', type: 'bottle', time: local(2026, 10, 21, 8), amountMl: 90, milk: 'formula' },
      { ...base, id: '2', type: 'breast', time: local(2026, 10, 21, 10), endTime: local(2026, 10, 21, 10, 20), leftSec: 600, rightSec: 600, activeSide: null, activeSince: null },
      { ...base, id: '3', type: 'diaper', time: local(2026, 10, 21, 11), diaper: 'both', note: 'rash, a little' },
      { ...base, id: '4', type: 'sleep', time: local(2026, 10, 21, 12), endTime: local(2026, 10, 21, 14) },
      { ...base, id: '5', type: 'med', time: local(2026, 10, 21, 15), medName: 'Vitamin D', dose: '1 drop' },
      { ...base, id: '6', type: 'temp', time: local(2026, 10, 21, 16), tempC: 37.4 },
      { ...base, id: '7', type: 'pump', time: local(2026, 10, 21, 17), leftMl: 60, rightMl: 50 },
    ]
    const records: HealthRecord[] = [
      { ...base, id: 'a', type: 'growth', time: local(2026, 10, 5, 12), weightKg: 3.4, lengthCm: 50 },
      { ...base, id: 'b', type: 'visit', time: local(2026, 10, 19, 9), reason: '2-week checkup', place: 'Sunrise', followUp: local(2026, 11, 5, 10, 30) },
      { ...base, id: 'c', type: 'question', time: local(2026, 10, 20, 9), text: 'How much per feed?', done: false },
    ]
    const e = run('aria-log.csv', entriesCsv(entries))
    const r = run('aria-health.csv', recordsCsv(records))
    expect(e.skipped).toEqual({})
    expect(e.entries.map(({ id: _id, ...x }) => Object.fromEntries(Object.entries(x).filter(([, v]) => v !== undefined)))).toEqual(
      entries.map(({ id: _id, by: _b, byName: _n, updatedAt: _u, ...x }) => x),
    )
    expect(r.records.map((x) => [x.type, x.time, x.weightKg, x.reason, x.followUp, x.text, x.done])).toEqual([
      ['growth', records[0].time, 3.4, undefined, undefined, undefined, undefined],
      ['visit', records[1].time, undefined, '2-week checkup', records[1].followUp, undefined, undefined],
      ['question', records[2].time, undefined, undefined, undefined, 'How much per feed?', false],
    ])
    expect(run('again.csv', entriesCsv(entries)).entries.map((x) => x.id)).toEqual(e.entries.map((x) => x.id))
  })
})

describe('other apps', () => {
  test('one file with an activity column (Huckleberry-style)', () => {
    const { mapping, entries, skipped } = run(
      'huckleberry.csv',
      [
        'Type,Start,End,Duration,Start Condition,Start Location,End Condition,Notes',
        'Feed,2026-10-20 08:00,2026-10-20 08:20,00:20,,Breast,"0:12L, 0:08R",',
        'Feed,2026-10-20 11:00,,,Formula,Bottle,120ml,spit up',
        'Diaper,2026-10-20 11:30,,,,,Both,',
        'Sleep,2026-10-20 12:00,2026-10-20 13:30,01:30,,,,',
        'Pump,2026-10-20 14:00,,,,,4oz,',
        'Tummy time,2026-10-20 15:00,,00:10,,,,',
      ].join('\n'),
    )
    expect(mapping.date).toBe(1)
    expect(mapping.type).toBe(0)
    expect(mapping.end).toBe(2)
    expect(mapping.note).toBe(7)
    expect(entries.map((e) => e.type)).toEqual(['breast', 'bottle', 'diaper', 'sleep', 'pump'])
    expect(entries[0]).toMatchObject({ leftSec: 720, rightSec: 480, time: local(2026, 10, 20, 8) })
    expect(entries[1]).toMatchObject({ amountMl: 120, milk: 'formula', note: 'spit up' })
    expect(entries[2]).toMatchObject({ diaper: 'both' })
    expect(entries[3]).toMatchObject({ endTime: local(2026, 10, 20, 13, 30) })
    expect(entries[4]).toMatchObject({ leftMl: 118.29 })
    expect(skipped).toEqual({ '"Tummy time" isn\'t something Sip & Snooze tracks': 1 })
  })

  test('separate date and time columns, day-first dates, units in their own column', () => {
    const { mapping, entries, records, skipped } = run(
      'export.csv',
      [
        'Date,Time,Activity,Amount,Unit,Duration (min),Side,Details,Notes',
        '22/10/2026,2:05 AM,Bottle,4,oz,,,Breast milk,',
        '22/10/2026,4:30 AM,Nursing,,,15,Left,,',
        '22/10/2026,5:00 AM,Diaper,,,,,Pee,',
        '21/10/2026,9:00 PM,Sleep,,,90,,,',
        '21/10/2026,8:00 AM,Medicine,1,drop,,,Vitamin D,',
        '21/10/2026,7:00 AM,Temperature,99.5,F,,,,',
        '13/10/2026,10:00 AM,Weight,3.6,kg,,,,newborn visit',
      ].join('\n'),
    )
    expect(mapping.dateOrder).toBe('DMY')
    expect(mapping.time).toBe(1)
    expect(mapping.type).toBe(2)
    expect(skipped).toEqual({})
    expect(entries.map((e) => e.type)).toEqual(['bottle', 'breast', 'diaper', 'sleep', 'med', 'temp'])
    expect(entries[0]).toMatchObject({ amountMl: 118.29, milk: 'breastmilk', time: local(2026, 10, 22, 2, 5) })
    expect(entries[1]).toMatchObject({ leftSec: 900, rightSec: 0 })
    expect(entries[2]).toMatchObject({ diaper: 'wet' })
    expect(entries[3]).toMatchObject({ endTime: local(2026, 10, 21, 22, 30) })
    expect(entries[4]).toMatchObject({ medName: 'Vitamin D' })
    expect(entries[5].tempC).toBeCloseTo(37.5, 1)
    expect(records[0]).toMatchObject({ type: 'growth', weightKg: 3.6, note: 'newborn visit' })
  })

  test('one file per activity, type taken from the file name', () => {
    const { mapping, entries } = run('Diapers.csv', ['Time,Status,Note', '10/21/2026 7:10 AM,Wet,', '10/21/2026 9:40 AM,Dirty,green', '10/21/2026 1:15 PM,Mixed,'].join('\n'))
    expect(mapping.type).toBeNull()
    expect(mapping.fixedType).toBe('diaper')
    expect(entries.map((e) => e.diaper)).toEqual(['wet', 'dirty', 'both'])
    expect(entries[1].note).toBe('green')
  })

  test('generic "Feed" rows become bottle or breast from what they contain', () => {
    const { entries, skipped } = run(
      'feeds.csv',
      ['Start,Activity,Amount (ml),Left (min),Right (min)', '2026-10-21 06:00,Feeding,90,,', '2026-10-21 09:00,Feeding,,10,7', '2026-10-21 12:00,Feeding,,,'].join('\n'),
    )
    expect(entries.map((e) => [e.type, e.amountMl, e.leftSec, e.rightSec])).toEqual([
      ['bottle', 90, undefined, undefined],
      ['breast', undefined, 600, 420],
    ])
    expect(skipped).toEqual({ 'Feed with no amount or duration': 1 })
  })

  test('unreadable and future dates are skipped, not guessed', () => {
    const { entries, skipped } = run('x.csv', ['Date,Type,Amount', 'yesterday,Bottle,90', '2027-05-01 10:00,Bottle,90', '2026-10-21 10:00,Bottle,90'].join('\n'))
    expect(entries).toHaveLength(1)
    expect(skipped).toEqual({ 'Date not readable': 1, 'Date is in the future': 1 })
  })
})

describe('Nara-style export', () => {
  const nara = [
    '"Type","Profile Name","Start Date/time","Start Date/time (Epoch)","Created By Caregiver","Note","Time Zone","[Diaper] Type","[Bottle Feed] Type","[Bottle Feed] Breast Milk Volume","[Bottle Feed] Breast Milk Volume Unit","[Bottle Feed] Formula Name","[Bottle Feed] Formula Volume","[Bottle Feed] Formula Volume Unit","[Breastfeed] Left Duration (Seconds)","[Breastfeed] Right Duration (Seconds)","[Growth] Height","[Growth] Height Unit","[Growth] Weight","[Growth] Weight Unit","[Solid Feed] Food","[Profile] Birth Date","_activityKey"',
    '"Bottle Feed","Leo","2025-01-01 21:32:00","1735788720000","Mom",,"America/Chicago",,"Formula",,,"Similac","1.5","FLOZ",,,,,,,,,"t-Poopwet1"',
    '"Bottle Feed","Leo","2025-01-01 18:00:00","1735776000000","Mom",,"America/Chicago",,"Breast Milk Formula","1","FLOZ","Similac","2","FLOZ",,,,,,,,,"t-abc2"',
    '"Bottle Feed","Leo","2025-01-01 12:00:00","1735754400000","Mom",,"America/Chicago",,"Breast Milk","39","ML",,,,,,,,,,,,"t-abc3"',
    '"Diaper","Leo","2025-01-01 10:00:00","1735747200000","Mom",,"America/Chicago","Dirty Wet",,,,,,,,,,,,,,,"t-abc4"',
    '"Breastfeed","Leo","2025-01-01 08:00:00","1735740000000","Mom",,"America/Chicago",,,,,,,,"787","1006",,,,,,,"t-abc5"',
    '"Growth","Leo","2024-12-24 00:00:00","1735020000000","Mom",,"America/Chicago",,,,,,,,,,,,"10.0625","LB",,,"t-abc6"',
    '"Solid Feed","Leo","2025-01-01 13:00:00","1735758000000","Mom",,"America/Chicago",,,,,,,,,,,,,,"Oatmeal",,"t-abc7"',
    '"Profile","Leo",,,,,,,,,,,,,,,,,,,,"2024-11-20",',
  ].join('\n')

  test('units in their own columns, split bottles, ids from the app, no false matches in ids', () => {
    const { entries, records, skipped, birthDate } = run('export_narababy_leo.csv', nara)
    expect(entries.map((e) => e.type)).toEqual(['bottle', 'bottle', 'bottle', 'diaper', 'breast', 'solid'])
    expect(entries[0]).toMatchObject({ amountMl: 44.36, milk: 'formula' })
    expect(entries[1]).toMatchObject({ amountMl: 88.72, milk: 'mixed', breastMilkMl: 29.57 })
    expect(entries[2]).toMatchObject({ amountMl: 39, milk: 'breastmilk' })
    expect(entries[3].diaper).toBe('both')
    expect(entries[4]).toMatchObject({ leftSec: 787, rightSec: 1006 })
    expect(records[0].weightKg).toBeCloseTo(4.564, 3)
    expect(records[0].lengthCm).toBeUndefined()
    expect(entries[5]).toMatchObject({ food: 'Oatmeal' })
    expect(skipped).toEqual({ '"Profile" isn\'t something Sip & Snooze tracks': 1 })
    expect(new Date(birthDate!).toDateString()).toBe(new Date(2024, 10, 20).toDateString())
    expect(new Set(entries.map((e) => e.id)).size).toBe(6)
  })
})
