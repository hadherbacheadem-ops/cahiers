import { useEffect, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { useIsPhone } from '../lib/media'
import { katexReady, loadKatex, onKatexReady, renderTex } from '../lib/markdown'

/**
 * A row of maths keys pinned above the phone keyboard while a long-text field
 * is being edited, with a live KaTeX preview of the formula under the caret:
 * `\frac`, `^`, Greek letters and arrows are three taps away on a phone
 * keyboard, so they get their own keys. Positioned with `visualViewport`,
 * which is the only thing that knows where the keyboard ends on iOS.
 */

type Key = { label: string; insert: string; caret?: number; wrap?: boolean; title: string }

const KEYS: Key[] = [
  { label: '$ $', insert: '$$', caret: 1, wrap: true, title: 'Formule (LaTeX entre dollars)' },
  { label: 'x²', insert: '^{}', caret: 2, title: 'Exposant' },
  { label: 'xₙ', insert: '_{}', caret: 2, title: 'Indice' },
  { label: 'a⁄b', insert: '\\frac{}{}', caret: 6, title: 'Fraction' },
  { label: '√', insert: '\\sqrt{}', caret: 6, title: 'Racine' },
  { label: 'v⃗', insert: '\\vec{}', caret: 5, title: 'Vecteur' },
  { label: '∫', insert: '\\int ', title: 'Intégrale' },
  { label: 'Σ', insert: '\\sum ', title: 'Somme' },
  { label: '·', insert: '\\cdot ', title: 'Produit' },
  { label: '×', insert: '\\times ', title: 'Fois' },
  { label: '→', insert: '\\to ', title: 'Flèche' },
  { label: '≤', insert: '\\le ', title: 'Inférieur ou égal' },
  { label: '≥', insert: '\\ge ', title: 'Supérieur ou égal' },
  { label: '≠', insert: '\\ne ', title: 'Différent' },
  { label: '∞', insert: '\\infty ', title: 'Infini' },
  { label: 'α', insert: '\\alpha ', title: 'alpha' },
  { label: 'β', insert: '\\beta ', title: 'beta' },
  { label: 'γ', insert: '\\gamma ', title: 'gamma' },
  { label: 'δ', insert: '\\delta ', title: 'delta' },
  { label: 'ε', insert: '\\varepsilon ', title: 'epsilon' },
  { label: 'θ', insert: '\\theta ', title: 'theta' },
  { label: 'λ', insert: '\\lambda ', title: 'lambda' },
  { label: 'μ', insert: '\\mu ', title: 'mu' },
  { label: 'π', insert: '\\pi ', title: 'pi' },
  { label: 'σ', insert: '\\sigma ', title: 'sigma' },
  { label: 'ω', insert: '\\omega ', title: 'omega' },
  { label: 'Δ', insert: '\\Delta ', title: 'Delta' },
  { label: 'Ω', insert: '\\Omega ', title: 'Omega' },
  { label: '( )', insert: '()', caret: 1, wrap: true, title: 'Parenthèses' },
  { label: '{ }', insert: '{}', caret: 1, wrap: true, title: 'Accolades' },
]

/** Inserts at the caret (wrapping the selection for paired keys) through the native setter so React sees an input event. */
function insertKey(el: HTMLTextAreaElement, key: Key) {
  const start = el.selectionStart ?? el.value.length
  const end = el.selectionEnd ?? start
  const before = el.value.slice(0, start)
  const selected = el.value.slice(start, end)
  const after = el.value.slice(end)
  let next: string
  let caret: number
  if (key.wrap && selected) {
    const open = key.insert.slice(0, key.caret ?? 1)
    const close = key.insert.slice(key.caret ?? 1)
    next = before + open + selected + close + after
    caret = start + open.length + selected.length + close.length
  } else {
    next = before + key.insert + after
    caret = start + (key.caret ?? key.insert.length)
  }
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  if (setter) setter.call(el, next)
  else el.value = next
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.setSelectionRange(caret, caret)
}

/** The `$…$` formula around the caret on its line, else the last one before it, else the first one. */
export function formulaAtCaret(value: string, caret: number): string | null {
  const lineStart = value.lastIndexOf('\n', caret - 1) + 1
  const lineEndRaw = value.indexOf('\n', caret)
  const lineEnd = lineEndRaw === -1 ? value.length : lineEndRaw
  const line = value.slice(lineStart, lineEnd)
  const pos = caret - lineStart
  const found: { from: number; to: number; expr: string }[] = []
  const re = /\$\$([^$]+)\$\$|\$([^$\n]+)\$/g
  let m: RegExpExecArray | null
  while ((m = re.exec(line))) found.push({ from: m.index, to: m.index + m[0].length, expr: (m[1] ?? m[2]).trim() })
  if (!found.length) {
    // An unclosed formula being typed: from the last lone `$` to the caret.
    const open = line.lastIndexOf('$', pos - 1)
    if (open >= 0 && (line.slice(0, open).split('$').length - 1) % 2 === 0) {
      const expr = line.slice(open + 1, pos).trim()
      return expr || null
    }
    return null
  }
  const inside = found.find((f) => pos >= f.from && pos <= f.to)
  const before = [...found].reverse().find((f) => f.to <= pos)
  return (inside ?? before ?? found[0]).expr || null
}

export function MathToolbar({ target }: { target: HTMLTextAreaElement }) {
  const phone = useIsPhone()
  const [bottom, setBottom] = useState(0)
  const [formula, setFormula] = useState<string | null>(null)

  // Follow the keyboard: the layout viewport does not shrink on iOS, the visual one does.
  useEffect(() => {
    if (!phone) return
    const vv = window.visualViewport
    if (!vv) return
    const update = () => setBottom(Math.max(0, window.innerHeight - (vv.offsetTop + vv.height)))
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [phone])

  useEffect(() => {
    if (!phone) return
    const update = () => setFormula(formulaAtCaret(target.value, target.selectionStart ?? target.value.length))
    update()
    target.addEventListener('input', update)
    document.addEventListener('selectionchange', update)
    return () => {
      target.removeEventListener('input', update)
      document.removeEventListener('selectionchange', update)
    }
  }, [phone, target])

  const ready = useSyncExternalStore(onKatexReady, katexReady, katexReady)
  useEffect(() => {
    if (phone && !ready) void loadKatex()
  }, [phone, ready])

  if (!phone) return null
  const preview = formula ? renderTex(formula, false) : ''
  return createPortal(
    <div className="fixed inset-x-0 z-[60] border-t border-line bg-surface shadow-elev-3" style={{ bottom }} role="toolbar" aria-label="Clavier mathématique">
      {formula && (
        <div className="overflow-x-auto border-b border-line px-3 py-1.5 text-base text-ink [scrollbar-width:none]" aria-live="polite" aria-label="Aperçu de la formule">
          <span dangerouslySetInnerHTML={{ __html: preview }} />
        </div>
      )}
      <div className="flex gap-1 overflow-x-auto px-2 py-1.5 [scrollbar-width:none]">
        {KEYS.map((k) => (
          <button
            key={k.label}
            type="button"
            data-action="touche-math"
            title={k.title}
            aria-label={k.title}
            className="h-11 min-w-11 shrink-0 rounded-md border border-line bg-surface-2 px-2.5 text-base text-ink press"
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insertKey(target, k)}
          >
            {k.label}
          </button>
        ))}
      </div>
    </div>,
    document.body,
  )
}
