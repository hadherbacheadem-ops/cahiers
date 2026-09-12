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
  t = t.replace(/\\left|\\right/g, '')
  t = t.replace(/\\[,;:!]|\\quad|\\qquad|~/g, '')
  // Wrappers may contain one level of nested braces (\mathrm{m\cdot s^{-1}}).
  t = t.replace(/\\(?:mathrm|mathbf|text|textrm|operatorname)\{((?:[^{}]|\{[^{}]*\})*)\}/g, '$1')
  t = t.replace(/\\cdot|\\times/g, '*')
  t = t.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)')
  t = t.replace(/\\dfrac|\\tfrac/g, '\\frac')
  t = t.replace(/\{([A-Za-z0-9])\}/g, '$1') // x^{2} → x^2
  t = t.replace(/\s+/g, '')
  return t.toLowerCase()
}

export function looksLikeLatex(s: string): boolean {
  return /\$|\\[a-zA-Z]+|[_^]/.test(s)
}

export interface TypedMatch {
  /** Exact after normalisation. */
  exact: boolean
  /** Dice similarity on normalised text, 0–1. */
  score: number
  /** Which stored answer matched best. */
  best: string
}

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

/** Compares the input with each accepted answer, prose and LaTeX aware. */
export function typedMatch(input: string, answers: string[]): TypedMatch {
  let best: TypedMatch = { exact: false, score: 0, best: answers[0] ?? '' }
  for (const answer of answers) {
    const latex = looksLikeLatex(answer) || looksLikeLatex(input)
    const a = latex ? normalizeLatex(input) : normalizeText(input)
    const b = latex ? normalizeLatex(answer) : normalizeText(answer)
    const exact = !!a && a === b
    const score = exact ? 1 : dice(a, b)
    if (exact || score > best.score) best = { exact, score, best: answer }
    if (exact) break
  }
  return best
}

/** Above this the answer is proposed as right (the student can still say no). */
export const TYPED_ACCEPT = 0.85

export type DiffPart = { kind: 'same' | 'added' | 'missing'; text: string }

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
