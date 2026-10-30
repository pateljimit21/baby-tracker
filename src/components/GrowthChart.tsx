import { useState } from 'react'
import type { Point } from '../lib/growthCompare'
import { SERIES_COLORS, SeriesDot } from './CompareWith'

export interface Series {
  name: string
  points: Point[]
}

const W = 340
const H = 210
const PAD = { left: 40, right: 44, top: 12, bottom: 28 }

/**
 * Measurement by age in days. One line per baby; tap or hover a point for its value.
 * `display` converts stored values (kg, cm) to the unit shown, so gridlines land on round numbers in that unit.
 */
export function GrowthChart({
  series: stored,
  display,
  format,
  unit,
  maxAge: ageLimit = Infinity,
}: {
  series: Series[]
  display: (v: number) => number
  format: (v: number) => string
  unit: string
  /** Ages past this are left off, so the range that matters isn't squeezed into a corner. */
  maxAge?: number
}) {
  const [active, setActive] = useState<{ s: number; p: Point; raw: number } | null>(null)
  const series = stored.map((s) => ({
    ...s,
    points: s.points.filter((p) => p.age <= ageLimit).map((p) => ({ age: p.age, value: display(p.value), raw: p.value })),
  }))
  const all = series.flatMap((s) => s.points)
  if (all.length < 2) return null

  const maxAge = Math.max(30, ...all.map((p) => p.age))
  const xStep = maxAge <= 42 ? 7 : maxAge <= 180 ? 30 : maxAge <= 400 ? 60 : 180
  const xMax = Math.ceil(maxAge / xStep) * xStep
  const [lo, hi] = [Math.min(...all.map((p) => p.value)), Math.max(...all.map((p) => p.value))]
  const yStep = niceStep((hi - lo || hi * 0.1 || 1) / 4)
  const yMin = Math.floor(lo / yStep) * yStep
  const yMax = Math.max(yMin + yStep, Math.ceil(hi / yStep) * yStep)
  const x = (age: number) => PAD.left + (age / xMax) * (W - PAD.left - PAD.right)
  const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * (H - PAD.top - PAD.bottom)
  const yTicks = range(yMin, yMax, yStep)
  const xTicks = range(0, xMax, xStep)

  // Direct labels at each line's end, nudged apart if they'd overlap.
  const ends = series
    .map((s, i) => ({ i, name: s.name, last: s.points[s.points.length - 1] }))
    .filter((e) => e.last)
    .map((e) => ({ ...e, ly: y(e.last.value) }))
  if (ends.length === 2 && Math.abs(ends[0].ly - ends[1].ly) < 12) {
    const [top, bottom] = ends[0].ly <= ends[1].ly ? [ends[0], ends[1]] : [ends[1], ends[0]]
    const mid = (top.ly + bottom.ly) / 2
    top.ly = mid - 6
    bottom.ly = mid + 6
  }

  return (
    <div>
      {series.length > 1 && (
        <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600 dark:text-slate-300">
          {series.map((s, i) => (
            <span key={s.name} className="flex items-center gap-1.5">
              <SeriesDot index={i as 0 | 1} />
              {s.name}
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible" role="img" aria-label={`Chart of ${series.map((s) => s.name).join(' and ')} by age in days`}>
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className="stroke-slate-200 dark:stroke-slate-700" strokeWidth={1} />
              <text x={PAD.left - 6} y={y(v)} dy="0.32em" textAnchor="end" className="fill-slate-500 text-[10px] dark:fill-slate-400">
                {v} {unit}
              </text>
            </g>
          ))}
          {xTicks.map((a) => (
            <text key={a} x={x(a)} y={H - PAD.bottom + 16} textAnchor="middle" className="fill-slate-500 text-[10px] dark:fill-slate-400">
              {a === 0 ? 'Birth' : `Day ${a}`}
            </text>
          ))}

          {series.map((s, i) => (
            <g key={s.name}>
              <polyline
                points={s.points.map((p) => `${x(p.age)},${y(p.value)}`).join(' ')}
                fill="none"
                stroke={SERIES_COLORS[i]}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {s.points.map((p) => (
                <circle key={p.age} cx={x(p.age)} cy={y(p.value)} r={4} fill={SERIES_COLORS[i]} strokeWidth={2} className="stroke-white dark:stroke-slate-800" />
              ))}
            </g>
          ))}

          {ends.map((e) => (
            <text key={e.name} x={x(e.last.age) + 8} y={e.ly} dy="0.32em" className="fill-slate-600 text-[11px] font-semibold dark:fill-slate-300">
              {e.name.length > 7 ? e.name.slice(0, 6) + '…' : e.name}
            </text>
          ))}

          {active && (
            <circle cx={x(active.p.age)} cy={y(active.p.value)} r={7} fill="none" stroke={SERIES_COLORS[active.s]} strokeWidth={2} />
          )}

          {/* Hit targets bigger than the dots, so they're easy to tap. */}
          {series.map((s, i) =>
            s.points.map((p) => (
              <circle
                key={`hit${i}-${p.age}`}
                cx={x(p.age)}
                cy={y(p.value)}
                r={14}
                fill="transparent"
                className="cursor-pointer"
                onPointerEnter={() => setActive({ s: i, p, raw: p.raw })}
                onPointerLeave={() => setActive(null)}
                onClick={() => setActive({ s: i, p, raw: p.raw })}
              />
            )),
          )}
        </svg>
        {active && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-slate-900 px-2 py-1 text-xs whitespace-nowrap text-white shadow-lg dark:bg-slate-100 dark:text-slate-900"
            style={{ left: `${(x(active.p.age) / W) * 100}%`, top: `calc(${(y(active.p.value) / H) * 100}% - 10px)` }}
          >
            <span className="font-semibold">{series[active.s].name}</span> · {active.p.age === 0 ? 'birth' : `day ${active.p.age}`} · {format(active.raw)}
          </div>
        )}
      </div>
    </div>
  )
}

function niceStep(raw: number): number {
  const pow = 10 ** Math.floor(Math.log10(raw))
  const n = raw / pow
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow
}

function range(from: number, to: number, step: number): number[] {
  const out: number[] = []
  for (let v = from; v <= to + step / 1000; v += step) out.push(Math.round(v * 1000) / 1000)
  return out
}
