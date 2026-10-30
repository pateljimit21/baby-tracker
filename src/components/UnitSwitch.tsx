import type { ReactNode } from 'react'
import type { TempUnit, VolumeUnit, WeightUnit } from '../lib/format'
import { usePref } from '../lib/prefs'
import { useApp } from '../state'
import { cx } from './ui'

export type LengthUnit = 'cm' | 'in'

/**
 * The units used when typing a measurement, switchable right on the form (like Nara's "fl oz | mL").
 * Each is remembered on this phone for next time. They start from Settings → Units but don't
 * change it: you can log in ml and still read totals in oz.
 */
export function useEntryUnits() {
  const { units } = useApp()
  const [volume, setVolume] = usePref<VolumeUnit>('entry-volume', units.volume)
  const [temp, setTemp] = usePref<TempUnit>('entry-temp', units.temp)
  const [weight, setWeight] = usePref<WeightUnit>('entry-weight', units.weight)
  const [length, setLength] = usePref<LengthUnit>('entry-length', units.weight === 'kg' ? 'cm' : 'in')
  return { volume, setVolume, temp, setTemp, weight, setWeight, length, setLength }
}

/** Small pill switch, e.g. [ oz | ml ]. Switching keeps the typed number and changes its unit. */
export function UnitSwitch<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full bg-slate-200 p-0.5 dark:bg-slate-900">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'min-h-9 min-w-12 rounded-full px-3 text-sm font-bold',
            value === o.value ? 'bg-white text-teal-800 shadow-sm dark:bg-slate-700 dark:text-teal-300' : 'text-slate-600 dark:text-slate-400',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** A field heading with a unit switch on the right, then the input(s). */
export function MeasureField({ label, unit, children }: { label: string; unit: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{label}</span>
        {unit}
      </div>
      {children}
    </div>
  )
}

export const VOLUME_OPTIONS: { value: VolumeUnit; label: string }[] = [
  { value: 'oz', label: 'fl oz' },
  { value: 'ml', label: 'ml' },
]
export const TEMP_OPTIONS: { value: TempUnit; label: string }[] = [
  { value: 'F', label: '°F' },
  { value: 'C', label: '°C' },
]
export const WEIGHT_OPTIONS: { value: WeightUnit; label: string }[] = [
  { value: 'lb', label: 'lb oz' },
  { value: 'kg', label: 'kg' },
]
export const LENGTH_OPTIONS: { value: LengthUnit; label: string }[] = [
  { value: 'in', label: 'in' },
  { value: 'cm', label: 'cm' },
]
