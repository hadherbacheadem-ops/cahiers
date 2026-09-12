// Cloze texts store blanks inline as {{réponse}} or {{réponse|variante}}.

export type ClozeSegment = { kind: 'text'; value: string } | { kind: 'blank'; index: number; answers: string[] }

const BLANK_RE = /\{\{([^{}]+)\}\}/g

export function parseCloze(text: string): ClozeSegment[] {
  const out: ClozeSegment[] = []
  let last = 0
  let index = 0
  for (const m of text.matchAll(BLANK_RE)) {
    const start = m.index ?? 0
    if (start > last) out.push({ kind: 'text', value: text.slice(last, start) })
    const answers = m[1]
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean)
    out.push({ kind: 'blank', index: index++, answers: answers.length ? answers : [m[1].trim()] })
    last = start + m[0].length
  }
  if (last < text.length) out.push({ kind: 'text', value: text.slice(last) })
  return out
}

export function countBlanks(text: string): number {
  return parseCloze(text).filter((s) => s.kind === 'blank').length
}

/** Renders the cloze with blanks revealed, for previews and result screens. */
export function clozeToPlain(text: string): string {
  return text.replace(BLANK_RE, (_, inner: string) => inner.split('|')[0].trim())
}

/** True when a blank sits inside $…$ (an odd number of unescaped dollars precedes it). */
export function blankInsideMath(text: string): boolean {
  let inMath = false
  let i = 0
  while (i < text.length) {
    if (text[i] === '\\') {
      i += 2
      continue
    }
    if (text.startsWith('{{', i)) {
      if (inMath) return true
      const end = text.indexOf('}}', i)
      i = end < 0 ? text.length : end + 2
      continue
    }
    if (text[i] === '$') inMath = !inMath
    i++
  }
  return false
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
      const end = text.indexOf('}}', i)
      const inner = end < 0 ? text.slice(i + 2) : text.slice(i + 2, end)
      const answer = inner.split('|')[0].trim()
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
