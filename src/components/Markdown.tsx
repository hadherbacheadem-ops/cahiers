import { useMemo } from 'react'
import { renderMarkdown } from '../lib/markdown'
import { cx } from './ui'

/**
 * Renders light markdown with LaTeX. `inline` for one-line content (questions,
 * choices, answers): no block elements, rendered inside a <span>.
 */
export function Markdown({ text, inline = false, className }: { text: string; inline?: boolean; className?: string }) {
  const html = useMemo(() => renderMarkdown(text, { inline }), [text, inline])
  if (inline) return <span className={cx('md-inline', className)} dangerouslySetInnerHTML={{ __html: html }} />
  return <div className={cx('prose-fiche', className)} dangerouslySetInnerHTML={{ __html: html }} />
}
