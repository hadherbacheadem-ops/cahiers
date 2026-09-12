import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

const TILT_MQ = typeof window !== 'undefined' ? window.matchMedia('(hover: hover) and (pointer: fine)') : null
const REDUCED = typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null

/**
 * Subtle 3D tilt (≤ 4°) following the pointer, with a specular highlight,
 * only on devices with a fine pointer and hover, never under reduced motion.
 * Transform only: no layout, no repaint of the children.
 */
export function TiltCard({ children, className, max = 4 }: { children: ReactNode; className?: string; max?: number }) {
  const ref = useRef<HTMLDivElement>(null)
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
      const el = ref.current
      if (!el || !enabled) return
      const r = el.getBoundingClientRect()
      const px = (e.clientX - r.left) / r.width
      const py = (e.clientY - r.top) / r.height
      const rx = (0.5 - py) * 2 * max
      const ry = (px - 0.5) * 2 * max
      el.style.transform = `perspective(1200px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`
      el.style.setProperty('--spec-x', `${(px * 100).toFixed(1)}%`)
      el.style.setProperty('--spec-y', `${(py * 100).toFixed(1)}%`)
      el.style.setProperty('--spec-o', '1')
    },
    [enabled, max],
  )
  const onLeave = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.transform = ''
    el.style.setProperty('--spec-o', '0')
  }, [])

  return (
    <div ref={ref} className={className} onPointerMove={enabled ? onMove : undefined} onPointerLeave={enabled ? onLeave : undefined} style={{ transition: 'transform 160ms var(--ease-out)', transformStyle: 'preserve-3d', willChange: enabled ? 'transform' : undefined }}>
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
  )
}
