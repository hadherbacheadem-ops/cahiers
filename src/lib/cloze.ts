import { canonicalMath, isFormula, looksLikeLatex } from './typed'

// Cloze texts store blanks inline as {{réponse}} or {{réponse|variante}}.
// A blank may wrap a whole LaTeX formula ({{$\dfrac{1}{2}mv^2$}}), so braces
// inside a blank are balanced by hand instead of forbidden by a regex.

export type ClozeSegment = { kind: 'text'; value: string } | { kind: 'blank'; index: number; answers: string[] }

export interface BlankSpan {
  /** Index of the opening "{{". */
  start: number
  /** Index just after the closing "}}". */
  end: number
  /** Raw content between the braces. */
  inner: string
}

/** Index of the "}}" closing a blank opened at `open`, or -1; braces inside the blank must balance. */
function blankEnd(text: string, open: number): number {
  let depth = 0
  for (let i = open + 2; i < text.length; i++) {
    const ch = text[i]
    if (ch === '\\') {
      i++
      continue
    }
    if (ch === '{') depth++
    else if (ch === '}') {
      if (depth > 0) depth--
      else if (text[i + 1] === '}') return i
      else return -1
    }
  }
  return -1
}

/** Every well-formed blank of the text, left to right. */
export function findBlanks(text: string): BlankSpan[] {
  const out: BlankSpan[] = []
  let i = text.indexOf('{{')
  while (i >= 0) {
    const close = blankEnd(text, i)
    if (close < 0 || close === i + 2) {
      i = text.indexOf('{{', i + 2)
      continue
    }
    out.push({ start: i, end: close + 2, inner: text.slice(i + 2, close) })
    i = text.indexOf('{{', close + 2)
  }
  return out
}

/** Variants of a blank: split on "|" unless it is escaped (LaTeX norms \| stay intact). */
export function blankAnswers(inner: string): string[] {
  const answers = inner
    .split(/(?<!\\)\|/)
    .map((s) => s.trim())
    .filter(Boolean)
  return answers.length ? answers : [inner.trim()]
}

/** Replaces each blank by `fn(inner)`. */
export function replaceBlanks(text: string, fn: (inner: string) => string): string {
  let out = ''
  let last = 0
  for (const b of findBlanks(text)) {
    out += text.slice(last, b.start) + fn(b.inner)
    last = b.end
  }
  return out + text.slice(last)
}

export function parseCloze(text: string): ClozeSegment[] {
  const out: ClozeSegment[] = []
  let last = 0
  let index = 0
  for (const b of findBlanks(text)) {
    if (b.start > last) out.push({ kind: 'text', value: text.slice(last, b.start) })
    out.push({ kind: 'blank', index: index++, answers: blankAnswers(b.inner) })
    last = b.end
  }
  if (last < text.length) out.push({ kind: 'text', value: text.slice(last) })
  return out
}

export function countBlanks(text: string): number {
  return parseCloze(text).filter((s) => s.kind === 'blank').length
}

/** Renders the cloze with blanks revealed, for previews and result screens. */
export function clozeToPlain(text: string): string {
  return replaceBlanks(text, (inner) => blankAnswers(inner)[0])
}

/** For each blank in order, whether it sits inside $…$ (an odd number of unescaped dollars precedes it). */
export function blankMathFlags(text: string): boolean[] {
  const flags: boolean[] = []
  let inMath = false
  let i = 0
  while (i < text.length) {
    if (text[i] === '\\') {
      i += 2
      continue
    }
    if (text.startsWith('{{', i)) {
      const end = blankEnd(text, i)
      if (end > i + 2) flags.push(inMath)
      i = end < 0 ? i + 2 : end + 2
      continue
    }
    if (text[i] === '$') inMath = !inMath
    i++
  }
  return flags
}

/** True when at least one blank sits inside $…$. */
export function blankInsideMath(text: string): boolean {
  return blankMathFlags(text).some(Boolean)
}

/**
 * Cloze with blanks shown as gaps, safe for markdown + LaTeX rendering:
 * a gap inside a formula becomes \boxed{\,?\,}, outside it becomes ____.
 */
export function clozeDisplayText(text: string, reveal = false): string {
  let inMath = false
  let out = ''
  let i = 0
  while (i < text.length) {
    if (text[i] === '\\') {
      out += text.slice(i, i + 2)
      i += 2
      continue
    }
    if (text.startsWith('{{', i)) {
      const end = blankEnd(text, i)
      const inner = end < 0 ? text.slice(i + 2) : text.slice(i + 2, end)
      const answer = blankAnswers(inner)[0]
      if (reveal) out += inMath ? `\\boxed{${answer}}` : `**${answer}**`
      else out += inMath ? '\\boxed{\\,?\\,}' : '____'
      i = end < 0 ? text.length : end + 2
      continue
    }
    if (text[i] === '$') inMath = !inMath
    out += text[i]
    i++
  }
  return out
}

/** Lowercase, strip accents and punctuation, collapse whitespace. */
export function normalizeAnswer(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const ARTICLES = /^(?:le|la|les|l'|un|une|des|du|de|d'|the|a|an)\s+/

/** Optimal string alignment distance (insertions, deletions, substitutions, adjacent transpositions). */
export function editDistance(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array<number>(n).fill(0)])
  for (let j = 0; j <= n; j++) d[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
    }
  }
  return d[m][n]
}

/** Typos allowed for a word of this length: none under 5 letters (ADN ≠ ARN), one up to 9, two beyond. */
export function typoAllowance(length: number): number {
  return length < 5 ? 0 : length < 10 ? 1 : 2
}

/**
 * Whether a typed blank matches one of its accepted answers.
 * Formulas (a `$…$` answer, a LaTeX command, `=`, `^`…) compare on their
 * canonical maths, so `q(t)=Cu(t)` fits `$q(t) = C\,u(t)$` — signs,
 * exponents and factors still count. Text compares without case, accents
 * or punctuation, ignores a leading article, and forgives one typo from five
 * letters (two from ten): a slip of the finger is not a memory failure.
 */
export function matchesAnswer(input: string, answers: string[]): boolean {
  const raw = input.trim()
  if (!raw) return false
  return answers.some((answer) => {
    if (isFormula(answer) || looksLikeLatex(raw)) {
      const a = canonicalMath(raw)
      const b = canonicalMath(answer)
      return !!a && a === b
    }
    const n = normalizeAnswer(raw)
    const target = normalizeAnswer(answer)
    if (!n || !target) return false
    if (n === target) return true
    const ns = n.replace(ARTICLES, '')
    const ts = target.replace(ARTICLES, '')
    if (ns === ts) return true
    return editDistance(ns, ts) <= typoAllowance(ts.length)
  })
}
