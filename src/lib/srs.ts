// Due-date helpers shared by the pages. Scheduling itself lives in lib/fsrs.ts.

import type { Exercise, Grade } from '../types'

const DAY = 86_400_000

/** Only active exercises are scheduled; pending / suspended / leech ones never count as due. */
export function isDueExercise(e: Pick<Exercise, 'fsrs' | 'status'>, now = Date.now()): boolean {
  return e.status === 'active' && e.fsrs.due <= now
}

/** Maps an auto-graded result (right / wrong) onto a rating. */
export function gradeFromCorrect(correct: boolean, fast = false): Grade {
  if (!correct) return 'again'
  return fast ? 'easy' : 'good'
}

/** Human label for the next review distance, e.g. "dans 3 j". */
export function formatDue(due: number, now = Date.now()): string {
  const diff = due - now
  if (diff <= 0) return 'à revoir'
  const minutes = Math.round(diff / 60_000)
  if (minutes < 60) return `dans ${minutes} min`
  const hours = Math.round(diff / 3_600_000)
  if (hours < 24) return `dans ${hours} h`
  const days = Math.round(diff / DAY)
  if (days < 30) return `dans ${days} j`
  return `dans ${Math.round(days / 30)} mois`
}
