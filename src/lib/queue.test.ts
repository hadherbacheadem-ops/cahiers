import { describe, expect, it } from 'vitest'
import type { Exercise, FsrsCard } from '../types'
import { buildReviewQueue, countToday, limitsFor, medianDurationMs, startOfDay } from './queue'
import { newCard } from './fsrs'

const T0 = new Date(2026, 0, 5, 9, 0, 0).getTime()
const DAY = 86_400_000

function ex(id: string, cahierId: string, fsrs: Partial<FsrsCard>, createdAt = T0): Exercise {
  return {
    id,
    cahierId,
    chapitreId: 'ch',
    pointId: null,
    type: 'flashcard',
    data: { type: 'flashcard', question: id, answer: 'a' },
    difficulty: 1,
    tags: [],
    status: 'active',
    origin: 'claude',
    fsrs: { ...newCard(createdAt), ...fsrs },
    createdAt,
    updatedAt: createdAt,
  }
}

const review = (id: string, cahier: string, dueOffsetDays: number) => ex(id, cahier, { state: 2, stability: 5, due: T0 + dueOffsetDays * DAY })
const fresh = (id: string, cahier: string, order: number) => ex(id, cahier, { state: 0 }, T0 - 10 * DAY + order)
const learning = (id: string, cahier: string) => ex(id, cahier, { state: 1, due: T0 - 60_000 })

describe('buildReviewQueue', () => {
  const limits = () => ({ newPerDay: 2, reviewsMaxPerDay: 3 })

  it('serves learning cards, then due reviews by due date, then new cards in creation order', () => {
    const exercises = [fresh('n2', 'c', 2), review('r1', 'c', -2), fresh('n1', 'c', 1), learning('l1', 'c'), review('r2', 'c', -5), review('future', 'c', 3)]
    const q = buildReviewQueue({ exercises, limitsByCahier: limits, countsByCahier: new Map(), now: T0 })
    expect(q.map((e) => e.id)).toEqual(['l1', 'r2', 'r1', 'n1', 'n2'])
  })

  it('applies the per-cahier daily limits minus what was already done today', () => {
    const exercises = [review('r1', 'c', -1), review('r2', 'c', -1), review('r3', 'c', -1), review('r4', 'c', -1), fresh('n1', 'c', 1), fresh('n2', 'c', 2), fresh('n3', 'c', 3)]
    const counts = new Map([['c', { newToday: 1, reviewsToday: 1 }]])
    const q = buildReviewQueue({ exercises, limitsByCahier: limits, countsByCahier: counts, now: T0 })
    expect(q.filter((e) => e.fsrs.state === 2)).toHaveLength(2)
    expect(q.filter((e) => e.fsrs.state === 0)).toHaveLength(1)
  })

  it('keeps limits independent between cahiers and honours the cap', () => {
    const exercises = [review('a1', 'A', -1), review('a2', 'A', -1), review('b1', 'B', -1), review('b2', 'B', -1)]
    const q = buildReviewQueue({ exercises, limitsByCahier: () => ({ newPerDay: 0, reviewsMaxPerDay: 1 }), countsByCahier: new Map(), now: T0 })
    expect(q.map((e) => e.cahierId).sort()).toEqual(['A', 'B'])
    expect(buildReviewQueue({ exercises, limitsByCahier: limits, countsByCahier: new Map(), now: T0, cap: 3 })).toHaveLength(3)
  })

  it('never serves pending, suspended or leech exercises', () => {
    const e = review('r', 'c', -1)
    for (const status of ['pending', 'suspended', 'leech'] as const) {
      expect(buildReviewQueue({ exercises: [{ ...e, status }], limitsByCahier: limits, countsByCahier: new Map(), now: T0 })).toHaveLength(0)
    }
  })
})

describe('countToday', () => {
  it('counts new-card introductions and review answers since local midnight, per cahier', () => {
    const logs = [
      { cahierId: 'c', ts: T0, affectsScheduling: true, fsrsLog: { prev: { state: 0 }, next: {}, log: {} } },
      { cahierId: 'c', ts: T0, affectsScheduling: true, fsrsLog: { prev: { state: 2 }, next: {}, log: {} } },
      { cahierId: 'c', ts: T0, affectsScheduling: true, fsrsLog: { prev: { state: 1 }, next: {}, log: {} } }, // learning: counts nowhere
      { cahierId: 'c', ts: T0, affectsScheduling: false, fsrsLog: null }, // practice: ignored
      { cahierId: 'c', ts: startOfDay(T0) - 1, affectsScheduling: true, fsrsLog: { prev: { state: 2 }, next: {}, log: {} } }, // yesterday
      { cahierId: 'd', ts: T0, affectsScheduling: true, fsrsLog: null }, // SM-2-era row: assumed review
    ]
    const counts = countToday(logs, T0)
    expect(counts.get('c')).toEqual({ newToday: 1, reviewsToday: 1 })
    expect(counts.get('d')).toEqual({ newToday: 0, reviewsToday: 1 })
  })
})

describe('helpers', () => {
  it('limitsFor prefers the cahier override', () => {
    const settings = { newPerDay: 20, reviewsMaxPerDay: 200 }
    expect(limitsFor(undefined, settings)).toEqual({ newPerDay: 20, reviewsMaxPerDay: 200 })
    expect(limitsFor({ limits: { newPerDay: 5 } }, settings)).toEqual({ newPerDay: 5, reviewsMaxPerDay: 200 })
  })

  it('medianDurationMs ignores outliers and falls back on 20 s', () => {
    expect(medianDurationMs([])).toBe(20_000)
    expect(medianDurationMs([{ durationMs: 1000 }, { durationMs: 3000 }, { durationMs: 5000 }, { durationMs: 99_999_999 }])).toBe(3000)
  })
})
