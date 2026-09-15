import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { mathCached, onMathRendered, patchPendingMath, renderMarkdownInfo } from '../lib/markdown'
import { cx } from './ui'

/** Formulas are requested from the worker this far before entering the viewport. */
const NEAR_MARGIN = '600px 0px'

/**
 * Renders light markdown with LaTeX. `inline` for one-line content (questions,
 * choices, answers): no block elements, rendered inside a <span>.
 *
 * Formulas are rendered off the main thread and only once the element comes
 * within 600 px of the viewport; until then they show as their source with the
 * line reserved, and the component re-renders when the HTML arrives.
 */
export function Markdown({ text, inline = false, className }: { text: string; inline?: boolean; className?: string }) {
  const ref = useRef<HTMLElement | null>(null)
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    if (near) return
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true)
          io.disconnect()
        }
      },
      { rootMargin: NEAR_MARGIN },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [near])

  // Wake up only when one of *our* formulas has arrived (the snapshot is the number of our
  // placeholders still missing from the cache); then patch the placeholders in place rather than
  // re-rendering the block: no re-parse of the whole fiche, no full relayout.
  const pendingRef = useRef<string[]>([])
  const missing = useSyncExternalStore(
    onMathRendered,
    () => pendingRef.current.reduce((n, k) => n + (mathCached(k) ? 0 : 1), 0),
    () => 0,
  )
  const html = useMemo(() => {
    const r = renderMarkdownInfo(text, { inline, queue: near })
    pendingRef.current = r.pendingKeys
    return r.html
  }, [text, inline, near])
  useEffect(() => {
    if (!ref.current || pendingRef.current.length === 0) return
    patchPendingMath(ref.current)
    pendingRef.current = pendingRef.current.filter((k) => !mathCached(k))
  }, [html, missing])

  if (inline) return <span ref={ref as React.RefObject<HTMLSpanElement>} className={cx('md-inline', className)} dangerouslySetInnerHTML={{ __html: html }} />
  return <div ref={ref as React.RefObject<HTMLDivElement>} className={cx('prose-fiche', className)} dangerouslySetInnerHTML={{ __html: html }} />
}
