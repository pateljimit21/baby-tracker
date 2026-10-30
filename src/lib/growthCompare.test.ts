import { describe, expect, test } from 'vitest'
import type { HealthRecord } from '../types'
import { pointsByAge, valueAtAge } from './growthCompare'

const day = (n: number, h = 10) => new Date(2026, 0, 1 + n, h).getTime()
const rec = (n: number, weightKg?: number, h?: number): HealthRecord => ({ id: String(n) + h, type: 'growth', time: day(n, h), weightKg, by: '', byName: '', updatedAt: 0 })

describe('growth at the same age', () => {
  const birth = day(0, 4)
  const points = pointsByAge([rec(30, 4.2), rec(0, 3.3), rec(14, 3.7), rec(14, 3.75, 16), rec(5)], birth, 'weightKg')

  test('oldest first, one per day (the later one), skipping records without that measurement', () => {
    expect(points).toEqual([
      { age: 0, value: 3.3 },
      { age: 14, value: 3.75 },
      { age: 30, value: 4.2 },
    ])
  })
  test('a weigh-in within 3 days counts as measured', () => {
    expect(valueAtAge(points, 16)).toEqual({ value: 3.75, measuredAt: 14, estimated: false })
  })
  test('between weigh-ins it is estimated in a straight line', () => {
    const v = valueAtAge(points, 22)!
    expect(v.estimated).toBe(true)
    expect(v.value).toBeCloseTo(3.975, 3)
  })
  test('no guess past the last weigh-in, or across a long gap', () => {
    expect(valueAtAge(points, 40)).toBeNull()
    expect(valueAtAge([{ age: 0, value: 3 }, { age: 100, value: 7 }], 50)).toBeNull()
  })
})
