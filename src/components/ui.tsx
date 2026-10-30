import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

const variants: Record<Variant, string> = {
  primary: 'bg-teal-700 text-white active:bg-teal-800 dark:bg-teal-600 dark:active:bg-teal-700',
  secondary:
    'bg-white text-slate-900 ring-1 ring-slate-300 active:bg-slate-100 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-600 dark:active:bg-slate-700',
  danger: 'bg-white text-red-700 ring-1 ring-red-300 active:bg-red-50 dark:bg-slate-800 dark:text-red-400 dark:ring-red-900',
  ghost: 'text-teal-700 active:bg-teal-50 dark:text-teal-400 dark:active:bg-slate-800',
}

export function Button({
  variant = 'primary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={cx(
        'min-h-12 rounded-xl px-4 font-semibold transition-colors disabled:opacity-50',
        variants[variant],
        className,
      )}
      {...props}
    />
  )
}

const plainCard = 'bg-white ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700'

/** `skin` replaces the default white background and border, e.g. for a colored card. */
export function Card({ className, skin = plainCard, children }: { className?: string; skin?: string; children: ReactNode }) {
  return (
    <div className={cx('rounded-2xl p-4 shadow-sm', skin, className)}>
      {children}
    </div>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mt-6 mb-2 flex items-center justify-between px-1">
      <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">{children}</h2>
      {action}
    </div>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{hint}</span>}
    </label>
  )
}

const inputClass =
  'block w-full min-h-12 rounded-xl bg-white px-3 py-2 ring-1 ring-slate-300 outline-none focus:ring-2 focus:ring-teal-600 dark:bg-slate-900 dark:ring-slate-600'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(inputClass, className)} {...props} />
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={2} className={cx(inputClass, className)} {...props} />
}

/** Number field that keeps what's typed as text, so "0." or "" doesn't jump around.
 * Accepts decimals with "." or "," (some phone keyboards only have a comma). */
export function NumberInput({
  value,
  onChange,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { value: string; onChange: (v: string) => void }) {
  return (
    <Input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={value}
      onChange={(e) =>
        onChange(
          e.target.value
            .replace(/,/g, '.')
            .replace(/[^\d.]/g, '')
            .replace(/(\..*)\./g, '$1'),
        )
      }
      {...props}
    />
  )
}

export const parseNum = (s: string): number | null => {
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: ReactNode }[]
  value: T | undefined
  onChange: (v: T) => void
}) {
  return (
    <div className="flex gap-1 rounded-xl bg-slate-200 p-1 dark:bg-slate-900">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx(
            'min-h-11 flex-1 rounded-lg px-2 text-sm font-semibold',
            value === o.value
              ? 'bg-white text-teal-800 shadow-sm dark:bg-slate-700 dark:text-teal-300'
              : 'text-slate-600 dark:text-slate-400',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Panel that slides up from the bottom. `action` goes in the header, e.g. a Save button (like Nara). */
export function Sheet({ title, onClose, action, children }: { title: string; onClose: () => void; action?: ReactNode; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="pb-safe relative max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-slate-50 dark:bg-slate-800">
        <div className="sticky top-0 z-10 flex items-center justify-between bg-slate-50/95 px-4 pt-4 pb-2 backdrop-blur dark:bg-slate-800/95">
          <h2 className="text-lg font-bold">{title}</h2>
          <span className="ml-auto mr-2">{action}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-10 items-center justify-center rounded-full bg-slate-200 text-xl text-slate-600 dark:bg-slate-700 dark:text-slate-300"
          >
            ×
          </button>
        </div>
        <div className="space-y-4 px-4 pt-2 pb-6">{children}</div>
      </div>
    </div>
  )
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4" role="status">
      <div className="rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg dark:bg-slate-100 dark:text-slate-900">
        {message}
      </div>
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-1 py-3 text-sm text-slate-500 dark:text-slate-400">{children}</p>
}
