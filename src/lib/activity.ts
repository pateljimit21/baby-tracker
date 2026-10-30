import type { EntryType } from '../types'
import { usePref } from './prefs'

/** The groups used by History's filter and timeline (the same groups Nara uses). */
export type Category = 'feed' | 'pump' | 'diaper' | 'sleep' | 'health'

export const CATEGORY_OF: Record<EntryType, Category> = {
  bottle: 'feed',
  breast: 'feed',
  solid: 'feed',
  pump: 'pump',
  diaper: 'diaper',
  sleep: 'sleep',
  med: 'health',
  temp: 'health',
}

export const CATEGORIES: { key: Category; label: string; icon: string }[] = [
  { key: 'feed', label: 'Feed', icon: '🍼' },
  { key: 'pump', label: 'Pump', icon: '🥛' },
  { key: 'diaper', label: 'Diaper', icon: '🧷' },
  { key: 'sleep', label: 'Sleep', icon: '😴' },
  { key: 'health', label: 'Health', icon: '💊' },
]

const ALL = CATEGORIES.map((c) => c.key)

/** Which activity types History shows. Remembered per phone. */
export function useCategoryFilter(): [Set<Category>, (c: Category[]) => void] {
  const [shown, setShown] = usePref<Category[]>('history-filter', ALL)
  return [new Set(shown.length ? shown : ALL), setShown]
}
