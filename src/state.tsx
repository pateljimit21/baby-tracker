import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Backend, Draft } from './lib/backend'
import { addDays, defaultUnits, startOfDay, type Units } from './lib/format'
import { usePref } from './lib/prefs'
import type { AppUser, Baby, Entry, Family, HealthRecord } from './types'

interface AppState {
  backend: Backend
  /** undefined while checking, null when signed out */
  user: AppUser | null | undefined
  families: Family[] | undefined
  family: Family | undefined
  selectFamily: (id: string) => void
  babies: Baby[] | undefined
  baby: Baby | undefined
  selectBaby: (id: string) => void
  /** Entries from `since` onwards, newest first. */
  entries: Entry[]
  /** Start of the window kept loaded (the last week). Older days are loaded by the screen that shows them. */
  since: number
  records: HealthRecord[]
  units: Units
  setUnits: (u: Units) => void
  saveEntry: (e: Draft<Entry>) => void
  deleteEntry: (id: string) => void
  saveRecord: (r: Draft<HealthRecord>) => void
  deleteRecord: (id: string) => void
  toast: (msg: string) => void
  toastMsg: string | null
}

const Ctx = createContext<AppState | null>(null)

export function useApp(): AppState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp outside AppProvider')
  return v
}

/** Same as useApp, for screens that only show once a family and baby exist. */
export function useBaby() {
  const app = useApp()
  if (!app.user || !app.family || !app.baby) throw new Error('No baby selected')
  return { ...app, user: app.user, family: app.family, baby: app.baby }
}

export function AppProvider({ backend, children }: { backend: Backend; children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null | undefined>(undefined)
  const [families, setFamilies] = useState<Family[] | undefined>()
  const [familyId, setFamilyId] = usePref<string | null>('family', null)
  const [babies, setBabies] = useState<Baby[] | undefined>()
  const [babyId, setBabyId] = usePref<string | null>('baby', null)
  const [entries, setEntries] = useState<Entry[]>([])
  const [records, setRecords] = useState<HealthRecord[]>([])
  const [since] = useState(() => addDays(startOfDay(Date.now()), -7))
  const [units, setUnits] = usePref<Units>('units', defaultUnits())
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const toast = useCallback((msg: string) => {
    setToastMsg(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastMsg(null), 3500)
  }, [])

  useEffect(() => backend.onAuth(setUser), [backend])

  useEffect(() => {
    setFamilies(undefined)
    if (!user) return
    return backend.watchFamilies(user.uid, (fs) => setFamilies(fs.sort((a, b) => a.name.localeCompare(b.name))))
  }, [backend, user])

  const family = families?.find((f) => f.id === familyId) ?? families?.[0]

  useEffect(() => {
    setBabies(undefined)
    if (!family) return
    return backend.watchBabies(family.id, (bs) => setBabies(bs.sort((a, b) => a.birthDate - b.birthDate)))
  }, [backend, family?.id])

  const baby = babies?.find((b) => b.id === babyId) ?? babies?.[0]
  const familyKey = family?.id
  const babyKey = baby?.id

  useEffect(() => {
    setEntries([])
    if (!familyKey || !babyKey) return
    return backend.watchEntries(familyKey, babyKey, since, setEntries)
  }, [backend, familyKey, babyKey, since])

  useEffect(() => {
    setRecords([])
    if (!familyKey || !babyKey) return
    return backend.watchRecords(familyKey, babyKey, setRecords)
  }, [backend, familyKey, babyKey])


  // Saves don't wait for the server: they land on the phone at once and sync when online.
  const run = useCallback(
    (p: Promise<void>) =>
      p.catch((err) => {
        console.error(err)
        toast("Couldn't save. Check your connection and try again.")
      }),
    [toast],
  )

  const value = useMemo<AppState>(
    () => ({
      backend,
      user,
      families,
      family,
      selectFamily: setFamilyId,
      babies,
      baby,
      selectBaby: setBabyId,
      entries,
      since,
      records,
      units,
      setUnits,
      toast,
      toastMsg,
      saveEntry: (e) => user && familyKey && babyKey && void run(backend.saveEntry(familyKey, babyKey, user, e)),
      deleteEntry: (id) => familyKey && babyKey && void run(backend.deleteEntry(familyKey, babyKey, id)),
      saveRecord: (r) => user && familyKey && babyKey && void run(backend.saveRecord(familyKey, babyKey, user, r)),
      deleteRecord: (id) => familyKey && babyKey && void run(backend.deleteRecord(familyKey, babyKey, id)),
    }),
    [backend, user, families, family, setFamilyId, babies, baby, setBabyId, entries, since, records, units, setUnits, toast, toastMsg, familyKey, babyKey, run],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
