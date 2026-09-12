// ---------------------------------------------------------------------------
// Typed answers (pure): tolerant comparison for prose and for LaTeX, plus a
// word-level diff for the feedback. The comparison is an aid — the student
// still confirms right / wrong.
// ---------------------------------------------------------------------------

import { normalizeText } from './dedupe'

/**
 * Normalises a LaTeX fragment: delimiters, \left \right, thin spaces, braces
 * around single tokens, spacing commands, and \frac{a}{b} vs a/b are treated
 * alike. Returns '' for text without maths.
 */
export function normalizeLatex(s: string): string {
  let t = s.trim()
  t = t.replace(/^\$+|\$+$/g, '')
  t = t.replace(/\\\(|\\\)|\\\[|\\\]/g, '')
  t = t.replace(/\\left|\\right|\\displaystyle|\\textstyle/g, '')
  t = t.replace(/\\[,;:!]|\\quad|\\qquad|~/g, '')
  // Wrappers may contain one level of nested braces (\mathrm{m\cdot s^{-1}}).
  t = t.replace(/\\(?:mathrm|mathbf|text|textrm|operatorname)\{((?:[^{}]|\{[^{}]*\})*)\}/g, '$1')
  t = t.replace(/\\times/g, '\\cdot')
  t = t.replace(/\\dfrac|\\tfrac/g, '\\frac') // before \frac is rewritten
  t = t.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)')
  t = t.replace(/\^\{([A-Za-z0-9])\}/g, '^$1') // x^{2} → x^2
  t = t.replace(/(^|[^\\A-Za-z])\{([A-Za-z0-9])\}/g, '$1$2') // {x} → x, but not inside a command name
  t = t.replace(/\s+/g, '')
  return t.toLowerCase()
}

export function looksLikeLatex(s: string): boolean {
  return /\$|\\[a-zA-Z]+|[_^]/.test(s)
}

/**
 * A formula is what the answer is when it carries math delimiters, a LaTeX
 * command or backslash, an `=`, `^` or `_`, a Greek letter, a digit glued to a
 * letter (2x, 10m) or a unit quotient (m/s), or when symbols outnumber letters
 * (2πr, 9,81 m/s²). When in doubt, formula: a wrong "text" verdict can put
 * "Bien" forward on a sign error, a wrong "formula" verdict only withholds the
 * suggestion. `F = ma (deuxième loi de Newton)` is therefore a formula.
 */
export function isFormula(answer: string): boolean {
  const s = answer.trim()
  if (!s) return false
  if (/\$|\\/.test(s)) return true
  if (/[=^_]/.test(s)) return true
  if (/[Ͱ-Ͽ]/.test(s)) return true // Greek, as Unicode (α, Δ, ω…)
  if (/\d\p{L}|\p{L}\d/u.test(s)) return true // 2x, 10m, x2
  if (/\p{L}\/\p{L}/u.test(s)) return true // m/s, J/K
  if (/[²³¹⁰-⁹½⅓¼]/.test(s)) return true
  const letters = (s.match(/\p{L}/gu) ?? []).length
  const symbols = (s.match(/[\d=+\-*/^_()[\]{}<>≤≥≈·×πΔ∑∫√°%,.]/g) ?? []).length
  return symbols > 0 && symbols >= letters
}

export interface TypedMatchOptions {
  /** The exercise tests a formula / theorem point or carries a "formule" tag: compare as a formula regardless of the text. */
  forceFormula?: boolean
}

export type Suggestion = 'good' | 'again' | null

export interface TypedMatch {
  /** Exact after normalisation. */
  exact: boolean
  /** Dice similarity on normalised text, 0–1. */
  score: number
  /** Which stored answer matched best. */
  best: string
  /** The expected answer is a formula: only an exact match may be suggested as right. */
  formula: boolean
  /** Button to put forward, or none when the comparison is inconclusive. */
  suggestion: Suggestion
  /** Character diff on the normalised LaTeX (formulas only, when not exact). */
  charDiff?: DiffPart[]
}

/** Text: ≥ 0.85 → "Bien" suggested, < 0.6 → "Encore", in between no suggestion. Formulas: exact only. */
export const TEXT_ACCEPT = 0.85
export const TEXT_REJECT = 0.6

function trigrams(s: string): Set<string> {
  const padded = `  ${s} `
  const out = new Set<string>()
  for (let i = 0; i + 3 <= padded.length; i++) out.add(padded.slice(i, i + 3))
  return out
}

function dice(a: string, b: string): number {
  const ta = trigrams(a)
  const tb = trigrams(b)
  if (!ta.size || !tb.size) return a === b ? 1 : 0
  let shared = 0
  for (const t of ta) if (tb.has(t)) shared++
  return (2 * shared) / (ta.size + tb.size)
}

/**
 * Compares the input with each accepted answer, prose and LaTeX aware. For a
 * formula, a sign, exponent or factor error still scores > 0.85 on trigrams,
 * so similarity must never put "Bien" forward: exact match or nothing.
 */
export function typedMatch(input: string, answers: string[], options: TypedMatchOptions = {}): TypedMatch {
  const formula = !!options.forceFormula || answers.some(isFormula) || looksLikeLatex(input)
  let best: { exact: boolean; score: number; best: string; a: string; b: string } = { exact: false, score: 0, best: answers[0] ?? '', a: '', b: '' }
  for (const answer of answers) {
    const a = formula ? normalizeLatex(input) : normalizeText(input)
    const b = formula ? normalizeLatex(answer) : normalizeText(answer)
    const exact = !!a && a === b
    const score = exact ? 1 : dice(a, b)
    if (exact || score > best.score) best = { exact, score, best: answer, a, b }
    if (exact) break
  }
  let suggestion: Suggestion
  if (formula) suggestion = best.exact ? 'good' : null
  else suggestion = best.exact || best.score >= TEXT_ACCEPT ? 'good' : best.score < TEXT_REJECT ? 'again' : null
  const out: TypedMatch = { exact: best.exact, score: best.score, best: best.best, formula, suggestion }
  if (formula && !best.exact) out.charDiff = charDiff(best.a, best.b)
  return out
}

export type DiffPart = { kind: 'same' | 'added' | 'missing'; text: string }

/** Character-level diff (LCS) between the typed and the expected normalised LaTeX. */
export function charDiff(typed: string, expected: string): DiffPart[] {
  const a = [...typed]
  const b = [...expected]
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const out: DiffPart[] = []
  const push = (kind: DiffPart['kind'], text: string) => {
    const last = out[out.length - 1]
    if (last && last.kind === kind) last.text += text
    else out.push({ kind, text })
  }
  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      push('same', b[j])
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) push('added', a[i++])
    else push('missing', b[j++])
  }
  while (i < m) push('added', a[i++])
  while (j < n) push('missing', b[j++])
  return out
}

/** Word-level diff (LCS) between what was typed and the expected answer. */
export function wordDiff(typed: string, expected: string): DiffPart[] {
  const a = typed.trim().split(/\s+/).filter(Boolean)
  const b = expected.trim().split(/\s+/).filter(Boolean)
  const norm = (w: string) => normalizeText(w)
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) dp[i][j] = norm(a[i]) === norm(b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const out: DiffPart[] = []
  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (norm(a[i]) === norm(b[j])) {
      out.push({ kind: 'same', text: b[j] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ kind: 'added', text: a[i] })
      i++
    } else {
      out.push({ kind: 'missing', text: b[j] })
      j++
    }
  }
  while (i < m) out.push({ kind: 'added', text: a[i++] })
  while (j < n) out.push({ kind: 'missing', text: b[j++] })
  return out
}
