import type { Exercise, Grade, SrsState } from '../types'

const DAY = 86_400_000
const MIN_EASE = 1.3

export function newSrs(now = Date.now()): SrsState {
  return { ease: 2.5, interval: 0, due: now, reps: 0, lapses: 0 }
}

export function isDue(s: SrsState, now = Date.now()): boolean {
  return s.due <= now
}

/** Only active exercises are scheduled; pending / suspended / leech ones never count as due. */
export function isDueExercise(e: Pick<Exercise, 'srs' | 'status'>, now = Date.now()): boolean {
  return e.status === 'active' && isDue(e.srs, now)
}

/**
 * Simplified SM-2. A failed card comes back in 10 minutes; first successes
 * land at 1 / 3 days, then intervals grow by the ease factor.
 */
export function schedule(s: SrsState, grade: Grade, now = Date.now()): SrsState {
  if (grade === 'again') {
    return {
      ease: Math.max(MIN_EASE, s.ease - 0.2),
      interval: 0,
      reps: 0,
      lapses: s.lapses + 1,
      due: now + 10 * 60_000,
    }
  }

  let interval: number
  if (s.reps === 0) interval = grade === 'easy' ? 4 : grade === 'hard' ? 0.5 : 1
  else if (s.reps === 1) interval = grade === 'easy' ? 7 : grade === 'hard' ? 2 : 3
  else {
    const factor = grade === 'hard' ? 1.2 : grade === 'easy' ? s.ease * 1.3 : s.ease
    interval = Math.max(s.interval + 1, Math.round(s.interval * factor))
  }

  const ease = grade === 'hard' ? Math.max(MIN_EASE, s.ease - 0.15) : grade === 'easy' ? s.ease + 0.15 : s.ease

  return { ease, interval, reps: s.reps + 1, lapses: s.lapses, due: now + interval * DAY }
}

/** Maps an auto-graded result (right / wrong) onto an SM-2 grade. */
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
