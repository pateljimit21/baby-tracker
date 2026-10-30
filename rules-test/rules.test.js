// Checks firestore.rules against the Firestore emulator.
// Run from baby-tracker/:  npm run test:rules
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import firebase from 'firebase/compat/app'
import 'firebase/compat/firestore'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, beforeEach, describe, test } from 'node:test'

const { arrayUnion, arrayRemove, delete: deleteField } = firebase.firestore.FieldValue

let env
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-babylog',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
  })
})
after(() => env.cleanup())
beforeEach(() => env.clearFirestore())

const db = (uid) => env.authenticatedContext(uid).firestore()

/** Same writes the app makes in createFamily(). */
async function createFamily(uid, familyId, code) {
  const d = db(uid)
  const batch = d.batch()
  batch.set(d.doc(`families/${familyId}`), {
    name: `${uid}'s family`,
    memberIds: [uid],
    members: { [uid]: { name: uid } },
    inviteCode: code,
    createdBy: uid,
  })
  batch.set(d.doc(`invites/${code}`), { familyId })
  return batch.commit()
}

/** Same write the app makes in joinFamily(). */
const join = (uid, familyId, code) =>
  db(uid).doc(`families/${familyId}`).set({ memberIds: arrayUnion(uid), members: { [uid]: { name: uid, via: code } } }, { merge: true })

const entry = (uid, extra = {}) => ({ type: 'bottle', time: Date.now(), amountMl: 90, by: uid, byName: uid, updatedAt: Date.now(), ...extra })

describe('families', () => {
  test('anyone signed in can start a family', async () => {
    await assertSucceeds(createFamily('mom', 'smith', 'AAAAAA'))
  })

  test('signed-out visitors can do nothing', async () => {
    await createFamily('mom', 'smith', 'AAAAAA')
    const anon = env.unauthenticatedContext().firestore()
    await assertFails(anon.doc('families/smith').get())
    await assertFails(anon.doc('invites/AAAAAA').get())
  })

  test("can't create a family that lists someone else as a member", async () => {
    const d = db('eve')
    await assertFails(
      d.doc('families/x').set({ name: 'x', memberIds: ['eve', 'mom'], members: { eve: { name: 'eve' } }, inviteCode: 'X', createdBy: 'eve' }),
    )
  })

  test("members see their family; outsiders can't read or list it", async () => {
    await createFamily('mom', 'smith', 'AAAAAA')
    await assertSucceeds(db('mom').doc('families/smith').get())
    await assertSucceeds(db('mom').collection('families').where('memberIds', 'array-contains', 'mom').get())
    await assertFails(db('eve').doc('families/smith').get())
    await assertFails(db('eve').collection('families').get())
  })

  test("can't make an invite code for someone else's family", async () => {
    await createFamily('mom', 'smith', 'AAAAAA')
    await assertFails(db('eve').doc('invites/EVE123').set({ familyId: 'smith' }))
  })
})

describe('joining', () => {
  beforeEach(() => createFamily('mom', 'smith', 'AAAAAA'))

  test('joining with the right code works, then logs are visible', async () => {
    const invite = await assertSucceeds(db('dad').doc('invites/AAAAAA').get())
    await assertSucceeds(join('dad', invite.data().familyId, 'AAAAAA'))
    await db('mom').doc('families/smith/babies/aria/entries/e1').set(entry('mom'))
    await assertSucceeds(db('dad').doc('families/smith/babies/aria/entries/e1').get())
  })

  test('joining with a wrong code fails', async () => {
    await assertFails(join('eve', 'smith', 'ZZZZZZ'))
  })

  test('a joiner can only add themselves, nothing else', async () => {
    const ref = db('eve').doc('families/smith')
    await assertFails(ref.set({ memberIds: arrayUnion('eve', 'friend'), members: { eve: { name: 'eve', via: 'AAAAAA' } } }, { merge: true }))
    await assertFails(ref.set({ name: 'Hacked', memberIds: arrayUnion('eve'), members: { eve: { name: 'eve', via: 'AAAAAA' } } }, { merge: true }))
    await assertFails(ref.set({ memberIds: arrayUnion('eve'), members: { mom: deleteField(), eve: { name: 'eve', via: 'AAAAAA' } } }, { merge: true }))
  })

  test("someone who was removed can't rejoin with the old code", async () => {
    await join('nanny', 'smith', 'AAAAAA')
    // What the app does in removeMember(): drop them and switch to a new code.
    const d = db('mom')
    const batch = d.batch()
    batch.delete(d.doc('invites/AAAAAA'))
    batch.set(d.doc('invites/BBBBBB'), { familyId: 'smith' })
    batch.update(d.doc('families/smith'), { inviteCode: 'BBBBBB', memberIds: arrayRemove('nanny'), 'members.nanny': deleteField() })
    await assertSucceeds(batch.commit())
    await assertFails(join('nanny', 'smith', 'AAAAAA'))
    await assertFails(db('nanny').doc('families/smith').get())
  })

  test('members can leave on their own', async () => {
    await join('dad', 'smith', 'AAAAAA')
    await assertSucceeds(db('dad').doc('families/smith').update({ memberIds: arrayRemove('dad'), 'members.dad': deleteField() }))
    await assertFails(db('dad').doc('families/smith').get())
  })
})

describe('two families stay separate', () => {
  beforeEach(async () => {
    await createFamily('mom', 'smith', 'AAAAAA')
    await createFamily('aunt', 'shah', 'CCCCCC')
    await db('mom').doc('families/smith/babies/aria').set({ name: 'Aria', birthDate: 0 })
    await db('mom').doc('families/smith/babies/aria/entries/e1').set(entry('mom'))
  })

  test("the other family can't read babies or logs", async () => {
    await assertFails(db('aunt').doc('families/smith/babies/aria').get())
    await assertFails(db('aunt').collection('families/smith/babies').get())
    await assertFails(db('aunt').doc('families/smith/babies/aria/entries/e1').get())
    await assertFails(db('aunt').collection('families/smith/babies/aria/entries').get())
  })

  test("the other family can't write or delete logs", async () => {
    await assertFails(db('aunt').doc('families/smith/babies/aria/entries/e2').set(entry('aunt')))
    await assertFails(db('aunt').doc('families/smith/babies/aria/entries/e1').delete())
    await assertFails(db('aunt').doc('families/smith/babies/aria/records/r1').set(entry('aunt', { type: 'visit' })))
  })

  test('someone in both families sees both', async () => {
    await join('grandma', 'smith', 'AAAAAA')
    await join('grandma', 'shah', 'CCCCCC')
    await assertSucceeds(db('grandma').doc('families/smith/babies/aria/entries/e1').get())
    await assertSucceeds(db('grandma').doc('families/shah').get())
  })
})

describe('logs', () => {
  beforeEach(() => createFamily('mom', 'smith', 'AAAAAA'))

  test('members can add, edit and delete', async () => {
    const ref = db('mom').doc('families/smith/babies/aria/entries/e1')
    await assertSucceeds(ref.set(entry('mom')))
    await assertSucceeds(ref.set(entry('mom', { amountMl: 120 })))
    await assertSucceeds(ref.delete())
    await assertSucceeds(db('mom').doc('families/smith/babies/aria/records/r1').set(entry('mom', { type: 'visit' })))
  })

  test('a 400-row import batch is allowed (what importAll sends)', async () => {
    const d = db('mom')
    const batch = d.batch()
    for (let i = 0; i < 400; i++) batch.set(d.doc(`families/smith/babies/aria/entries/imp${i}`), entry('mom', { time: i }))
    await assertSucceeds(batch.commit())
  })

  test('"replace earlier imports" can find imported rows by id; outsiders cannot', async () => {
    const id = firebase.firestore.FieldPath.documentId()
    const q = (uid) => db(uid).collection('families/smith/babies/aria/entries').where(id, '>=', 'imp').where(id, '<', 'imq')
    await db('mom').doc('families/smith/babies/aria/entries/impabc').set(entry('mom'))
    const snap = await assertSucceeds(q('mom').get())
    assert.equal(snap.size, 1)
    await assertSucceeds(db('mom').doc('families/smith/babies/aria/entries/impabc').delete())
    await assertFails(q('eve').get())
  })

  test("can't save a log signed as someone else", async () => {
    await assertFails(db('mom').doc('families/smith/babies/aria/entries/e1').set(entry('dad')))
  })

  test('only entries and records collections exist', async () => {
    await assertFails(db('mom').doc('families/smith/babies/aria/other/x').set(entry('mom')))
  })
})
