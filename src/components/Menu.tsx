import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useIsPhone } from '../lib/media'

/**
 * The same menu items as a dropdown under their button on a PC and as a
 * bottom sheet on a phone: reachable with the thumb, closed by a tap outside,
 * a swipe down, the back button or Escape. The parent owns `open` and keeps
 * the trigger (with `aria-expanded` / `aria-haspopup`) next to it.
 */
export function Menu({
  open,
  onClose,
  children,
  title,
  width = 'w-60',
  align = 'right',
  z = 'z-40',
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  title?: string
  width?: string
  align?: 'left' | 'right'
  z?: string
}) {
  const phone = useIsPhone()
  if (!phone) {
    if (!open) return null
    return (
      <div className={`glass absolute ${align === 'right' ? 'right-0' : 'left-0'} ${z} mt-1 ${width} rounded-[var(--radius-md)] border border-line p-1 shadow-elev-4`} role="menu" onMouseLeave={onClose}>
        {children}
      </div>
    )
  }
  return (
    <Sheet open={open} onClose={onClose} title={title} role="menu">
      {children}
    </Sheet>
  )
}

/**
 * Bottom sheet: slides up from the bottom edge, drag it down (or tap the
 * backdrop, press Escape, use the back button) to dismiss. Locks the page
 * scroll behind it and pads for the home indicator.
 */
export function Sheet({ open, onClose, title, children, role }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; role?: string }) {
  const reduce = useReducedMotion()
  const id = useId()
  useSheetBehaviour(open, onClose)
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

/**
 * Escape closes; the page behind does not scroll; a history entry is pushed
 * so the phone's back gesture closes the sheet instead of leaving the page.
 */
export function useSheetBehaviour(open: boolean, onClose: () => void) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Back button: our entry is on top of the stack while the sheet is open.
    const token = `sheet-${Date.now()}`
    let popped = false
    window.history.pushState({ ...(window.history.state ?? {}), sheet: token }, '')
    const onPop = () => {
      popped = true
      closeRef.current()
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('popstate', onPop)
      document.body.style.overflow = prev
      // Closed by a tap or a swipe: drop the entry we pushed so « retour » does not replay it.
      if (!popped && window.history.state?.sheet === token) window.history.back()
    }
  }, [open])
}
