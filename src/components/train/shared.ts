import { useEffect } from 'react'
import type { Confidence, Exercise, ExerciseData, ExerciseType, Grade } from '../../types'

export interface AnswerResult {
  correct: boolean
  grade: Grade
  /** Free recall: points whose notion was not produced (their exercises get re-prioritised). */
  missedPointIds?: string[]
  /** Confidence given BEFORE the answer was revealed (1 aucune idée, 2 hésitant, 3 sûr). */
  confidence?: Confidence
}

/** Interval each rating would schedule, e.g. { again: '10 min', good: '3 j' }. Only in review mode. */
export type IntervalLabels = Partial<Record<Grade, string>>

/** An exam caps the interval of some buttons: shown as a small « ⌃ examen » marker. */
export interface IntervalCap {
  days: number
  examName: string
  grades: Grade[]
}

/** Props shared by every player. `data` is `exercise.data` narrowed to the player's type. */
export interface PlayerProps<T extends ExerciseType = ExerciseType> {
  exercise: Exercise
  data: Extract<ExerciseData, { type: T }>
  chrono?: boolean
  /** Chrono: no verdict after the answer, the correction comes at the end of the quiz. */
  deferFeedback?: boolean
  /** Ask "Sûr / Hésitant / Aucune idée" before the answer is revealed (never after). */
  askConfidence?: boolean
  intervals?: IntervalLabels
  intervalCap?: IntervalCap
  /** Settings already loaded by the session (avoids a late re-layout when the hook resolves). */
  typedFlashcards?: boolean
  weightedMcq?: boolean
  onAnswer: (result: AnswerResult) => void
}

/** Tooltip of a capped grade button. */
export function capTitle(cap: IntervalCap): string {
  return `Intervalle plafonné à ${cap.days} j par l’examen ${cap.examName}`
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

/**
 * Window-level keyboard shortcuts for a player step. Disabled while `active`
 * is false, ignores modifier combos, key repeats and keystrokes typed into
 * form fields (unless `allowInFields`).
 */
export function useKeys(active: boolean, handler: (e: KeyboardEvent) => void, allowInFields = false) {
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
      if (!allowInFields && isEditableTarget(e.target)) return
      handler(e)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, handler, allowInFields])
}

/** Letter chip label for choice n (0 → A). */
export function letterFor(n: number): string {
  return String.fromCharCode(65 + (n % 26))
}
