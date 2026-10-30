import { describe, expect, test } from 'vitest'
import { addDays, ageInDays, defaultUnits, fmtAgeMWD, fmtVolume, fmtWeight, kgToLbOz, lbOzToKg, mlTo, toMl } from './format'

describe('decimal amounts survive saving and showing', () => {
  test.each([0.5, 1.25, 2.25, 3.5, 4.75, 6])('%s oz', (oz) => {
    expect(mlTo(toMl(oz, 'oz'), 'oz')).toBe(oz)
  })
  test.each([12.5, 92.5, 120, 147.3])('%s ml', (ml) => {
    expect(mlTo(toMl(ml, 'ml'), 'ml')).toBe(ml)
  })
  test('labels', () => {
    expect(fmtVolume(toMl(2.25, 'oz'), 'oz')).toBe('2.25 oz')
    expect(fmtVolume(92.5, 'ml')).toBe('92.5 ml')
  })
})

describe('weight in pounds and ounces', () => {
  test('7 lb 8.5 oz round trip', () => {
    expect(kgToLbOz(lbOzToKg(7, 8.5))).toEqual({ lb: 7, oz: 8.5 })
    expect(fmtWeight(lbOzToKg(7, 8.5), 'lb')).toBe('7 lb 8.5 oz')
  })
  test('6 lb 15.97 oz rounds up to 7 lb 0 oz', () => {
    expect(kgToLbOz(lbOzToKg(6, 15.97))).toEqual({ lb: 7, oz: 0 })
  })
})

test('new phones start in oz / lb / °F in the US, metric elsewhere', () => {
  expect(defaultUnits('en-US')).toEqual({ volume: 'oz', weight: 'lb', temp: 'F' })
  expect(defaultUnits('en-GB')).toEqual({ volume: 'ml', weight: 'kg', temp: 'C' })
})

describe('matching siblings by age', () => {
  test('day of life counts calendar days, even across a clock change', () => {
    const birth = new Date(2026, 9, 20, 23, 30).getTime()
    expect(ageInDays(birth, new Date(2026, 9, 20, 23, 59).getTime())).toBe(0)
    expect(ageInDays(birth, new Date(2026, 10, 9, 8, 0).getTime())).toBe(20) // US clocks change Nov 1
  })
  test("a younger baby's day 20 lines up with the older sibling's day 20", () => {
    const older = new Date(2024, 2, 1, 4, 0).getTime()
    const younger = new Date(2026, 9, 2, 18, 0).getTime()
    const day20 = new Date(2026, 9, 22).getTime()
    const sibDay = addDays(new Date(2024, 2, 1).getTime(), ageInDays(younger, day20))
    expect(new Date(sibDay).toDateString()).toBe(new Date(2024, 2, 21).toDateString())
    expect(ageInDays(older, sibDay)).toBe(20)
  })
})

test('ages read like Nara: months, weeks, days', () => {
  const leo = new Date(2024, 10, 20, 9).getTime()
  expect(fmtAgeMWD(leo, new Date(2025, 0, 1).getTime())).toBe('1m 1w 5d')
  expect(fmtAgeMWD(leo, new Date(2024, 10, 20, 23).getTime())).toBe('0d')
  expect(fmtAgeMWD(leo, new Date(2024, 11, 10).getTime())).toBe('2w 6d')
  expect(fmtAgeMWD(new Date(2026, 0, 31).getTime(), new Date(2026, 2, 1).getTime())).toBe('1m 1d')
})
