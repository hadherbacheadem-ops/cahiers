import { describe, expect, it } from 'vitest'
import type { Exercise } from '../types'
import { makeScheduler, newCard } from './fsrs'
import { planAdvance, planPostpone } from './workload'

const DAY = 86_400_000
const T0 = Date.UTC(2026, 0, 5, 9)
const scheduler = makeScheduler({ desiredRetention: 0.9, maximumInterval: 365, fuzz: false })

function reviewCard(id: string, stability: number, dueOffsetDays: number, lastReviewOffsetDays: number): Exercise {
  return {
    id,
    cahierId: 'c',
    chapitreId: 'ch',
    pointId: null,
    type: 'flashcard',
    data: { type: 'flashcard', question: id, answer: 'a' },
    difficulty: 1,
    tags: [],
    status: 'active',
    origin: 'claude',
    fsrs: { ...newCard(T0), state: 2, stability, scheduled_days: Math.round(stability), due: T0 + dueOffsetDays * DAY, last_review: T0 + lastReviewOffsetDays * DAY, reps: 3 },
    createdAt: T0,
    updatedAt: T0,
  }
}

describe('planPostpone', () => {
  it('postpones the due cards with the highest retrievability, by at least one day', () => {
    const exercises = [
      reviewCard('fresh-memory', 30, -1, -2), // reviewed 2 days ago, stable: high R
      reviewCard('fading', 3, -1, -20), // reviewed 20 days ago, unstable: low R
      reviewCard('not-due', 10, 5, -1),
    ]
    const plan = planPostpone(scheduler, exercises, 1, T0)
    expect(plan.changes.map((c) => c.id)).toEqual(['fresh-memory'])
    expect(plan.changes[0].fsrs.due).toBeGreaterThanOrEqual(T0 + DAY)
    expect(plan.changes[0].fsrs.stability).toBe(30) // memory state untouched
    expect(plan.retentionAfter).toBeLessThan(plan.retentionBefore)
    expect(plan.retentionAfter).toBeGreaterThan(0.5)
  })
})

describe('planAdvance', () => {
  it('advances the not-yet-due cards with the lowest retrievability to now', () => {
    const exercises = [
      reviewCard('at-risk', 2, 3, -5), // low stability, long since reviewed
      reviewCard('safe', 60, 3, -1),
      reviewCard('already-due', 5, -1, -6),
    ]
    const plan = planAdvance(scheduler, exercises, 1, T0)
    expect(plan.changes.map((c) => c.id)).toEqual(['at-risk'])
    expect(plan.changes[0].fsrs.due).toBe(T0)
    expect(plan.retentionAfter).toBeGreaterThan(plan.retentionBefore)
  })

  it('returns an empty plan when nothing qualifies', () => {
    expect(planAdvance(scheduler, [], 5, T0).changes).toEqual([])
    expect(planPostpone(scheduler, [], 5, T0).changes).toEqual([])
  })
})
