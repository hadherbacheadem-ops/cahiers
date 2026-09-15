import { useEffect, useState } from 'react'

type IdleWindow = Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }

/**
 * Renders a long list in slices: the first `first` items now, `step` more per
 * idle period until everything is there. On a phone with a slow CPU the
 * first paint of a fiche with 40 exercise cards (markdown + KaTeX each)
 * stops being one 3-second task; the rest arrives while the user reads.
 */
export function useProgressive<T>(items: T[], first = 12, step = 12): T[] {
  const [count, setCount] = useState(first)
  useEffect(() => {
    if (count >= items.length) return
    const w = window as IdleWindow
    const idle = w.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 40))
    const cancel = w.cancelIdleCallback ?? ((id: number) => window.clearTimeout(id))
    const id = idle(() => setCount((c) => Math.min(items.length, c + step)), { timeout: 500 })
    return () => cancel(id)
  }, [count, items.length, step])
  return count >= items.length ? items : items.slice(0, count)
}
