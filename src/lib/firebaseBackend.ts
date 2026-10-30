import { initializeApp } from 'firebase/app'
import {
  GoogleAuthProvider,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  getRedirectResult,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth'
import {
  arrayRemove,
  arrayUnion,
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  deleteField,
  doc,
  documentId,
  getDoc,
  getDocs,
  initializeFirestore,
  onSnapshot,
  orderBy,
  persistentLocalCache,
  persistentMultipleTabManager,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type Firestore,
  type Query,
} from 'firebase/firestore'
import type { AppUser, Baby, Entry, Family, HealthRecord } from '../types'
import { type Backend, newInviteCode, normalizeCode, stamp } from './backend'

const env = import.meta.env

export function createFirebaseBackend(): Backend {
  const app = initializeApp({
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  })
  const auth = getAuth(app)
  const db = initializeFirestore(app, {
    // Keeps a copy on the phone so the app opens instantly and works offline.
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    ignoreUndefinedProperties: true,
  })
  if (env.VITE_USE_EMULATORS === 'true') {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    connectFirestoreEmulator(db, '127.0.0.1', 8080)
  }

  const authListeners = new Set<(u: AppUser | null) => void>()
  const toUser = (u: User | null): AppUser | null =>
    u && { uid: u.uid, email: u.email ?? '', name: u.displayName || (u.email ?? '').split('@')[0] }

  // Right after creating a family, the phone can ask for its babies before the server has
  // saved the family, and the server refuses. So on "permission denied", try again a few times.
  const listen = <T>(q: Query<DocumentData>, cb: (items: T[]) => void) => {
    let off = () => {}
    let stopped = false
    let tries = 0
    const start = () => {
      off = onSnapshot(
        q,
        (snap) => {
          tries = 0
          cb(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as T))
        },
        (err) => {
          console.error('Sync error', err)
          if (err.code === 'permission-denied' && !stopped && tries < 6) setTimeout(() => !stopped && start(), 500 * 2 ** tries++)
        },
      )
    }
    start()
    return () => {
      stopped = true
      off()
    }
  }

  const babyCol = (familyId: string, babyId: string, sub: 'entries' | 'records') =>
    collection(db, 'families', familyId, 'babies', babyId, sub)

  return {
    mode: 'firebase',

    onAuth(cb) {
      authListeners.add(cb)
      const off = onAuthStateChanged(auth, (u) => cb(toUser(u)))
      return () => {
        authListeners.delete(cb)
        off()
      }
    },
    async signUp(name, email, password) {
      const { user } = await createUserWithEmailAndPassword(auth, email.trim(), password)
      await updateProfile(user, { displayName: name.trim() })
      // The sign-in event fired before the name was set, so send it again.
      authListeners.forEach((l) => l(toUser(user)))
    },
    async signIn(email, password) {
      await signInWithEmailAndPassword(auth, email.trim(), password)
    },
    resetPassword: (email) => sendPasswordResetEmail(auth, email.trim()),
    async signInWithGoogle() {
      const provider = new GoogleAuthProvider()
      provider.setCustomParameters({ prompt: 'select_account' })
      // Home Screen apps on iPhone can't show pop-ups, so go to Google's page and come back.
      if (isHomeScreenApp()) return signInWithRedirect(auth, provider)
      try {
        await signInWithPopup(auth, provider)
      } catch (err) {
        if ((err as { code?: string }).code === 'auth/popup-blocked') return signInWithRedirect(auth, provider)
        throw err
      }
    },
    finishGoogleSignIn: () => getRedirectResult(auth).then(() => undefined),
    signOut: () => signOut(auth),

    watchFamilies: (uid, cb) =>
      listen<Family>(query(collection(db, 'families'), where('memberIds', 'array-contains', uid)), cb),

    async createFamily(user, name) {
      const ref = doc(collection(db, 'families'))
      const inviteCode = await unusedCode(db)
      const batch = writeBatch(db)
      batch.set(ref, {
        name,
        memberIds: [user.uid],
        members: { [user.uid]: { name: user.name } },
        inviteCode,
        createdBy: user.uid,
      })
      batch.set(doc(db, 'invites', inviteCode), { familyId: ref.id })
      await batch.commit()
      return ref.id
    },

    async joinFamily(user, rawCode) {
      const code = normalizeCode(rawCode)
      const invite = code ? await getDoc(doc(db, 'invites', code)) : null
      if (!invite?.exists()) throw new Error("That code didn't work. Check it and try again.")
      const familyId = invite.data().familyId as string
      await setDoc(
        doc(db, 'families', familyId),
        { memberIds: arrayUnion(user.uid), members: { [user.uid]: { name: user.name, via: code } } },
        { merge: true },
      )
      return familyId
    },

    renameFamily: (familyId, name) => setDoc(doc(db, 'families', familyId), { name }, { merge: true }),

    async newInviteCode(family) {
      const code = await unusedCode(db)
      const batch = writeBatch(db)
      batch.delete(doc(db, 'invites', family.inviteCode))
      batch.set(doc(db, 'invites', code), { familyId: family.id })
      batch.update(doc(db, 'families', family.id), { inviteCode: code })
      await batch.commit()
    },

    async removeMember(family, uid) {
      const familyRef = doc(db, 'families', family.id)
      const leaving = { memberIds: arrayRemove(uid), [`members.${uid}`]: deleteField() }
      // Leaving yourself: you can't make a new code once you're out, and you chose to go.
      if (uid === auth.currentUser?.uid) return updateDoc(familyRef, leaving)
      const code = await unusedCode(db)
      const batch = writeBatch(db)
      batch.delete(doc(db, 'invites', family.inviteCode))
      batch.set(doc(db, 'invites', code), { familyId: family.id })
      batch.update(familyRef, { ...leaving, inviteCode: code })
      await batch.commit()
    },

    watchBabies: (familyId, cb) => listen<Baby>(collection(db, 'families', familyId, 'babies'), cb),
    saveBaby: (familyId, { id, ...baby }) => setDoc(doc(db, 'families', familyId, 'babies', id), baby),

    watchEntries: (familyId, babyId, since, cb, until) =>
      listen<Entry>(
        query(
          babyCol(familyId, babyId, 'entries'),
          where('time', '>=', since),
          ...(until == null ? [] : [where('time', '<', until)]),
          orderBy('time', 'desc'),
        ),
        cb,
      ),
    watchRecords: (familyId, babyId, cb) =>
      listen<HealthRecord>(query(babyCol(familyId, babyId, 'records'), orderBy('time', 'desc')), cb),

    saveEntry: (familyId, babyId, user, { id, ...entry }) =>
      setDoc(doc(babyCol(familyId, babyId, 'entries'), id), stamp(user, entry)),
    saveRecord: (familyId, babyId, user, { id, ...record }) =>
      setDoc(doc(babyCol(familyId, babyId, 'records'), id), stamp(user, record)),
    deleteEntry: (familyId, babyId, id) => deleteDoc(doc(babyCol(familyId, babyId, 'entries'), id)),
    deleteRecord: (familyId, babyId, id) => deleteDoc(doc(babyCol(familyId, babyId, 'records'), id)),

    async importAll(familyId, babyId, user, { entries, records }, onProgress) {
      const writes = [
        ...entries.map(({ id, ...e }) => [doc(babyCol(familyId, babyId, 'entries'), id), stamp(user, e)] as const),
        ...records.map(({ id, ...r }) => [doc(babyCol(familyId, babyId, 'records'), id), stamp(user, r)] as const),
      ]
      // Firestore takes up to 500 writes per batch.
      for (let i = 0; i < writes.length; i += 400) {
        const batch = writeBatch(db)
        for (const [ref, data] of writes.slice(i, i + 400)) batch.set(ref, data)
        await batch.commit()
        onProgress?.(Math.min(i + 400, writes.length), writes.length)
      }
    },

    async deleteImported(familyId, babyId) {
      let removed = 0
      for (const sub of ['entries', 'records'] as const) {
        // Imported ids all start with "imp"; ids made in the app are hex, so they never do.
        const snap = await getDocs(query(babyCol(familyId, babyId, sub), where(documentId(), '>=', 'imp'), where(documentId(), '<', 'imq')))
        for (let i = 0; i < snap.docs.length; i += 400) {
          const batch = writeBatch(db)
          for (const d of snap.docs.slice(i, i + 400)) batch.delete(d.ref)
          await batch.commit()
        }
        removed += snap.size
      }
      return removed
    },

    async exportAll(familyId, babyId) {
      const [entries, records] = await Promise.all(
        (['entries', 'records'] as const).map((sub) =>
          getDocs(query(babyCol(familyId, babyId, sub), orderBy('time', 'desc'))).then((s) =>
            s.docs.map((d) => ({ ...d.data(), id: d.id })),
          ),
        ),
      )
      return { entries: entries as Entry[], records: records as HealthRecord[] }
    },
  }
}

function isHomeScreenApp(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
}

async function unusedCode(db: Firestore): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = newInviteCode()
    if (!(await getDoc(doc(db, 'invites', code))).exists()) return code
  }
  throw new Error('Could not make an invite code. Try again.')
}

