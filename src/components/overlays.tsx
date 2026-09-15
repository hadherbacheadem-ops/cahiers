// The animated overlays: modal, drawer, bottom sheet, toasts. They need motion
// (presence animations on exit, drag to dismiss), so they live in this chunk,
// fetched the first time one of them opens — never in the start-up bundle.
import { useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useDragControls } from 'motion/react'
import { X } from 'lucide-react'
import { useIsPhone, useReducedMotion } from '../lib/media'
import { IconButton, TOAST_ICONS, cx, dismissToast, useOverlay, type DrawerProps, type ModalProps, type ToastItem } from './ui'
import type { SheetProps } from './Menu'

export function ModalImpl({ open, onClose, title, children, footer, size = 'md' }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  useOverlay(open, onClose, panelRef)
  const width = { md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size]
  const reduce = useReducedMotion()
  const titleId = useId()
  // Phones: the modal is a bottom sheet; dragging its header down dismisses it (the body keeps scrolling).
  const phone = useIsPhone()
  const dragControls = useDragControls()

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(5,9,20,0.55)] p-0 sm:items-center sm:p-6 sm:backdrop-blur-[3px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.2 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose()
          }}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className={cx('flex max-h-[92dvh] w-full flex-col rounded-t-[var(--radius-lg)] border border-line bg-surface shadow-elev-4 sm:rounded-[var(--radius-lg)]', width)}
            initial={reduce ? false : { y: 24, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={reduce ? { opacity: 1, transition: { duration: 0 } } : { y: 16, opacity: 0, scale: 0.98 }}
            transition={reduce ? { duration: 0 } : { duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
            drag={phone ? 'y' : false}
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.5 }}
            dragSnapToOrigin
            onDragEnd={(_, info) => {
              if (info.offset.y > 80 || info.velocity.y > 500) onClose()
            }}
          >
            <div
              className={cx('flex items-center justify-between gap-4 border-b border-line px-5 py-4', phone && 'relative touch-none pt-5')}
              onPointerDown={phone ? (e) => dragControls.start(e) : undefined}
            >
              {phone && <span aria-hidden="true" className="absolute top-1.5 left-1/2 h-1 w-10 -translate-x-1/2 rounded-full bg-line-strong" />}
              <h2 id={titleId} className="text-lg">
                {title}
              </h2>
              <IconButton label="Fermer" onClick={onClose}>
                <X size={18} />
              </IconButton>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
            {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Side panel sliding from the right (left on demand). Same behaviour as Modal. */
export function DrawerImpl({
  open,
  onClose,
  title,
  children,
  footer,
  side = 'right',
  width = 'max-w-md',
}: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  useOverlay(open, onClose, panelRef)
  const reduce = useReducedMotion()
  const titleId = useId()
  const dx = side === 'right' ? 32 : -32
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={cx('fixed inset-0 z-50 flex bg-[rgba(5,9,20,0.55)] sm:backdrop-blur-[3px]', side === 'right' ? 'justify-end' : 'justify-start')}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.2 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose()
          }}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className={cx('glass flex h-full w-full flex-col border-line shadow-elev-4', side === 'right' ? 'border-l' : 'border-r', width)}
            initial={reduce ? false : { x: dx, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={reduce ? { opacity: 1, transition: { duration: 0 } } : { x: dx, opacity: 0 }}
            transition={reduce ? { duration: 0 } : { duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
              <h2 id={titleId} className="text-lg">
                {title}
              </h2>
              <IconButton label="Fermer" onClick={onClose}>
                <X size={18} />
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

/**
 * Bottom sheet: slides up from the bottom edge, drag it down (or tap the
 * backdrop, press Escape, use the back button) to dismiss. Locks the page
 * scroll behind it and pads for the home indicator.
 */
export function SheetImpl({ open, onClose, title, children, role }: SheetProps) {
  const reduce = useReducedMotion()
  const id = useId()
  // Portaled: a sticky « glass » bar (backdrop-filter) or an animated card above us would otherwise become the containing block of `fixed`.
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(5,9,20,0.55)]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.15 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose()
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? id : undefined}
            aria-label={title ? undefined : 'Menu'}
            className="flex max-h-[80dvh] w-full flex-col rounded-t-[var(--radius-lg)] border border-line bg-surface pb-[env(safe-area-inset-bottom)] shadow-elev-4"
            initial={reduce ? false : { y: '100%' }}
            animate={{ y: 0 }}
            exit={reduce ? { transition: { duration: 0 } } : { y: '100%' }}
            transition={reduce ? { duration: 0 } : { duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            dragSnapToOrigin
            onDragEnd={(_, info) => {
              if (info.offset.y > 80 || info.velocity.y > 500) onClose()
            }}
          >
            <div className="flex justify-center pt-2 pb-1" aria-hidden="true">
              <span className="h-1 w-10 rounded-full bg-line-strong" />
            </div>
            {title && (
              <h2 id={id} className="px-4 pb-1 text-sm font-medium text-muted">
                {title}
              </h2>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto p-2 [&_[role=menuitem]]:min-h-12 [&_[role=menuitem]]:text-base" role={role}>
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

export function ToastListImpl({ items }: { items: ToastItem[] }) {
  const reduce = useReducedMotion()
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-[70] flex flex-col items-center gap-2 px-4" aria-live="polite">
      <AnimatePresence>
        {items.map((t) => {
          const Icon = TOAST_ICONS[t.tone]
          return (
            <motion.div
              key={t.id}
              role="status"
              initial={reduce ? false : { opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: 8 }}
              transition={{ duration: reduce ? 0 : 0.2, ease: [0.2, 0.8, 0.2, 1] }}
              className={cx(
                'pointer-events-auto glass flex max-w-md items-center gap-2 rounded-[var(--radius-md)] border border-line px-3.5 py-2.5 text-sm shadow-elev-3',
                t.tone === 'bad' ? 'text-bad' : t.tone === 'ok' ? 'text-ok' : 'text-ink',
              )}
            >
              <Icon size={16} aria-hidden="true" className="shrink-0" />
              <span className="text-ink">{t.text}</span>
              <button type="button" data-action="fermer-notification" onClick={() => dismissToast(t.id)} className="ml-1 rounded-md p-0.5 text-muted hover:text-ink ring-focus" aria-label="Fermer">
                <X size={14} />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}

