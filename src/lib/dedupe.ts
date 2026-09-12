// ---------------------------------------------------------------------------
// Near-duplicate detection on normalised text: character trigrams + Dice
// coefficient. 0.8 is a conservative threshold: reworded questions on the same
// fact score around 0.5–0.7, copies with a changed word score above 0.85.
// ---------------------------------------------------------------------------

export const DUPLICATE_THRESHOLD = 0.8

/** Lowercase, no accents, no punctuation, single spaces. */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\{\{|\}\}/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function trigrams(s: string): Set<string> {
  const padded = `  ${s} `
  const out = new Set<string>()
  for (let i = 0; i + 3 <= padded.length; i++) out.add(padded.slice(i, i + 3))
  return out
}

export function dice(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  let shared = 0
  for (const t of a) if (b.has(t)) shared++
  return (2 * shared) / (a.size + b.size)
}

export function similarity(a: string, b: string): number {
  return dice(trigrams(normalizeText(a)), trigrams(normalizeText(b)))
}

export interface DuplicateHit {
  /** Index of the candidate. */
  index: number
  /** Where the near-duplicate is: an existing exercise, or an earlier candidate in the same batch. */
  against: { kind: 'existing'; index: number } | { kind: 'candidate'; index: number }
  score: number
}

/** Compares each candidate with every existing text and every earlier candidate. */
export function findDuplicates(candidates: string[], existing: string[], threshold = DUPLICATE_THRESHOLD): DuplicateHit[] {
  const ex = existing.map((s) => trigrams(normalizeText(s)))
  const cand = candidates.map((s) => trigrams(normalizeText(s)))
  const hits: DuplicateHit[] = []
  cand.forEach((c, i) => {
    let best: DuplicateHit | null = null
    ex.forEach((e, j) => {
      const score = dice(c, e)
      if (score >= threshold && (!best || score > best.score)) best = { index: i, against: { kind: 'existing', index: j }, score }
    })
    for (let j = 0; j < i; j++) {
      const score = dice(c, cand[j])
      if (score >= threshold && (!best || score > best.score)) best = { index: i, against: { kind: 'candidate', index: j }, score }
    }
    if (best) hits.push(best)
  })
  return hits
}
