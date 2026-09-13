import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

const TILT_MQ = typeof window !== 'undefined' ? window.matchMedia('(hover: hover) and (pointer: fine)') : null
const REDUCED = typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null

/** Above this height the tilt is off: a rotated tall card visibly grows and shrinks at its edges. */
const MAX_TILT_HEIGHT = 900
/** Tilt is damped from this height on (full angle on a 500 px card, a quarter at 900 px). */
const FULL_TILT_HEIGHT = 500

/**
 * Subtle 3D tilt (≤ 4°) following the pointer, with a specular highlight,
 * only on devices with a fine pointer and hover, never under reduced motion.
 * Transform only: no layout, no repaint of the children.
 *
 * The pointer is tracked on a static wrapper, not on the rotated element:
 * a rotated edge that moves away from the cursor would otherwise fire
 * pointerleave, reset, come back under the cursor and tilt again — the
 * flicker seen at the bottom of tall cards.
 */
export function TiltCard({ children, className, max = 4 }: { children: ReactNode; className?: string; max?: number }) {
  const outer = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const [enabled, setEnabled] = useState(false)
  useEffect(() => {
    const update = () => setEnabled(!!TILT_MQ?.matches && !REDUCED?.matches)
    update()
    TILT_MQ?.addEventListener('change', update)
    REDUCED?.addEventListener('change', update)
    return () => {
      TILT_MQ?.removeEventListener('change', update)
      REDUCED?.removeEventListener('change', update)
    }
  }, [])

  const onMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const box = outer.current
      const el = inner.current
      if (!box || !el || !enabled) return
      const r = box.getBoundingClientRect()
      if (r.height > MAX_TILT_HEIGHT) return
      const px = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
      const py = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
      const angle = max * Math.min(1, FULL_TILT_HEIGHT / Math.max(r.height, 1))
      const rx = (0.5 - py) * 2 * angle
      const ry = (px - 0.5) * 2 * angle
      el.style.transform = `perspective(1200px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`
      el.style.setProperty('--spec-x', `${(px * 100).toFixed(1)}%`)
      el.style.setProperty('--spec-y', `${(py * 100).toFixed(1)}%`)
      el.style.setProperty('--spec-o', '1')
    },
    [enabled, max],
  )
  const onLeave = useCallback(() => {
    const el = inner.current
    if (!el) return
    el.style.transform = ''
    el.style.setProperty('--spec-o', '0')
  }, [])

  return (
    <div ref={outer} onPointerMove={enabled ? onMove : undefined} onPointerLeave={enabled ? onLeave : undefined}>
      <div ref={inner} className={className} style={{ transition: 'transform 160ms var(--ease-out)', transformStyle: 'preserve-3d', willChange: enabled ? 'transform' : undefined }}>
        {children}
        {enabled && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-[inherit]"
            style={{
              background: 'radial-gradient(420px circle at var(--spec-x, 50%) var(--spec-y, 50%), rgba(255, 255, 255, 0.07), transparent 60%)',
              opacity: 'var(--spec-o, 0)',
              transition: 'opacity 200ms var(--ease-out)',
            }}
          />
        )}
      </div>
    </div>
  )
}
