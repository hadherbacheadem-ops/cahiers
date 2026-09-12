// ---------------------------------------------------------------------------
// Session ordering rules (pure): interleaving across fiches and types
// (Rohrer & Taylor; Brunmair & Richter 2019, g = 0.42, but g = −0.39 for
// vocabulary, hence the blocked order for lexical cahiers), sibling burying,
// leech detection and worked-example fading.
// ---------------------------------------------------------------------------

import type { Exercise, FadingState, Grade } from '../types'

const DAY = 86_400_000

export interface InterleaveOptions {
  /** Cahiers whose exercises must stay grouped by fiche, in due order. */
  lexicalCahiers?: Set<string>
}

/**
 * Reorders a review queue so that two exercises of the same point never follow
 * each other and, as far as possible, consecutive exercises come from different
 * fiches and use different types. Learning-state cards keep priority (they are
 * due within minutes). Lexical cahiers are appended as blocks, one fiche after
 * another.
 */
export function interleave(queue: Exercise[], options: InterleaveOptions = {}): Exercise[] {
  const lexical = options.lexicalCahiers ?? new Set<string>()
  const blocked = queue.filter((e) => lexical.has(e.cahierId))
  const free = queue.filter((e) => !lexical.has(e.cahierId))

  const learning = free.filter((e) => e.fsrs.state === 1 || e.fsrs.state === 3)
  const rest = free.filter((e) => !(e.fsrs.state === 1 || e.fsrs.state === 3))

  const out: Exercise[] = []
  const pending = [...learning, ...rest]
  // Siblings still waiting per point: the point with the most remaining
  // exercises is spread first, otherwise the greedy walk can end with "a, a".
  const remaining = new Map<string, number>()
  for (const e of pending) if (e.pointId) remaining.set(e.pointId, (remaining.get(e.pointId) ?? 0) + 1)
  let prev: Exercise | undefined
  while (pending.length) {
    let bestIndex = -1
    let bestScore = -Infinity
    for (let i = 0; i < pending.length; i++) {
      const e = pending[i]
      const samePoint = prev && e.pointId !== null && e.pointId === prev.pointId
      let score = 0
      if (samePoint) score -= 100
      if (prev && e.chapitreId !== prev.chapitreId) score += 2
      if (prev && e.type !== prev.type) score += 1
      if (e.pointId) score += 0.5 * ((remaining.get(e.pointId) ?? 1) - 1)
      // Keep the original (due) order as a tie-breaker, and never look too far
      // ahead: an item much later in the queue should not jump the whole line.
      score -= i * 0.01
      if (score > bestScore) {
        bestScore = score
        bestIndex = i
      }
    }
    const [next] = pending.splice(bestIndex, 1)
    if (next.pointId) remaining.set(next.pointId, (remaining.get(next.pointId) ?? 1) - 1)
    out.push(next)
    prev = next
  }

  // Blocked cahiers: grouped by fiche (stable), due order inside a fiche.
  const byFiche = new Map<string, Exercise[]>()
  for (const e of blocked) byFiche.set(e.chapitreId, [...(byFiche.get(e.chapitreId) ?? []), e])
  for (const list of byFiche.values()) out.push(...list.sort((a, b) => a.fsrs.due - b.fsrs.due))
  return out
}

/** True when two consecutive exercises share a point de cours. */
export function hasAdjacentSiblings(queue: Exercise[]): boolean {
  for (let i = 1; i < queue.length; i++) if (queue[i].pointId !== null && queue[i].pointId === queue[i - 1].pointId) return true
  return false
}

/** Siblings (same point, other id) that are still ahead in the queue: to bury after an answer. */
export function siblingsAhead(queue: Exercise[], fromIndex: number, answered: Exercise): Exercise[] {
  if (!answered.pointId) return []
  return queue.slice(fromIndex).filter((e) => e.id !== answered.id && e.pointId === answered.pointId)
}

/** Local-time start of tomorrow. */
export function startOfTomorrow(now = Date.now()): number {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d.getTime() + DAY
}

/** A card becomes a leech when it fails at (or beyond) the threshold of lapses. */
export function isLeechAfter(lapses: number, rating: number, threshold: number): boolean {
  return rating === 1 && lapses >= threshold
}

/**
 * Fading for worked examples: two consecutive successes raise the level
 * (1 → 2 → 3), an "Encore" lowers it. Level 1 = full example, one step hidden;
 * 2 = half the steps hidden; 3 = statement only.
 */
export function nextFading(current: FadingState | undefined, grade: Grade): FadingState {
  const state: FadingState = current ?? { level: 1, streak: 0 }
  if (grade === 'again') return { level: Math.max(1, state.level - 1) as FadingState['level'], streak: 0 }
  if (grade === 'hard') return { level: state.level, streak: 0 }
  const streak = state.streak + 1
  if (streak >= 2 && state.level < 3) return { level: (state.level + 1) as FadingState['level'], streak: 0 }
  return { level: state.level, streak: state.level === 3 ? 0 : streak }
}

/** Free-recall score → rating. */
export function recallGrade(ticked: number, total: number, confident: boolean): Grade {
  if (total === 0) return 'good'
  const ratio = ticked / total
  if (ratio < 0.5) return 'again'
  if (ratio < 0.8) return 'hard'
  if (ratio >= 1 && confident) return 'easy'
  return 'good'
}
