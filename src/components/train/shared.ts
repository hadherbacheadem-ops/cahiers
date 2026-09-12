import { useEffect } from 'react'
import type { Exercise, ExerciseData, ExerciseType, Grade } from '../../types'

export interface AnswerResult {
  correct: boolean
  grade: Grade
}

/** Props shared by every player. `data` is `exercise.data` narrowed to the player's type. */
export interface PlayerProps<T extends ExerciseType = ExerciseType> {
  exercise: Exercise
  data: Extract<ExerciseData, { type: T }>
  chrono?: boolean
  onAnswer: (result: AnswerResult) => void
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
