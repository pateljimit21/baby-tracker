import type { AppUser, Baby, Entry, Family, HealthRecord } from '../types'
import { type Backend, newId, newInviteCode, normalizeCode, stamp } from './backend'

// Demo mode: everything lives in this browser's localStorage. Other tabs in the
// same browser stay in sync, which is handy for trying "two phones" side by side.

const KEY = 'babylog-demo-v1'
const AUTH_KEY = 'babylog-demo-user'

interface DemoData {
  families: Record<string, Family>
  invites: Record<string, string>
  babies: Record<string, Record<string, Baby>>
  entries: Record<string, Record<string, Entry>>
  records: Record<string, Record<string, HealthRecord>>
}

const empty = (): DemoData => ({ families: {}, invites: {}, babies: {}, entries: {}, records: {} })

function load(): DemoData {
  try {
    return { ...empty(), ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return empty()
  }
}

const newestFirst = <T extends { time: number }>(a: T, b: T) => b.time - a.time

export function createDemoBackend(): Backend {
  let data = load()
  const listeners = new Set<() => void>()
  const authListeners = new Set<(u: AppUser | null) => void>()

  const notify = () => listeners.forEach((l) => l())
  const commit = (change: (d: DemoData) => void) => {
    change(data)
    try {
      localStorage.setItem(KEY, JSON.stringify(data))
    } catch {
      // Storage full or blocked: keep working in memory.
    }
    notify()
    return Promise.resolve()
  }
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) {
      data = load()
      notify()
    }
  })

  const watch = <T>(read: () => T, cb: (v: T) => void) => {
    const run = () => cb(read())
    listeners.add(run)
    queueMicrotask(run)
    return () => void listeners.delete(run)
  }

  const currentUser = (): AppUser | null => {
    try {
      return JSON.parse(localStorage.getItem(AUTH_KEY) ?? 'null')
    } catch {
      return null
    }
  }
  const setUser = (u: AppUser | null) => {
    try {
      if (u) localStorage.setItem(AUTH_KEY, JSON.stringify(u))
      else localStorage.removeItem(AUTH_KEY)
    } catch {
      // ignore
    }
    authListeners.forEach((l) => l(u))
    return Promise.resolve()
  }
  // Demo accounts have no password check; the email decides who you are.
  const userFor = (email: string, name?: string): AppUser => ({
    uid: 'demo-' + email.trim().toLowerCase(),
    email: email.trim(),
    name: name?.trim() || email.split('@')[0],
  })

  const path = (familyId: string, babyId: string) => `${familyId}/${babyId}`

  return {
    mode: 'demo',

    onAuth(cb) {
      authListeners.add(cb)
      queueMicrotask(() => cb(currentUser()))
      return () => void authListeners.delete(cb)
    },
    signUp: (name, email) => setUser(userFor(email, name)),
    signIn: (email) => setUser(userFor(email)),
    resetPassword: () => Promise.resolve(),
    signOut: () => setUser(null),

    watchFamilies: (uid, cb) =>
      watch(() => Object.values(data.families).filter((f) => f.memberIds.includes(uid)), cb),

    createFamily(user, name) {
      const id = newId()
      const inviteCode = newInviteCode()
      return commit((d) => {
        d.families[id] = { id, name, memberIds: [user.uid], members: { [user.uid]: { name: user.name } }, inviteCode, createdBy: user.uid }
        d.invites[inviteCode] = id
      }).then(() => id)
    },

    async joinFamily(user, code) {
      const familyId = data.invites[normalizeCode(code)]
      if (!familyId) throw new Error("That code didn't work. Check it and try again.")
      await commit((d) => {
        const f = d.families[familyId]
        if (!f.memberIds.includes(user.uid)) f.memberIds.push(user.uid)
        f.members[user.uid] = { name: user.name, via: normalizeCode(code) }
      })
      return familyId
    },

    renameFamily: (familyId, name) => commit((d) => void (d.families[familyId].name = name)),

    newInviteCode: (family) =>
      commit((d) => {
        const code = newInviteCode()
        delete d.invites[family.inviteCode]
        d.invites[code] = family.id
        d.families[family.id].inviteCode = code
      }),

    removeMember: (family, uid) =>
      commit((d) => {
        const f = d.families[family.id]
        f.memberIds = f.memberIds.filter((m) => m !== uid)
        delete f.members[uid]
        const code = newInviteCode()
        delete d.invites[f.inviteCode]
        d.invites[code] = f.id
        f.inviteCode = code
      }),

    watchBabies: (familyId, cb) => watch(() => Object.values(data.babies[familyId] ?? {}), cb),
    saveBaby: (familyId, baby) => commit((d) => void ((d.babies[familyId] ??= {})[baby.id] = baby)),

    watchEntries: (familyId, babyId, since, cb, until = Infinity) =>
      watch(
        () =>
          Object.values(data.entries[path(familyId, babyId)] ?? {})
            .filter((e) => e.time >= since && e.time < until)
            .sort(newestFirst),
        cb,
      ),
    watchRecords: (familyId, babyId, cb) =>
      watch(() => Object.values(data.records[path(familyId, babyId)] ?? {}).sort(newestFirst), cb),

    saveEntry: (familyId, babyId, user, entry) =>
      commit((d) => void ((d.entries[path(familyId, babyId)] ??= {})[entry.id] = stamp(user, entry))),
    saveRecord: (familyId, babyId, user, record) =>
      commit((d) => void ((d.records[path(familyId, babyId)] ??= {})[record.id] = stamp(user, record))),
    deleteEntry: (familyId, babyId, id) => commit((d) => void delete d.entries[path(familyId, babyId)]?.[id]),
    deleteRecord: (familyId, babyId, id) => commit((d) => void delete d.records[path(familyId, babyId)]?.[id]),

    importAll: (familyId, babyId, user, { entries, records }, onProgress) =>
      commit((d) => {
        const key = path(familyId, babyId)
        for (const e of entries) (d.entries[key] ??= {})[e.id] = stamp(user, e)
        for (const r of records) (d.records[key] ??= {})[r.id] = stamp(user, r)
      }).then(() => onProgress?.(entries.length + records.length, entries.length + records.length)),

    deleteImported(familyId, babyId) {
      const key = path(familyId, babyId)
      let removed = 0
      return commit((d) => {
        for (const store of [d.entries[key] ?? {}, d.records[key] ?? {}])
          for (const id of Object.keys(store))
            if (id.startsWith('imp')) {
              delete store[id]
              removed++
            }
      }).then(() => removed)
    },

    exportAll: (familyId, babyId) =>
      Promise.resolve({
        entries: Object.values(data.entries[path(familyId, babyId)] ?? {}).sort(newestFirst),
        records: Object.values(data.records[path(familyId, babyId)] ?? {}).sort(newestFirst),
      }),
  }
}
