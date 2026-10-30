import { useCallback, useEffect, useState } from 'react'

// Per-phone settings (units, chosen family/baby). Kept in localStorage, not synced:
// Mom can use ml while Grandpa uses oz.

export function readPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem('babylog-' + key)
    return raw == null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export function writePref<T>(key: string, value: T) {
  try {
    localStorage.setItem('babylog-' + key, JSON.stringify(value))
  } catch {
    // Private mode or storage full: the setting just won't be remembered.
  }
}

export function usePref<T>(key: string, fallback: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => readPref(key, fallback))
  const set = useCallback(
    (v: T) => {
      setValue(v)
      writePref(key, v)
    },
    [key],
  )
  return [value, set]
}

/** Current time, refreshed every `ms`. Drives timers and "2h ago" labels. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms)
    // Phones pause timers in the background; catch up as soon as the app is visible.
    const onVisible = () => document.visibilityState === 'visible' && setNow(Date.now())
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [ms])
  return now
}
