import { useEffect, useMemo, useState } from 'react'
import { CompareWithPicker, SeriesDot, useCompareSibling } from '../components/CompareWith'
import { GrowthChart } from '../components/GrowthChart'
import { RecordSheet } from '../components/RecordSheet'
import { Card, Empty, SectionTitle, Segmented } from '../components/ui'
import { cmTo, fmtAge, fmtAgeDays, fmtDate, fmtLength, fmtWeight, kgTo, lengthUnit } from '../lib/format'
import { pointsByAge, valueAtAge, type Measure } from '../lib/growthCompare'
import { useBaby } from '../state'
import type { HealthRecord } from '../types'
import { AddButton, List, Row } from './Health'

const MEASURES: { key: Measure; label: string }[] = [
  { key: 'weightKg', label: 'Weight' },
  { key: 'lengthCm', label: 'Length' },
  { key: 'headCm', label: 'Head' },
]

export function Growth() {
  const { backend, family, records, units, baby } = useBaby()
  const [sheet, setSheet] = useState<{ record?: HealthRecord } | null>(null)
  const [measure, setMeasure] = useState<Measure>('weightKg')
  const { siblings, sib, setCompareId } = useCompareSibling()
  const growth = records.filter((r) => r.type === 'growth')
  const latest = (key: Measure) => growth.find((g) => g[key] != null)
  const w = latest('weightKg')
  const l = latest('lengthCm')
  const h = latest('headCm')

  // Change in weight since the measurement before the latest one.
  const prevW = w && growth.find((g) => g.weightKg != null && g.time < w.time)
  const gain = w && prevW ? w.weightKg! - prevW.weightKg! : null
  const gainDays = w && prevW ? Math.max(1, Math.round((w.time - prevW.time) / 86_400_000)) : null

  // The sibling's measurements (only a handful, so all of them).
  const [sibRecords, setSibRecords] = useState<HealthRecord[]>([])
  useEffect(() => {
    setSibRecords([])
    if (!sib) return
    return backend.watchRecords(family.id, sib.id, setSibRecords)
  }, [backend, family.id, sib?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const fmt = (m: Measure, v: number) => (m === 'weightKg' ? fmtWeight(v, units.weight) : fmtLength(v, units.weight))
  const display = (m: Measure, v: number) => (m === 'weightKg' ? kgTo(v, units.weight) : cmTo(v, units.weight))
  const mine = useMemo(() => Object.fromEntries(MEASURES.map(({ key }) => [key, pointsByAge(records, baby.birthDate, key)])) as Record<Measure, ReturnType<typeof pointsByAge>>, [records, baby.birthDate])
  const theirs = useMemo(
    () => (sib ? (Object.fromEntries(MEASURES.map(({ key }) => [key, pointsByAge(sibRecords, sib.birthDate, key)])) as Record<Measure, ReturnType<typeof pointsByAge>>) : null),
    [sibRecords, sib],
  )

  const describe = (g: HealthRecord) =>
    [g.weightKg != null && fmtWeight(g.weightKg, units.weight), g.lengthCm != null && fmtLength(g.lengthCm, units.weight), g.headCm != null && `head ${fmtLength(g.headCm, units.weight)}`]
      .filter(Boolean)
      .join(' · ')

  const chartSeries = [{ name: baby.name, points: mine[measure] }, ...(sib && theirs ? [{ name: sib.name, points: theirs[measure] }] : [])]
  const byAgeRows = theirs
    ? [...new Set([...mine[measure], ...theirs[measure]].map((p) => p.age))].sort((a, b) => b - a).map((age) => ({
        age,
        a: mine[measure].find((p) => p.age === age)?.value,
        b: theirs[measure].find((p) => p.age === age)?.value,
      }))
    : []

  return (
    <>
      <Card>
        <div className="grid grid-cols-3 gap-3 text-center">
          <Stat label="Weight" value={w ? fmtWeight(w.weightKg!, units.weight) : '–'} />
          <Stat label="Length" value={l ? fmtLength(l.lengthCm!, units.weight) : '–'} />
          <Stat label="Head" value={h ? fmtLength(h.headCm!, units.weight) : '–'} />
        </div>
        {gain != null && (
          <p className="mt-3 text-center text-sm text-slate-600 dark:text-slate-300">
            {gain >= 0 ? 'Gained' : 'Lost'} {units.weight === 'kg' ? `${Math.round(Math.abs(gain) * 1000)} g` : `${Math.round((Math.abs(gain) / 0.45359237) * 16 * 10) / 10} oz`} in {gainDays} day{gainDays === 1 ? '' : 's'}
          </p>
        )}
      </Card>

      {siblings.length > 0 && (
        <div className="mt-4">
          <CompareWithPicker siblings={siblings} sib={sib} onChange={setCompareId} />
        </div>
      )}

      {sib && theirs && (
        <>
          <SectionTitle>At the same age</SectionTitle>
          <Card className="p-0">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr>
                  <th />
                  <th className="px-2 pt-3 pb-2 text-right">
                    <span className="inline-flex items-center gap-1.5 font-bold">
                      <SeriesDot index={0} />
                      {baby.name}
                    </span>
                  </th>
                  <th className="px-4 pt-3 pb-2 text-right">
                    <span className="inline-flex items-center gap-1.5 font-bold">
                      <SeriesDot index={1} />
                      {sib.name}
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {MEASURES.map(({ key, label }) => {
                  const last = mine[key][mine[key].length - 1]
                  if (!last) return null
                  const other = valueAtAge(theirs[key], last.age)
                  return (
                    <tr key={key}>
                      <td className="px-4 py-2">
                        <span className="block text-slate-700 dark:text-slate-200">{label}</span>
                        <span className="block text-xs text-slate-500 dark:text-slate-400">{fmtAgeDays(last.age)}</span>
                      </td>
                      <td className="px-2 py-2 text-right font-bold whitespace-nowrap">{fmt(key, last.value)}</td>
                      <td className="px-4 py-2 text-right">
                        {other ? (
                          <>
                            <span className="block font-bold whitespace-nowrap">
                              {other.estimated && '≈ '}
                              {fmt(key, other.value)}
                            </span>
                            <span className="block text-xs text-slate-500 dark:text-slate-400">
                              {other.estimated ? 'estimated between weigh-ins' : other.measuredAt === last.age ? 'same day' : `measured on day ${other.measuredAt}`}
                            </span>
                          </>
                        ) : (
                          <span className="text-xs text-slate-500 dark:text-slate-400">No measurement near this age</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {!MEASURES.some(({ key }) => mine[key].length) && <p className="px-4 pb-3 text-sm text-slate-500 dark:text-slate-400">Add a measurement for {baby.name} to compare.</p>}
          </Card>
        </>
      )}

      {chartSeries.some((s) => s.points.length) && chartSeries.flatMap((s) => s.points).length >= 2 && (
        <>
          <SectionTitle>{sib ? 'By age' : 'Over time'}</SectionTitle>
          <Card className="space-y-3">
            <Segmented options={MEASURES.map((m) => ({ value: m.key, label: m.label }))} value={measure} onChange={setMeasure} />
            <GrowthChart
              series={chartSeries}
              display={(v) => display(measure, v)}
              format={(v) => fmt(measure, v)}
              unit={measure === 'weightKg' ? units.weight : lengthUnit(units.weight)}
              maxAge={sib ? Math.max(30, Math.ceil((mine[measure].at(-1)?.age ?? 0) * 1.5)) : undefined}
            />
            {sib && (theirs?.[measure].at(-1)?.age ?? 0) > Math.max(30, Math.ceil((mine[measure].at(-1)?.age ?? 0) * 1.5)) && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Showing up to {baby.name}'s age. {sib.name}'s later measurements are in the table.
              </p>
            )}
            {sib && byAgeRows.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer text-slate-600 dark:text-slate-300">Show as a table</summary>
                <table className="mt-2 w-full tabular-nums">
                  <thead className="text-xs text-slate-500 uppercase dark:text-slate-400">
                    <tr>
                      <th className="py-1 text-left font-medium">Age</th>
                      <th className="py-1 text-right font-medium">{baby.name}</th>
                      <th className="py-1 text-right font-medium">{sib.name}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {byAgeRows.map((r) => (
                      <tr key={r.age}>
                        <td className="py-1.5">{r.age === 0 ? 'Birth' : `Day ${r.age}`}</td>
                        <td className="py-1.5 text-right">{r.a != null ? fmt(measure, r.a) : ''}</td>
                        <td className="py-1.5 text-right">{r.b != null ? fmt(measure, r.b) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )}
          </Card>
        </>
      )}

      <SectionTitle action={<AddButton onClick={() => setSheet({})} />}>{sib ? `${baby.name}'s measurements` : 'Measurements'}</SectionTitle>
      {growth.length ? (
        <List>
          {growth.map((g) => (
            <Row key={g.id} onClick={() => setSheet({ record: g })} title={describe(g)} sub={`${fmtDate(g.time)} · ${fmtAge(baby.birthDate, g.time)}`} detail={g.note} />
          ))}
        </List>
      ) : (
        <Empty>Add your baby's birth weight and each measurement from checkups.</Empty>
      )}

      {sheet && <RecordSheet type="growth" record={sheet.record} onClose={() => setSheet(null)} />}
    </>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium text-slate-500 uppercase dark:text-slate-400">{label}</div>
      <div className="mt-1 font-bold">{value}</div>
    </div>
  )
}
