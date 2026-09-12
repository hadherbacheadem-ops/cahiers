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

export function matchesAnswer(input: string, answers: string[]): boolean {
  const n = normalizeAnswer(input)
  if (!n) return false
  return answers.some((a) => normalizeAnswer(a) === n)
}
