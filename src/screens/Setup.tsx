import { useEffect, useState } from 'react'
import { Button, Card, Field, Input, Segmented } from '../components/ui'
import { newId } from '../lib/backend'
import { fromInputDate, toInputDate } from '../lib/format'
import { useApp } from '../state'
import type { Baby } from '../types'

// Screens shown before the app proper: sign in, join/create a family, add a baby.

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt-safe pb-safe mx-auto min-h-dvh max-w-md px-4">
      <div className="pt-10 pb-6 text-center">
        <img src="/pwa-192x192.png" alt="" className="mx-auto size-16 rounded-2xl" />
        <h1 className="mt-3 text-2xl font-bold">Sip & Snooze</h1>
      </div>
      {children}
    </div>
  )
}

function errorText(err: unknown): string {
  const code = (err as { code?: string }).code ?? ''
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found'))
    return 'Email or password is wrong.'
  if (code.includes('email-already-in-use')) return 'That email already has an account. Sign in instead.'
  if (code.includes('weak-password')) return 'Use at least 6 characters for the password.'
  if (code.includes('invalid-email')) return "That email address doesn't look right."
  if (code.includes('network')) return 'No internet connection. Try again when you are online.'
  if (code.includes('account-exists-with-different-credential'))
    return 'This email already has an account with a password. Sign in with email and password instead.'
  return (err as Error).message || 'Something went wrong. Try again.'
}

export function SignIn() {
  const { backend } = useApp()
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)

  const submit = async () => {
    setBusy(true)
    setMessage(null)
    try {
      if (mode === 'up') await backend.signUp(name, email, password)
      else await backend.signIn(email, password)
    } catch (err) {
      setMessage({ text: errorText(err), error: true })
    } finally {
      setBusy(false)
    }
  }

  // Closing Google's window isn't an error worth showing.
  const showError = (err: unknown) => {
    const code = (err as { code?: string }).code ?? ''
    if (!code.includes('popup-closed') && !code.includes('cancelled-popup')) setMessage({ text: errorText(err), error: true })
  }

  useEffect(() => {
    backend.finishGoogleSignIn?.().catch(showError)
  }, [backend])

  const google = async () => {
    setBusy(true)
    setMessage(null)
    try {
      await backend.signInWithGoogle?.()
    } catch (err) {
      showError(err)
    } finally {
      setBusy(false)
    }
  }

  const reset = async () => {
    if (!email) return setMessage({ text: 'Type your email above first.', error: true })
    try {
      await backend.resetPassword(email)
      setMessage({ text: `Sent a reset link to ${email}.`, error: false })
    } catch (err) {
      setMessage({ text: errorText(err), error: true })
    }
  }

  return (
    <Shell>
      <Card>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <Segmented
            options={[
              { value: 'in', label: 'Sign in' },
              { value: 'up', label: 'Create account' },
            ]}
            value={mode}
            onChange={setMode}
          />
          {mode === 'up' && (
            <Field label="Your name" hint="Shown to your family, e.g. Mom, Dad, Grandma">
              <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="nickname" required />
            </Field>
          )}
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </Field>
          {backend.mode === 'firebase' && (
            <Field label="Password" hint={mode === 'up' ? 'At least 6 characters' : undefined}>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
                required
                minLength={6}
              />
            </Field>
          )}
          {message && <p className={message.error ? 'text-sm text-red-600' : 'text-sm text-teal-700 dark:text-teal-400'}>{message.text}</p>}
          <Button type="submit" className="w-full" disabled={busy}>
            {mode === 'up' ? 'Create account' : 'Sign in'}
          </Button>
          {mode === 'in' && backend.mode === 'firebase' && (
            <Button variant="ghost" className="w-full" onClick={reset}>
              Forgot password?
            </Button>
          )}
        </form>
        {backend.signInWithGoogle && (
          <>
            <div className="my-4 flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
              <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
              or
              <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
            </div>
            <Button variant="secondary" className="flex w-full items-center justify-center gap-3" onClick={google} disabled={busy}>
              <GoogleLogo />
              Continue with Google
            </Button>
          </>
        )}
      </Card>
      {backend.mode === 'demo' && <DemoNote />}
    </Shell>
  )
}

export function DemoNote() {
  return (
    <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-900">
      <strong>Demo mode.</strong> Firebase isn't connected yet, so everything is saved in this browser only and no password is needed. Data won't sync between phones until setup is finished.
    </p>
  )
}

/** Create a new family or join one with a code. Also used from Settings to add another family. */
export function FamilyChooser({ onDone }: { onDone?: () => void }) {
  const { backend, user, selectFamily } = useApp()
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const go = async (action: () => Promise<string>) => {
    setBusy(true)
    setError('')
    try {
      selectFamily(await action())
      onDone?.()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-lg font-bold">Join your family</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Someone already set it up? Ask them for the invite code in Settings.</p>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (user && code.trim()) go(() => backend.joinFamily(user, code))
          }}
        >
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Invite code"
            autoCapitalize="characters"
            autoComplete="off"
            className="font-mono tracking-widest uppercase"
          />
          <Button type="submit" disabled={busy || !code.trim()}>
            Join
          </Button>
        </form>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </Card>
      <Card>
        <h2 className="text-lg font-bold">Or start a new family</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">You'll get a code to invite others.</p>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (user && name.trim()) go(() => backend.createFamily(user, name.trim()))
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Smith family" />
          <Button type="submit" disabled={busy || !name.trim()}>
            Create
          </Button>
        </form>
      </Card>
    </div>
  )
}

export function NoFamily() {
  const { user, backend } = useApp()
  return (
    <Shell>
      <p className="mb-4 text-center text-slate-600 dark:text-slate-300">Hi {user?.name}! Let's connect you to your family.</p>
      <FamilyChooser />
      <Button variant="ghost" className="mt-4 w-full" onClick={() => backend.signOut()}>
        Sign out
      </Button>
    </Shell>
  )
}

export function BabyForm({ baby, onDone }: { baby?: Baby; onDone?: () => void }) {
  const { backend, family, selectBaby, toast } = useApp()
  const [name, setName] = useState(baby?.name ?? '')
  const [birth, setBirth] = useState(baby ? toInputDate(baby.birthDate) : toInputDate(Date.now()))
  const [sex, setSex] = useState<Baby['sex'] | 'none'>(baby?.sex ?? 'none')

  const save = () => {
    if (!family || !name.trim() || !birth) return
    // Left out when not set: Firestore won't save an undefined field.
    const b: Baby = { id: baby?.id ?? newId(), name: name.trim(), birthDate: fromInputDate(birth), ...(sex !== 'none' && { sex }) }
    backend.saveBaby(family.id, b).catch(() => toast("Couldn't save. Try again."))
    selectBaby(b.id)
    onDone?.()
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <Field label="Baby's name">
        <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus={!baby} />
      </Field>
      <Field label="Birth date">
        <Input type="date" value={birth} onChange={(e) => setBirth(e.target.value)} />
      </Field>
      <div>
        <span className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">Boy or girl</span>
        <div data-baby={sex === 'none' ? undefined : sex}>
          <Segmented
            options={[
              { value: 'boy', label: 'Boy' },
              { value: 'girl', label: 'Girl' },
              { value: 'none', label: 'Not set' },
            ]}
            value={sex}
            onChange={setSex}
          />
        </div>
        <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">Sets the app's colors: blue for a boy, pink for a girl.</span>
      </div>
      <Button type="submit" className="w-full" disabled={!name.trim() || !birth}>
        Save
      </Button>
    </form>
  )
}

export function NoBaby() {
  const { family, families, selectFamily } = useApp()
  const others = families?.filter((f) => f.id !== family?.id) ?? []
  return (
    <Shell>
      <Card>
        <h2 className="text-lg font-bold">Add your baby</h2>
        <p className="mt-1 mb-4 text-sm text-slate-600 dark:text-slate-300">
          {family?.name}: invite code <strong className="font-mono tracking-widest">{family?.inviteCode}</strong>
        </p>
        <BabyForm />
      </Card>
      {others.map((f) => (
        <Button key={f.id} variant="ghost" className="mt-2 w-full" onClick={() => selectFamily(f.id)}>
          Back to {f.name}
        </Button>
      ))}
    </Shell>
  )
}

export function Loading() {
  return (
    <div className="flex min-h-dvh items-center justify-center text-slate-500" role="status">
      Loading…
    </div>
  )
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.5z" />
    </svg>
  )
}
