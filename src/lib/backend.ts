import type { AppUser, Baby, Entry, Family, HealthRecord, Unsubscribe } from '../types'

/** What the screens fill in; the backend adds who saved it and when. */
export type Draft<T> = Omit<T, 'by' | 'byName' | 'updatedAt'>

/**
 * Everything the app needs from storage. Two versions exist:
 * - firebase: the real one, shared between phones.
 * - demo: saved in this browser only, used until Firebase is set up.
 *
 * Saves return as soon as the change is stored on the phone. With Firebase they
 * sync in the background, so logging works with no signal.
 */
export interface Backend {
  mode: 'firebase' | 'demo'

  onAuth(cb: (user: AppUser | null) => void): Unsubscribe
  signUp(name: string, email: string, password: string): Promise<void>
  signIn(email: string, password: string): Promise<void>
  resetPassword(email: string): Promise<void>
  /** Not available in demo mode. */
  signInWithGoogle?(): Promise<void>
  /** After a Google sign-in that left the app and came back: throws if it failed. */
  finishGoogleSignIn?(): Promise<void>
  signOut(): Promise<void>

  watchFamilies(uid: string, cb: (families: Family[]) => void): Unsubscribe
  createFamily(user: AppUser, name: string): Promise<string>
  /** Returns the family id. Throws a friendly Error if the code is wrong. */
  joinFamily(user: AppUser, code: string): Promise<string>
  renameFamily(familyId: string, name: string): Promise<void>
  /** Replaces the invite code; the old one stops working. */
  newInviteCode(family: Family): Promise<void>
  /** Removes someone (or yourself) and replaces the invite code so they can't rejoin with it. */
  removeMember(family: Family, uid: string): Promise<void>

  watchBabies(familyId: string, cb: (babies: Baby[]) => void): Unsubscribe
  saveBaby(familyId: string, baby: Baby): Promise<void>

  /** Entries from `since` (up to `until`, if given), newest first. */
  watchEntries(familyId: string, babyId: string, since: number, cb: (entries: Entry[]) => void, until?: number): Unsubscribe
  /** All health records, newest first. */
  watchRecords(familyId: string, babyId: string, cb: (records: HealthRecord[]) => void): Unsubscribe
  saveEntry(familyId: string, babyId: string, user: AppUser, entry: Draft<Entry>): Promise<void>
  saveRecord(familyId: string, babyId: string, user: AppUser, record: Draft<HealthRecord>): Promise<void>
  deleteEntry(familyId: string, babyId: string, id: string): Promise<void>
  deleteRecord(familyId: string, babyId: string, id: string): Promise<void>
  exportAll(familyId: string, babyId: string): Promise<{ entries: Entry[]; records: HealthRecord[] }>
  /** Saves many at once. Ids are already set, so importing the same rows again replaces them. */
  importAll(
    familyId: string,
    babyId: string,
    user: AppUser,
    data: { entries: Draft<Entry>[]; records: Draft<HealthRecord>[] },
    onProgress?: (saved: number, total: number) => void,
  ): Promise<void>
  /** Deletes everything earlier imports added for this baby (their ids start with "imp"). Returns how many. */
  deleteImported(familyId: string, babyId: string): Promise<number>
}

export function newId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 20)
}

// No 0/O or 1/I/L, so codes are easy to read out loud or type.
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function newInviteCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join('')
}

export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function stamp<T>(user: AppUser, draft: T): T & { by: string; byName: string; updatedAt: number } {
  return { ...draft, by: user.uid, byName: user.name, updatedAt: Date.now() }
}

export function hasFirebaseConfig(): boolean {
  return Boolean(import.meta.env.VITE_FIREBASE_API_KEY)
}

export async function loadBackend(): Promise<Backend> {
  if (hasFirebaseConfig()) {
    const { createFirebaseBackend } = await import('./firebaseBackend')
    return createFirebaseBackend()
  }
  const { createDemoBackend } = await import('./demoBackend')
  return createDemoBackend()
}
