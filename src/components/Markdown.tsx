import { useMemo, useSyncExternalStore } from 'react'
import { katexReady, onKatexReady, renderMarkdown } from '../lib/markdown'
import { cx } from './ui'

/**
 * Renders light markdown with LaTeX. `inline` for one-line content (questions,
 * choices, answers): no block elements, rendered inside a <span>.
 */
export function Markdown({ text, inline = false, className }: { text: string; inline?: boolean; className?: string }) {
  // Re-render once KaTeX has arrived (formulas are shown as source until then).
  const ready = useSyncExternalStore(onKatexReady, katexReady, katexReady)
  const html = useMemo(() => renderMarkdown(text, { inline }), [text, inline, ready])
  if (inline) return <span className={cx('md-inline', className)} dangerouslySetInnerHTML={{ __html: html }} />
  return <div className={cx('prose-fiche', className)} dangerouslySetInnerHTML={{ __html: html }} />
}
