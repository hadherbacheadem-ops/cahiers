// ---------------------------------------------------------------------------
// UI primitives, all built on the tokens of index.css. Elevations 1–4, one
// accent, serif display titles. Every interactive element has a visible focus
// ring; every animation is ≤ 400 ms and disabled under reduced motion.
// ---------------------------------------------------------------------------

import { Suspense, lazy, useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { useReducedMotion } from '../lib/media'
import { pushOverlay } from '../lib/backStack'
import { Brain, CircleAlert, CircleCheck, FlaskConical, Info, Layers, Link2, ListChecks, ListOrdered, LoaderCircle, Network, SquareFunction, TextCursorInput, ToggleLeft, TriangleAlert } from 'lucide-react'
import { EXERCISE_LABELS_SINGULAR, EXERCISE_STATUS_LABELS, type ExerciseStatus, type ExerciseType } from '../types'

/** Maths keys above the phone keyboard: loaded with KaTeX on first focus of a `math` textarea. */
const MathToolbar = lazy(() => import('./MathToolbar').then((m) => ({ default: m.MathToolbar })))

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ')
}

// ---- Button ----------------------------------------------------------------

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const variantClass: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg shadow-elev-1 hover:bg-accent-hover hover:shadow-elev-2 hover:-translate-y-px',
  secondary: 'bg-surface-2 text-ink border border-line-strong shadow-elev-1 hover:bg-surface-3',
  ghost: 'text-ink hover:bg-surface-2',
  danger: 'bg-bad-fill text-white shadow-elev-1 hover:opacity-90',
}
const sizeClass: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5 rounded-[var(--radius-sm)]',
  md: 'h-10 px-4 text-sm gap-2 rounded-[var(--radius-sm)]',
  lg: 'h-12 px-5 text-base gap-2 rounded-[var(--radius-md)]',
}

/**
 * Stable identifier of an action for the parity script (`data-action`): the
 * button's text without its keyboard hint, counts or accents. Explicit
 * `data-action` props win; icon-only buttons rely on their aria-label.
 */
export function actionName(node: ReactNode): string | undefined {
  const text = textOf(node)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/·.*$/, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\d+/g, '')
    .replace(/[^a-z]+/g, '-')
    .replace(/^-|-$/g, '')
  return text || undefined
}

function textOf(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string') return node
  if (typeof node === 'number') return ''
  if (Array.isArray(node)) return node.map(textOf).join(' ')
  if (typeof node === 'object' && 'props' in node) {
    // Keyboard hints are not part of the action's identity.
    if ((node as { type?: unknown }).type === Kbd) return ''
    return textOf((node as { props: { children?: ReactNode } }).props.children)
  }
  return ''
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  /** Shows a spinner and disables the button. */
  loading?: boolean
}

export function Button({ variant = 'primary', size = 'md', className, type = 'button', loading, disabled, children, ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-action={rest['data-action' as keyof typeof rest] ?? actionName(children)}
      className={cx(
        'relative inline-flex max-w-full items-center justify-center text-center font-medium press ring-focus disabled:opacity-50 disabled:pointer-events-none motion-reduce:hover:translate-y-0 sm:whitespace-nowrap',
        variantClass[variant],
        sizeClass[size],
        className,
      )}
      {...rest}
    >
      {loading && <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />}
      {children}
    </button>
  )
}

export function IconButton({ className, label, size = 'md', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: 'sm' | 'md' | 'lg' }) {
  const s = { sm: 'size-8', md: 'size-9', lg: 'size-11' }[size]
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-action={rest['data-action' as keyof typeof rest] ?? actionName(label)}
      className={cx('inline-flex items-center justify-center rounded-[var(--radius-sm)] text-muted hover:bg-surface-2 hover:text-ink press ring-focus disabled:opacity-50', s, className)}
      {...rest}
    />
  )
}

// ---- Surfaces --------------------------------------------------------------

const elevationClass = { 1: 'shadow-elev-1', 2: 'shadow-elev-2', 3: 'shadow-elev-3', 4: 'shadow-elev-4' } as const

export function Card({
  className,
  children,
  elevation = 2,
  interactive = false,
  ...rest
}: { className?: string; children: ReactNode; elevation?: 1 | 2 | 3 | 4; interactive?: boolean } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx(
        'rounded-[var(--radius-md)] border border-line bg-surface',
        elevationClass[elevation],
        interactive && 'transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-elev-3 motion-reduce:transition-none motion-reduce:hover:translate-y-0',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  )
}

/** Translucent floating panel (nav, popovers) — never for content cards. */
export function Glass({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('glass rounded-[var(--radius-md)] border border-line shadow-elev-3', className)} {...rest}>
      {children}
    </div>
  )
}

export type Tone = 'neutral' | 'accent' | 'ok' | 'bad' | 'warn'

const toneClass: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-muted',
  accent: 'bg-accent-soft text-accent-text',
  ok: 'bg-ok-soft text-ok',
  bad: 'bg-bad-soft text-bad',
  warn: 'bg-warn-soft text-warn',
}

export function Badge({ children, tone = 'neutral', className, icon }: { children: ReactNode; tone?: Tone; className?: string; icon?: ReactNode }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium', toneClass[tone], className)}>
      {icon}
      {children}
    </span>
  )
}

const TYPE_ICONS: Record<ExerciseType, typeof Layers> = {
  flashcard: Layers,
  cloze: TextCursorInput,
  mcq: ListChecks,
  truefalse: ToggleLeft,
  match: Link2,
  order: ListOrdered,
  demonstration: SquareFunction,
  mecanisme: FlaskConical,
  rappel_libre: Brain,
  carte_trous: Network,
}

/** Icon of an exercise type, same style everywhere. */
export function ExerciseTypeIcon({ type, size = 12, className }: { type: ExerciseType; size?: number; className?: string }) {
  const Icon = TYPE_ICONS[type]
  return <Icon size={size} className={className} aria-hidden="true" />
}

export function ExerciseTypeBadge({ type, tone = 'neutral', className }: { type: ExerciseType; tone?: Tone; className?: string }) {
  return (
    <Badge tone={tone} className={className} icon={<ExerciseTypeIcon type={type} />}>
      {EXERCISE_LABELS_SINGULAR[type]}
    </Badge>
  )
}

const STATUS_TONE: Record<ExerciseStatus, Tone> = { pending: 'warn', active: 'ok', suspended: 'neutral', leech: 'bad' }

export function StatusBadge({ status, className }: { status: ExerciseStatus; className?: string }) {
  return (
    <Badge tone={STATUS_TONE[status]} className={className}>
      {EXERCISE_STATUS_LABELS[status]}
    </Badge>
  )
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    /* Wrapping row: a long action bar drops under the title instead of squeezing it. */
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-[18rem] flex-1">
        {eyebrow && <div className="eyebrow mb-1 text-sm text-muted">{eyebrow}</div>}
        <h1 className="text-3xl md:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-[65ch] text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

// ---- Empty state with an ink-line illustration -------------------------------

export type Illustration = 'notebook' | 'cards' | 'stars' | 'map'

/** Simple line drawings in the current colour: no image, no third icon style. */
export function InkIllustration({ kind, className }: { kind: Illustration; className?: string }) {
  return (
    <svg viewBox="0 0 120 80" width="120" height="80" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      {kind === 'notebook' && (
        <>
          <path d="M28 14h56a4 4 0 0 1 4 4v46a4 4 0 0 1-4 4H28z" />
          <path d="M28 14v54M22 24h6M22 40h6M22 56h6" />
          <path d="M40 30h32M40 40h32M40 50h20" strokeOpacity="0.6" />
          <path d="M96 22l10-8 5 5-10 8z" />
        </>
      )}
      {kind === 'cards' && (
        <>
          <rect x="18" y="26" width="52" height="34" rx="4" transform="rotate(-8 44 43)" strokeOpacity="0.45" />
          <rect x="30" y="22" width="52" height="34" rx="4" transform="rotate(-3 56 39)" strokeOpacity="0.7" />
          <rect x="42" y="18" width="52" height="34" rx="4" />
          <path d="M52 31h20M52 40h32" strokeOpacity="0.6" />
          <path d="M100 12l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" />
        </>
      )}
      {kind === 'stars' && (
        <>
          <path d="M60 18l4 10 10 4-10 4-4 10-4-10-10-4 10-4z" />
          <path d="M30 40l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" strokeOpacity="0.6" />
          <path d="M92 48l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" strokeOpacity="0.6" />
          <path d="M20 66c20-8 60-8 80 0" strokeOpacity="0.4" />
        </>
      )}
      {kind === 'map' && (
        <>
          <circle cx="60" cy="40" r="9" />
          <circle cx="24" cy="22" r="5" strokeOpacity="0.7" />
          <circle cx="96" cy="22" r="5" strokeOpacity="0.7" />
          <circle cx="24" cy="60" r="5" strokeOpacity="0.7" />
          <circle cx="96" cy="60" r="5" strokeOpacity="0.7" />
          <path d="M52 35L29 25M68 35l23-10M52 45L29 57M68 45l23 12" strokeOpacity="0.6" />
        </>
      )}
    </svg>
  )
}

export function EmptyState({ icon, illustration, title, description, action }: { icon?: ReactNode; illustration?: Illustration; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-[var(--radius-md)] border border-dashed border-line-strong px-6 py-12 text-center">
      {illustration ? (
        <InkIllustration kind={illustration} className="mb-4 text-text-3" />
      ) : icon ? (
        <div className="mb-4 flex size-12 items-center justify-center rounded-[var(--radius-md)] bg-surface-2 text-muted">{icon}</div>
      ) : null}
      <h3 className="text-lg">{title}</h3>
      {description && <p className="mt-1 max-w-[40ch] text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx('skeleton rounded-[var(--radius-sm)] bg-surface-2', className)} />
}

// ---- Form ------------------------------------------------------------------

const fieldClass =
  'w-full min-w-0 max-w-full rounded-[var(--radius-sm)] border border-line-strong bg-surface-2 px-3 text-ink placeholder:text-text-3 ring-focus transition-[border-color] duration-150 focus:border-accent disabled:opacity-50 aria-invalid:border-bad'

export function Field({ label, hint, error, children, className }: { label: string; hint?: ReactNode; error?: string; children: (id: string) => ReactNode; className?: string }) {
  const id = useId()
  return (
    <div className={cx('flex flex-col gap-2', className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children(id)}
      {error ? (
        <p className="flex items-center gap-1 text-sm text-bad" role="alert">
          <CircleAlert size={14} aria-hidden="true" />
          {error}
        </p>
      ) : hint ? (
        <p className="text-sm text-muted">{hint}</p>
      ) : null}
    </div>
  )
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(fieldClass, 'h-10', className)} {...rest} />
}

/** `math`: on a phone, a row of maths keys with a KaTeX preview follows the keyboard while the field has focus. */
export function Textarea({ className, math, onFocus, onBlur, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { math?: boolean }) {
  const [el, setEl] = useState<HTMLTextAreaElement | null>(null)
  const [focused, setFocused] = useState(false)
  return (
    <>
      <textarea
        ref={setEl}
        className={cx(fieldClass, 'min-h-28 py-2 leading-relaxed', className)}
        onFocus={(e) => {
          setFocused(true)
          onFocus?.(e)
        }}
        onBlur={(e) => {
          setFocused(false)
          onBlur?.(e)
        }}
        {...rest}
      />
      {math && focused && el && (
        <Suspense fallback={null}>
          <MathToolbar target={el} />
        </Suspense>
      )}
    </>
  )
}

export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx(fieldClass, 'h-10', className)} {...rest} />
}

export function Checkbox({ label, description, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; description?: ReactNode }) {
  return (
    <label className={cx('flex cursor-pointer items-start gap-3 rounded-[var(--radius-sm)] border border-line px-3 py-2.5 text-sm has-[:checked]:border-accent/60', className)}>
      <input type="checkbox" className="mt-0.5 size-4 accent-[var(--accent)] ring-focus" {...rest} />
      <span>
        <span className="font-medium">{label}</span>
        {description && <span className="block text-xs text-muted">{description}</span>}
      </span>
    </label>
  )
}

// ---- Overlays: modal & drawer ---------------------------------------------------

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Escape closes, focus is trapped inside and returned to the opener, body scroll is locked. */
export function useOverlay(open: boolean, onClose: () => void, panelRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab' || !panelRef.current) return
      const nodes = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null)
      if (!nodes.length) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const t = window.setTimeout(() => {
      const panel = panelRef.current
      if (!panel || panel.contains(document.activeElement)) return
      const auto = panel.querySelector<HTMLElement>('[autofocus]') ?? panel.querySelector<HTMLElement>(FOCUSABLE)
      auto?.focus()
    }, 30)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
      opener?.focus?.()
    }
  }, [open, onClose, panelRef])

}

/**
 * Back button / back gesture (phones, installed app): closes the overlay instead of leaving the
 * page. Lives in the wrapper, not the lazy implementation, so the history entry exists from the
 * very first render of an open overlay (before its chunk arrives). Keyed on `open` only.
 */
export function useOverlayHistory(open: boolean, onClose: () => void) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    if (!open) return
    return pushOverlay(() => closeRef.current())
  }, [open])
}

/** The animated overlays (motion) live in overlays.tsx and are fetched the first time one opens. */
const ModalImpl = lazy(() => import('./overlays').then((m) => ({ default: m.ModalImpl })))
const DrawerImpl = lazy(() => import('./overlays').then((m) => ({ default: m.DrawerImpl })))
const ToastListImpl = lazy(() => import('./overlays').then((m) => ({ default: m.ToastListImpl })))

export interface ModalProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'md' | 'lg' | 'xl'
}

/** Mounted from the first opening on (so the closing animation can play), never before. */
export function Modal(props: ModalProps) {
  useOverlayHistory(props.open, props.onClose)
  const [seen, setSeen] = useState(props.open)
  if (props.open && !seen) setSeen(true)
  if (!seen) return null
  return (
    <Suspense fallback={null}>
      <ModalImpl {...props} />
    </Suspense>
  )
}

export interface DrawerProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  side?: 'left' | 'right'
  width?: string
}

export function Drawer(props: DrawerProps) {
  useOverlayHistory(props.open, props.onClose)
  const [seen, setSeen] = useState(props.open)
  if (props.open && !seen) setSeen(true)
  if (!seen) return null
  return (
    <Suspense fallback={null}>
      <DrawerImpl {...props} />
    </Suspense>
  )
}

// ---- Toasts ----------------------------------------------------------------

export interface ToastItem {
  id: number
  text: string
  tone: Tone
}

let toastSeq = 0
let toasts: ToastItem[] = []
const toastListeners = new Set<() => void>()

function emitToasts() {
  for (const l of toastListeners) l()
}

/** Shows a short message bottom-centre; 4 s (6 s for errors). */
export function toast(text: string, tone: Tone = 'neutral') {
  const item = { id: ++toastSeq, text, tone }
  toasts = [...toasts, item].slice(-4)
  emitToasts()
  window.setTimeout(() => dismissToast(item.id), tone === 'bad' ? 6000 : 4000)
  return item.id
}

export function dismissToast(id: number) {
  if (!toasts.some((t) => t.id === id)) return
  toasts = toasts.filter((t) => t.id !== id)
  emitToasts()
}

export const TOAST_ICONS: Record<Tone, typeof Info> = { neutral: Info, accent: Info, ok: CircleCheck, bad: CircleAlert, warn: TriangleAlert }

export function Toaster() {
  const items = useSyncExternalStore(
    (l) => {
      toastListeners.add(l)
      return () => {
        toastListeners.delete(l)
      }
    },
    () => toasts,
    () => toasts,
  )
  const [seen, setSeen] = useState(items.length > 0)
  if (items.length > 0 && !seen) setSeen(true)
  if (!seen) return null
  return (
    <Suspense fallback={null}>
      <ToastListImpl items={items} />
    </Suspense>
  )
}

// ---- Tooltip ---------------------------------------------------------------

/** Hover / focus tooltip; the label is also linked through aria-describedby. */
export function Tooltip({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  const id = useId()
  return (
    <span className={cx('group/tip relative inline-flex', className)}>
      <span aria-describedby={id} className="inline-flex">
        {children}
      </span>
      <span
        role="tooltip"
        id={id}
        className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-line bg-surface-3 px-2 py-1 text-xs text-ink shadow-elev-2 group-hover/tip:block group-focus-within/tip:block"
      >
        {label}
      </span>
    </span>
  )
}

// ---- Progress --------------------------------------------------------------

const TONE_COLOR = { accent: 'var(--accent)', ok: 'var(--ok)', bad: 'var(--bad)', cahier: 'var(--cahier)' } as const

/** Ring that fills on mount (CSS transition, instant under reduced motion). */
export function ProgressRing({
  value,
  size = 56,
  stroke = 5,
  label,
  children,
  tone = 'accent',
  className,
}: {
  value: number
  size?: number
  stroke?: number
  label: string
  children?: ReactNode
  tone?: keyof typeof TONE_COLOR
  className?: string
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(1, value))
  const reduce = useReducedMotion()
  const [mounted, setMounted] = useState(!!reduce)
  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(t)
  }, [])
  return (
    <div className={cx('relative inline-flex items-center justify-center', className)} style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={TONE_COLOR[tone]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={mounted ? c * (1 - v) : c}
          style={{ transition: reduce ? 'none' : 'stroke-dashoffset 400ms var(--ease-out)' }}
        />
      </svg>
      {children && <div className="absolute inset-0 flex items-center justify-center text-xs font-medium tabular-nums">{children}</div>}
    </div>
  )
}

export function ProgressBar({ value, label, tone = 'accent', className, thin }: { value: number; label: string; tone?: keyof typeof TONE_COLOR; className?: string; thin?: boolean }) {
  const v = Math.max(0, Math.min(1, value))
  return (
    <div className={cx('w-full overflow-hidden rounded-full bg-line', thin ? 'h-1' : 'h-2', className)} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)}>
      <div className="h-full rounded-full motion-reduce:transition-none" style={{ width: `${v * 100}%`, background: TONE_COLOR[tone], transition: 'width 300ms var(--ease-out)' }} />
    </div>
  )
}

/** Segmented bar (coverage, exam sessions): one cell per segment. */
export function SegmentedBar({ segments, label, className }: { segments: ('done' | 'todo' | 'late')[]; label: string; className?: string }) {
  return (
    <div className={cx('flex gap-1', className)} role="img" aria-label={label}>
      {segments.map((s, i) => (
        <span key={i} className={cx('h-1.5 flex-1 rounded-full', s === 'done' ? 'bg-accent' : s === 'late' ? 'bg-bad' : 'bg-line-strong')} />
      ))}
    </div>
  )
}

/** Number that counts up to `value` over 300 ms (instant under reduced motion). */
export function Counter({ value, className, format }: { value: number; className?: string; format?: (n: number) => string }) {
  const reduce = useReducedMotion()
  const [shown, setShown] = useState(reduce ? value : 0)
  const from = useRef(0)
  useEffect(() => {
    if (reduce) {
      setShown(value)
      return
    }
    const start = performance.now()
    const begin = from.current
    let raf = 0
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 300)
      const eased = 1 - Math.pow(1 - k, 3)
      setShown(Math.round(begin + (value - begin) * eased))
      if (k < 1) raf = requestAnimationFrame(tick)
      else from.current = value
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, reduce])
  return <span className={cx('tabular-nums', className)}>{format ? format(shown) : shown}</span>
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

/** Hook: a boolean with a stable toggle, for simple open/close states. */
export function useToggle(initial = false): [boolean, () => void, (v: boolean) => void] {
  const [v, setV] = useState(initial)
  const toggle = useCallback(() => setV((x) => !x), [])
  return [v, toggle, setV]
}
