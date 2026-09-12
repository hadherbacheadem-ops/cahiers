// Vrai/Faux + correction (pure): the verdict is auto-graded, the written
// correction only gets a *suggested* grade — a right correction phrased
// differently must still be gradable "Bien" by the student.

import type { Grade } from '../types'
import { similarity } from './dedupe'

/** Below this similarity the correction is proposed as "Difficile" (never imposed). */
export const CORRECTION_SUGGEST_THRESHOLD = 0.45

export interface TrueFalseOutcome {
  /** Verdict right or wrong; a wrong verdict is "Encore", not negotiable. */
  correct: boolean
  /** Grade put forward; the student may pick any of the four when `open`. */
  suggested: Grade
  /** True when the four grade buttons are offered (right verdict with a written correction). */
  open: boolean
  similarity: number | null
}

export function trueFalseOutcome(picked: boolean, expected: boolean, written: string, expectedCorrection: string | undefined): TrueFalseOutcome {
  const correct = picked === expected
  if (!correct) return { correct: false, suggested: 'again', open: false, similarity: null }
  const needsCorrection = picked === false && !!expectedCorrection?.trim()
  if (!needsCorrection) return { correct: true, suggested: 'good', open: false, similarity: null }
  const sim = similarity(written, expectedCorrection!)
  return { correct: true, suggested: sim >= CORRECTION_SUGGEST_THRESHOLD ? 'good' : 'hard', open: true, similarity: sim }
}

/** Grades the student may choose after a right verdict with a correction. */
export const CORRECTION_GRADES: Grade[] = ['again', 'hard', 'good', 'easy']
