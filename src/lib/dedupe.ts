// ---------------------------------------------------------------------------
// Near-duplicate detection on normalised text: character trigrams + Dice
// coefficient. 0.8 is a conservative threshold: reworded questions on the same
// fact score around 0.5–0.7, copies with a changed word score above 0.85.
// ---------------------------------------------------------------------------

import type { Exercise } from '../types'

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

// ---- Flashcards asked twice ------------------------------------------------------

export interface FlashcardDuplicate {
  /** The exercise that stays (turned into a plain « flip » card). */
  survivor: Exercise
  /** The one to delete. */
  removed: Exercise
  score: number
}

const QUESTION_THRESHOLD = 0.9
const ANSWER_THRESHOLD = 0.75

/** Review history, then the card that is already a plain flip card, then the active one, then the older one. */
function preferred(a: Exercise, b: Exercise): Exercise {
  const reps = (e: Exercise) => e.fsrs.reps + e.fsrs.lapses
  if (reps(a) !== reps(b)) return reps(a) > reps(b) ? a : b
  const typed = (e: Exercise) => (e.data.type === 'flashcard' && e.data.typed ? 1 : 0)
  if (typed(a) !== typed(b)) return typed(a) < typed(b) ? a : b
  const rank = (e: Exercise) => (e.status === 'active' ? 0 : e.status === 'pending' ? 1 : 2)
  if (rank(a) !== rank(b)) return rank(a) < rank(b) ? a : b
  return a.createdAt <= b.createdAt ? a : b
}

/**
 * Flashcards of one fiche that ask the same question twice — typically the
 * « typed » copy and the « flip » copy of the same fact, or the same card
 * generated twice. Each pair names the survivor (the one with history, else
 * the plain flip card) and the copy to remove. An exercise appears in at most
 * one pair.
 */
export function findFlashcardDuplicates(exercises: Exercise[]): FlashcardDuplicate[] {
  const cards = exercises.filter((e) => e.data.type === 'flashcard' && e.status !== 'suspended' && e.status !== 'leech')
  const q = cards.map((e) => trigrams(normalizeText(e.data.type === 'flashcard' ? e.data.question : '')))
  const a = cards.map((e) => normalizeText(e.data.type === 'flashcard' ? e.data.answer : ''))
  const at = a.map((t) => trigrams(t))
  const taken = new Set<string>()
  const out: FlashcardDuplicate[] = []
  for (let i = 0; i < cards.length; i++) {
    if (taken.has(cards[i].id)) continue
    for (let j = i + 1; j < cards.length; j++) {
      if (taken.has(cards[j].id)) continue
      const qs = dice(q[i], q[j])
      if (qs < QUESTION_THRESHOLD) continue
      const as = a[i] === a[j] ? 1 : dice(at[i], at[j])
      if (as < ANSWER_THRESHOLD) continue
      const survivor = preferred(cards[i], cards[j])
      const removed = survivor === cards[i] ? cards[j] : cards[i]
      out.push({ survivor, removed, score: Math.min(qs, as) })
      taken.add(cards[i].id)
      taken.add(cards[j].id)
      break
    }
  }
  return out
}
