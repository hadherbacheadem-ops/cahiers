// ---------------------------------------------------------------------------
// Postpone / advance (pure selection + rewrite). Postponing pushes the cards
// that lose the least (highest retrievability); advancing pulls the ones most
// at risk (lowest retrievability). Memory state is untouched: only `due` moves.
// ---------------------------------------------------------------------------

import type { FSRS } from 'ts-fsrs'
import type { Exercise, FsrsCard } from '../types'
import { retrievability } from './fsrs'

const DAY = 86_400_000

export interface WorkloadPlan {
  changes: { id: string; fsrs: FsrsCard }[]
  /** Mean probability of recall of the affected cards, before and after (at their new due dates). */
  retentionBefore: number
  retentionAfter: number
}

function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
}

/** Cards due now (review state), the ones postponing makes sense for. */
export function postponable(exercises: Exercise[], now = Date.now()): Exercise[] {
  return exercises.filter((e) => e.status === 'active' && e.fsrs.state === 2 && e.fsrs.due <= now)
}

/** Cards not yet due (review state), the ones advancing makes sense for. */
export function advanceable(exercises: Exercise[], now = Date.now()): Exercise[] {
  return exercises.filter((e) => e.status === 'active' && e.fsrs.state === 2 && e.fsrs.due > now)
}

/**
 * Postpones `count` due cards, highest retrievability first. Each card is pushed
 * by max(1 day, 5 % of its interval) — the same rule as the Anki FSRS helper.
 */
export function planPostpone(scheduler: FSRS, exercises: Exercise[], count: number, now = Date.now()): WorkloadPlan {
  const candidates = postponable(exercises, now)
    .map((e) => ({ e, r: retrievability(scheduler, e.fsrs, now) }))
    .sort((a, b) => b.r - a.r)
    .slice(0, Math.max(0, count))
  const changes = candidates.map(({ e }) => {
    const shift = Math.max(1, Math.round(e.fsrs.scheduled_days * 0.05)) * DAY
    return { id: e.id, fsrs: { ...e.fsrs, due: now + shift } }
  })
  const before = candidates.map((c) => c.r)
  const after = changes.map((c) => retrievability(scheduler, c.fsrs, c.fsrs.due))
  return { changes, retentionBefore: mean(before), retentionAfter: mean(after) }
}

/** Advances `count` not-yet-due cards, lowest retrievability first: they become due now. */
export function planAdvance(scheduler: FSRS, exercises: Exercise[], count: number, now = Date.now()): WorkloadPlan {
  const candidates = advanceable(exercises, now)
    .map((e) => ({ e, r: retrievability(scheduler, e.fsrs, now) }))
    .sort((a, b) => a.r - b.r)
    .slice(0, Math.max(0, count))
  const changes = candidates.map(({ e }) => ({ id: e.id, fsrs: { ...e.fsrs, due: now } }))
  // Before = recall expected if they were left until their planned date; after = recall now.
  const before = candidates.map(({ e }) => retrievability(scheduler, e.fsrs, e.fsrs.due))
  const after = candidates.map((c) => c.r)
  return { changes, retentionBefore: mean(before), retentionAfter: mean(after) }
}
