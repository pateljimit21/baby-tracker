import { usePref } from '../lib/prefs'
import { useBaby } from '../state'
import type { Baby } from '../types'
import { Segmented } from './ui'

// Series colors for "this baby" vs "sibling". Checked for color-blind separation and
// contrast on both the light (#fff) and dark (slate-800) card backgrounds.
export const SERIES_COLORS = ['#0d9488', '#d97706'] as const

/** The sibling picked to compare with (shared by History and Growth, remembered per phone). */
export function useCompareSibling() {
  const { baby, babies } = useBaby()
  const siblings = (babies ?? []).filter((b) => b.id !== baby.id)
  const [compareId, setCompareId] = usePref<string>('compare-with', '')
  return { siblings, sib: siblings.find((b) => b.id === compareId), setCompareId }
}

export function CompareWithPicker({ siblings, sib, onChange }: { siblings: Baby[]; sib: Baby | undefined; onChange: (id: string) => void }) {
  if (!siblings.length) return null
  return (
    <div>
      <div className="mb-1 px-1 text-xs font-medium text-slate-500 uppercase dark:text-slate-400">Compare at the same age with</div>
      <Segmented options={[{ value: '', label: 'No one' }, ...siblings.map((b) => ({ value: b.id, label: b.name }))]} value={sib ? sib.id : ''} onChange={onChange} />
    </div>
  )
}

/** Colored dot that carries a baby's identity next to its (normally colored) name. */
export function SeriesDot({ index }: { index: 0 | 1 }) {
  return <span className="inline-block size-2.5 shrink-0 rounded-full" style={{ background: SERIES_COLORS[index] }} aria-hidden />
}
