import { Suspense, lazy, useEffect, useRef, useState, type ReactNode } from 'react'
import { useIsPhone } from '../lib/media'
import { pushOverlay } from '../lib/backStack'

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

const SheetImpl = lazy(() => import('./overlays').then((mod) => ({ default: mod.SheetImpl })))

export interface SheetProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  role?: string
}

/** Bottom sheet (motion, in overlays.tsx): mounted from its first opening on, so the closing slide can play. */
export function Sheet(props: SheetProps) {
  // Escape, scroll lock and the history entry belong to the wrapper: they must exist before the chunk arrives.
  useSheetBehaviour(props.open, props.onClose)
  const [seen, setSeen] = useState(props.open)
  if (props.open && !seen) setSeen(true)
  if (!seen) return null
  return (
    <Suspense fallback={null}>
      <SheetImpl {...props} />
    </Suspense>
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
    // Back button / back gesture closes the sheet instead of leaving the page.
    const release = pushOverlay(() => closeRef.current())
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
      release()
    }
  }, [open])
}
