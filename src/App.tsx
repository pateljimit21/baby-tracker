import { useEffect } from 'react'
import { Toast, cx } from './components/ui'
import { BabyHeader } from './components/BabyHeader'
import { usePref } from './lib/prefs'
import { Growth } from './screens/Growth'
import { Health } from './screens/Health'
import { History } from './screens/History'
import { More } from './screens/More'
import { Loading, NoBaby, NoFamily, SignIn } from './screens/Setup'
import { Today } from './screens/Today'
import { useApp } from './state'

const TABS = [
  { id: 'today', label: 'Today', icon: '🏠' },
  { id: 'history', label: 'History', icon: '📅' },
  { id: 'health', label: 'Health', icon: '🩺' },
  { id: 'growth', label: 'Growth', icon: '📏' },
  { id: 'more', label: 'Settings', icon: '⚙️' },
] as const

type Tab = (typeof TABS)[number]['id']

export default function App() {
  const { user, families, family, babies, baby, toastMsg } = useApp()

  // Color theme follows the baby you're looking at (see index.css).
  const sex = baby?.sex
  useEffect(() => {
    if (sex) document.documentElement.dataset.baby = sex
    else delete document.documentElement.dataset.baby
  }, [sex])

  let body
  if (user === undefined || (user && families === undefined) || (family && babies === undefined)) body = <Loading />
  else if (!user) body = <SignIn />
  else if (!family) body = <NoFamily />
  else if (!baby) body = <NoBaby />
  else body = <Main />

  return (
    <>
      {body}
      <Toast message={toastMsg} />
    </>
  )
}

function Main() {
  const [tab, setTab] = usePref<Tab>('tab', 'today')

  const pick = (t: Tab) => {
    setTab(t)
    window.scrollTo(0, 0)
  }

  return (
    <div className="mx-auto min-h-dvh max-w-lg">
      {/* Keyed by tab, so an open dropdown or summary closes when you switch tabs. */}
      <BabyHeader key={tab} onManage={() => pick('more')} />

      <main className="px-4 pt-2 pb-28">
        {tab === 'today' && <Today />}
        {tab === 'history' && <History />}
        {tab === 'health' && <Health />}
        {tab === 'growth' && <Growth />}
        {tab === 'more' && <More />}
      </main>

      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
        <div className="mx-auto flex max-w-lg">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => pick(t.id)}
              aria-current={tab === t.id ? 'page' : undefined}
              className={cx(
                'flex min-h-14 flex-1 flex-col items-center justify-center text-xs font-semibold',
                tab === t.id ? 'text-teal-700 dark:text-teal-400' : 'text-slate-500 dark:text-slate-400',
              )}
            >
              <span className={cx('text-xl', tab !== t.id && 'opacity-60 grayscale')} aria-hidden>
                {t.icon}
              </span>
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}
