import { useState } from 'react'
import { ImportSheet } from '../components/ImportSheet'
import { Button, Card, Input, SectionTitle, Segmented, Sheet, cx } from '../components/ui'
import { entriesCsv, recordsCsv, shareFiles } from '../lib/csv'
import { fmtAge, toInputDate } from '../lib/format'
import { useNow } from '../lib/prefs'
import { useBaby } from '../state'
import type { Baby } from '../types'
import { BabyForm, DemoNote, FamilyChooser } from './Setup'

export function More() {
  const { backend, user, family, families, selectFamily, babies, baby, selectBaby, units, setUnits, toast } = useBaby()
  const now = useNow(60_000)
  const [babySheet, setBabySheet] = useState<{ baby?: Baby } | null>(null)
  const [familySheet, setFamilySheet] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)

  const shareCode = async () => {
    const text = `Join ${family.name} on Sip & Snooze. Open ${location.origin}, create an account, and enter invite code ${family.inviteCode}`
    try {
      if (navigator.share) await navigator.share({ text })
      else {
        await navigator.clipboard.writeText(text)
        toast('Invite copied')
      }
    } catch {
      // Share sheet closed.
    }
  }

  const exportData = async () => {
    setExporting(true)
    try {
      const { entries, records } = await backend.exportAll(family.id, baby.id)
      const stamp = toInputDate(Date.now())
      const slug = baby.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
      await shareFiles([
        { name: `${slug}-log-${stamp}.csv`, text: entriesCsv(entries) },
        { name: `${slug}-health-${stamp}.csv`, text: recordsCsv(records) },
      ])
    } catch (err) {
      console.error(err)
      toast("Couldn't export. Check your connection.")
    } finally {
      setExporting(false)
    }
  }

  const remove = (uid: string, name: string) => {
    const self = uid === user.uid
    if (!confirm(self ? `Leave ${family.name}? You'll need a new invite code to come back.` : `Remove ${name} from ${family.name}? The invite code will change so they can't rejoin with it.`)) return
    backend.removeMember(family, uid).catch(() => toast("Couldn't change members. Check your connection."))
  }

  return (
    <>
      {backend.mode === 'demo' && <DemoNote />}

      <SectionTitle action={<SmallButton onClick={() => setBabySheet({})}>+ Add baby</SmallButton>}>Babies</SectionTitle>
      <Card className="p-2">
        {babies?.map((b) => (
          <div key={b.id} className="flex items-center gap-2">
            <button type="button" onClick={() => selectBaby(b.id)} className="flex min-h-12 flex-1 items-center gap-3 rounded-xl px-2 text-left">
              <Radio on={b.id === baby.id} />
              <span>
                <span className="block font-semibold">{b.name}</span>
                <span className="block text-sm text-slate-500 dark:text-slate-400">{fmtAge(b.birthDate, now)}</span>
              </span>
            </button>
            <SmallButton onClick={() => setBabySheet({ baby: b })}>Edit</SmallButton>
          </div>
        ))}
      </Card>

      <SectionTitle>Family</SectionTitle>
      <Card className="space-y-4">
        {renaming != null ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (renaming.trim()) backend.renameFamily(family.id, renaming.trim()).catch(() => toast("Couldn't rename."))
              setRenaming(null)
            }}
          >
            <Input value={renaming} onChange={(e) => setRenaming(e.target.value)} autoFocus />
            <Button type="submit">Save</Button>
          </form>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-lg font-bold">{family.name}</span>
            <SmallButton onClick={() => setRenaming(family.name)}>Rename</SmallButton>
          </div>
        )}

        <div>
          <div className="text-sm text-slate-500 dark:text-slate-400">Invite code</div>
          <div className="mt-1 flex items-center gap-2">
            <span className="flex-1 font-mono text-2xl font-bold tracking-[0.3em]">{family.inviteCode}</span>
            <Button variant="secondary" onClick={shareCode}>
              Share
            </Button>
          </div>
          <button
            type="button"
            className="mt-1 text-sm text-slate-500 underline dark:text-slate-400"
            onClick={() => confirm('Make a new code? The old one will stop working.') && backend.newInviteCode(family).catch(() => toast("Couldn't change the code."))}
          >
            Make a new code
          </button>
        </div>

        <div>
          <div className="text-sm text-slate-500 dark:text-slate-400">Members</div>
          <ul className="mt-1 divide-y divide-slate-200 dark:divide-slate-700">
            {family.memberIds.map((uid) => {
              const name = family.members[uid]?.name ?? 'Unknown'
              return (
                <li key={uid} className="flex min-h-12 items-center justify-between">
                  <span>
                    {name}
                    {uid === user.uid && <span className="text-slate-500"> (you)</span>}
                  </span>
                  <SmallButton danger onClick={() => remove(uid, name)}>
                    {uid === user.uid ? 'Leave' : 'Remove'}
                  </SmallButton>
                </li>
              )
            })}
          </ul>
        </div>
      </Card>

      {families && families.length > 1 && (
        <>
          <SectionTitle>Switch family</SectionTitle>
          <Card className="p-2">
            {families.map((f) => (
              <button key={f.id} type="button" onClick={() => selectFamily(f.id)} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2 text-left">
                <Radio on={f.id === family.id} />
                <span className="font-semibold">{f.name}</span>
              </button>
            ))}
          </Card>
        </>
      )}
      <Button variant="secondary" className="mt-3 w-full" onClick={() => setFamilySheet(true)}>
        Join or start another family
      </Button>

      <SectionTitle>Units (this phone)</SectionTitle>
      <Card className="space-y-3">
        <Segmented options={[{ value: 'ml', label: 'ml' }, { value: 'oz', label: 'oz' }]} value={units.volume} onChange={(volume) => setUnits({ ...units, volume })} />
        <Segmented options={[{ value: 'kg', label: 'kg / cm' }, { value: 'lb', label: 'lb / in' }]} value={units.weight} onChange={(weight) => setUnits({ ...units, weight })} />
        <Segmented options={[{ value: 'C', label: '°C' }, { value: 'F', label: '°F' }]} value={units.temp} onChange={(temp) => setUnits({ ...units, temp })} />
      </Card>

      <SectionTitle>Your data</SectionTitle>
      <Card>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Move {baby.name}'s history in or out with CSV files. They open in Excel, Numbers or Google Sheets, and most baby tracker apps can export them.
        </p>
        <Button variant="secondary" className="mt-3 w-full" onClick={() => setImporting(true)}>
          Import from another app (CSV)
        </Button>
        <Button variant="secondary" className="mt-2 w-full" onClick={exportData} disabled={exporting}>
          {exporting ? 'Preparing…' : 'Export to CSV'}
        </Button>
      </Card>

      <SectionTitle>Account</SectionTitle>
      <Card className="flex items-center justify-between">
        <span>
          <span className="block font-semibold">{user.name}</span>
          <span className="block text-sm text-slate-500 dark:text-slate-400">{user.email}</span>
        </span>
        <Button variant="secondary" onClick={() => confirm('Sign out?') && backend.signOut()}>
          Sign out
        </Button>
      </Card>

      <SectionTitle>Add to Home Screen</SectionTitle>
      <Card>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          On iPhone: open this page in Safari, tap the <strong>Share</strong> button, then <strong>Add to Home Screen</strong>. Sip & Snooze then opens full-screen like a normal app.
        </p>
      </Card>

      {babySheet && (
        <Sheet title={babySheet.baby ? 'Edit baby' : 'Add baby'} onClose={() => setBabySheet(null)}>
          <BabyForm baby={babySheet.baby} onDone={() => setBabySheet(null)} />
        </Sheet>
      )}
      {importing && <ImportSheet onClose={() => setImporting(false)} />}
      {familySheet && (
        <Sheet title="Another family" onClose={() => setFamilySheet(false)}>
          <FamilyChooser onDone={() => setFamilySheet(false)} />
        </Sheet>
      )}
    </>
  )
}

function SmallButton({ onClick, danger, children }: { onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'min-h-10 rounded-full px-3 text-sm font-semibold',
        danger ? 'text-red-600 active:bg-red-50 dark:text-red-400' : 'text-teal-700 active:bg-teal-50 dark:text-teal-400 dark:active:bg-slate-700',
      )}
    >
      {children}
    </button>
  )
}

function Radio({ on }: { on: boolean }) {
  return (
    <span className={cx('flex size-6 shrink-0 items-center justify-center rounded-full ring-2', on ? 'ring-teal-700 dark:ring-teal-400' : 'ring-slate-300 dark:ring-slate-600')}>
      {on && <span className="size-3 rounded-full bg-teal-700 dark:bg-teal-400" />}
    </span>
  )
}
