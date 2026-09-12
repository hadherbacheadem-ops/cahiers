import { useEffect, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { X } from '@phosphor-icons/react'

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ')
}

// ---- Button ----------------------------------------------------------------

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const variantClass: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover',
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-surface-2',
  ghost: 'text-ink hover:bg-surface-2',
  danger: 'bg-bad text-white hover:opacity-90',
}
const sizeClass: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-5 text-base gap-2',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

export function Button({ variant = 'primary', size = 'md', className, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex items-center justify-center whitespace-nowrap rounded-lg font-medium press ring-focus disabled:opacity-50 disabled:pointer-events-none',
        variantClass[variant],
        sizeClass[size],
        className,
      )}
      {...rest}
    />
  )
}

export function IconButton({ className, label, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx('inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink press ring-focus disabled:opacity-50', className)}
      {...rest}
    />
  )
}

// ---- Surfaces --------------------------------------------------------------

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('rounded-xl border border-line bg-surface shadow-card', className)} {...rest}>
      {children}
    </div>
  )
}

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'ok' | 'bad' | 'warn'; className?: string }) {
  const tones = {
    neutral: 'bg-surface-2 text-muted',
    accent: 'bg-accent-soft text-accent',
    ok: 'bg-ok-soft text-ok',
    bad: 'bg-bad-soft text-bad',
    warn: 'bg-warn-soft text-warn',
  }
  return <span className={cx('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium', tones[tone], className)}>{children}</span>
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-sm text-muted">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-[65ch] text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-line-strong px-6 py-14 text-center">
      {icon && <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-surface-2 text-muted">{icon}</div>}
      <h3 className="text-base font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-[40ch] text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-lg bg-surface-2', className)} />
}

// ---- Form ------------------------------------------------------------------

const fieldClass =
  'w-full rounded-lg border border-line-strong bg-surface px-3 text-ink placeholder:text-muted/70 ring-focus disabled:opacity-50 aria-invalid:border-bad'

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: (id: string) => ReactNode }) {
  const id = useId()
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children(id)}
      {error ? <p className="text-sm text-bad">{error}</p> : hint ? <p className="text-sm text-muted">{hint}</p> : null}
    </div>
  )
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(fieldClass, 'h-10', className)} {...rest} />
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(fieldClass, 'min-h-28 py-2 leading-relaxed', className)} {...rest} />
}

export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx(fieldClass, 'h-10', className)} {...rest} />
}

// ---- Modal -----------------------------------------------------------------

export function Modal({ open, onClose, title, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'md' | 'lg' | 'xl' }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  const width = { md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size]
  const reduce = useReducedMotion()

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.15 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose()
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            className={cx('flex max-h-[92dvh] w-full flex-col rounded-t-xl bg-surface shadow-pop sm:rounded-xl', width)}
            initial={reduce ? false : { y: 24, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { y: 16, opacity: 0, scale: 0.98 }}
            transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 32 }}
          >
            <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
              <h2 className="text-base font-semibold">{title}</h2>
              <IconButton label="Fermer" onClick={onClose}>
                <X size={18} weight="bold" />
              </IconButton>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
            {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ---- Misc ------------------------------------------------------------------

export function ColorDot({ color, className }: { color: string; className?: string }) {
  return <span aria-hidden className={cx('inline-block size-2.5 shrink-0 rounded-full', className)} style={{ background: color }} />
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-md border border-line-strong bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-muted">{children}</kbd>
}

export function plural(n: number, singular: string, pluralForm = singular + 's') {
  return `${n} ${n === 1 ? singular : pluralForm}`
}
