import { describe, expect, it } from 'vitest'
import { applyRating, avoidLightDays, estimateReviewsPerDay, formatInterval, fromSm2, makeScheduler, newCard, previewAll, replayHistory, retrievability, rollbackCard, toCard } from './fsrs'
import type { Rating } from '../types'

const DAY = 86_400_000
const T0 = Date.UTC(2026, 0, 5, 9, 0, 0) // Monday
const opts = { desiredRetention: 0.9, maximumInterval: 365, fuzz: false }

/** Applies a sequence of ratings, each exactly at the previous due date. */
function run(ratings: Rating[], retention = 0.9) {
  const scheduler = makeScheduler({ ...opts, desiredRetention: retention })
  let card = newCard(T0)
  let now = T0
  const intervals: number[] = []
  for (const r of ratings) {
    const entry = applyRating(scheduler, card, r, now)
    card = entry.next
    intervals.push(card.due - now)
    now = card.due
  }
  return { card, intervals, scheduler }
}

describe('FSRS scheduling', () => {
  it('grows intervals after successive Good answers', () => {
    const { intervals, card } = run([3, 3, 3, 3, 3])
    // First Good on a new card lands in the learning steps (10 min), then days.
    expect(intervals[0]).toBeLessThan(DAY)
    for (let i = 2; i < intervals.length; i++) expect(intervals[i]).toBeGreaterThan(intervals[i - 1])
    expect(card.state).toBe(2)
    expect(card.reps).toBe(5)
  })

  it('Again lowers stability without resetting the card', () => {
    const { card: before, scheduler } = run([3, 3, 3, 3])
    const entry = applyRating(scheduler, before, 1, before.due)
    expect(entry.next.stability).toBeLessThan(before.stability)
    expect(entry.next.stability).toBeGreaterThan(0)
    expect(entry.next.lapses).toBe(before.lapses + 1)
    expect(entry.next.reps).toBe(before.reps + 1) // reps keep counting, unlike SM-2
    expect(entry.next.state).toBe(3) // relearning
    expect(entry.next.due - before.due).toBeLessThan(DAY)
  })

  it('a higher desired retention yields shorter intervals', () => {
    const strict = run([3, 3, 3, 3, 3], 0.95)
    const loose = run([3, 3, 3, 3, 3], 0.85)
    expect(strict.card.due - T0).toBeLessThan(loose.card.due - T0)
  })

  it('previews the four outcomes in increasing order', () => {
    const { card, scheduler } = run([3, 3, 3])
    const p = previewAll(scheduler, card, card.due)
    expect(p[1].due).toBeLessThan(p[2].due)
    expect(p[2].due).toBeLessThan(p[3].due)
    expect(p[3].due).toBeLessThan(p[4].due)
  })

  it('undo restores the exact previous card', () => {
    const { card, scheduler } = run([3, 3])
    const entry = applyRating(scheduler, card, 4, card.due)
    expect(entry.next).not.toEqual(card)
    expect(rollbackCard(entry)).toEqual(card)
    // ts-fsrs's own rollback agrees with the snapshot on the memory state.
    const lib = scheduler.rollback(toCard(entry.next), { ...entry.log, due: new Date(entry.log.due), review: new Date(entry.log.review) })
    expect(lib.stability).toBeCloseTo(card.stability, 6)
    expect(lib.difficulty).toBeCloseTo(card.difficulty, 6)
    expect(lib.reps).toBe(card.reps)
  })

  it('replaying a history reproduces the state reached by answering live', () => {
    const scheduler = makeScheduler(opts)
    let card = newCard(T0)
    const history: { rating: Rating; ts: number }[] = []
    let now = T0
    for (const r of [3, 3, 2, 3, 1, 3, 3] as Rating[]) {
      history.push({ rating: r, ts: now })
      card = applyRating(scheduler, card, r, now).next
      now = card.due + 3_600_000 // reviewed an hour late every time
    }
    const replayed = replayHistory(history, opts)
    expect(replayed).not.toBeNull()
    expect(replayed!.stability).toBeCloseTo(card.stability, 6)
    expect(replayed!.difficulty).toBeCloseTo(card.difficulty, 6)
    expect(replayed!.reps).toBe(card.reps)
    expect(replayed!.lapses).toBe(card.lapses)
    expect(replayed!.state).toBe(card.state)
    expect(replayed!.due).toBe(card.due)
    expect(replayHistory([], opts)).toBeNull()
  })

  it('retrievability decays with time and is 0 for a new card', () => {
    const { card, scheduler } = run([3, 3, 3])
    expect(retrievability(scheduler, newCard(T0), T0)).toBe(0)
    const r0 = retrievability(scheduler, card, card.last_review!)
    const r1 = retrievability(scheduler, card, card.due)
    const r2 = retrievability(scheduler, card, card.due + 30 * DAY)
    expect(r0).toBeGreaterThan(r1)
    expect(r1).toBeGreaterThan(r2)
    expect(r1).toBeCloseTo(0.9, 1) // due at the desired retention
  })
})

describe('light days', () => {
  it('moves long intervals off light weekdays, never earlier than tomorrow', () => {
    const now = T0
    const dueSunday = now + 6 * DAY // Monday + 6 = Sunday
    expect(new Date(dueSunday).getUTCDay()).toBe(0)
    const shifted = avoidLightDays(dueSunday, now, [new Date(dueSunday).getDay()])
    expect(shifted).not.toBe(dueSunday)
    expect(Math.abs(shifted - dueSunday)).toBeLessThanOrEqual(3 * DAY)
    expect(shifted).toBeGreaterThanOrEqual(now + DAY)
  })

  it('leaves short intervals and non-light days alone', () => {
    const now = T0
    expect(avoidLightDays(now + 10 * 60_000, now, [0, 1, 2, 3, 4, 5])).toBe(now + 10 * 60_000)
    const dueThursday = now + 3 * DAY
    expect(avoidLightDays(dueThursday, now, [new Date(dueThursday + DAY).getDay()])).toBe(dueThursday)
    expect(avoidLightDays(dueThursday, now, [0, 1, 2, 3, 4, 5, 6])).toBe(dueThursday)
  })
})

describe('SM-2 → FSRS conversion', () => {
  it('keeps a never-reviewed card new, with its due date', () => {
    const c = fromSm2({ ease: 2.5, interval: 0, due: T0 + DAY, reps: 0, lapses: 0 }, T0)
    expect(c.state).toBe(0)
    expect(c.due).toBe(T0 + DAY)
  })

  it('maps interval to stability, ease to difficulty, and preserves due', () => {
    const c = fromSm2({ ease: 2.5, interval: 12, due: T0, reps: 4, lapses: 1 }, T0)
    expect(c.state).toBe(2)
    expect(c.stability).toBe(12)
    expect(c.difficulty).toBeCloseTo(5, 5)
    expect(c.due).toBe(T0)
    expect(c.reps).toBe(4)
    expect(c.lapses).toBe(1)
    expect(fromSm2({ ease: 1.3, interval: 1, due: T0, reps: 2, lapses: 3 }, T0).difficulty).toBe(10)
    expect(fromSm2({ ease: 3.7, interval: 1, due: T0, reps: 2, lapses: 0 }, T0).difficulty).toBe(1)
  })

  it('treats a just-failed SM-2 card as relearning', () => {
    const c = fromSm2({ ease: 2.3, interval: 0, due: T0 + 600_000, reps: 0, lapses: 1 }, T0)
    expect(c.state).toBe(3)
    expect(c.due).toBe(T0 + 600_000)
    expect(c.stability).toBeGreaterThan(0)
  })
})

describe('workload estimate and formatting', () => {
  it('estimates more reviews per day at a higher retention', () => {
    const cards = [run([3, 3, 3]).card, run([3, 3, 3, 3]).card, run([3, 2, 3]).card]
    expect(estimateReviewsPerDay(cards, 0.95, 365)).toBeGreaterThan(estimateReviewsPerDay(cards, 0.85, 365))
    expect(estimateReviewsPerDay([newCard(T0)], 0.9, 365)).toBe(0)
  })

  it('formats intervals compactly', () => {
    expect(formatInterval(10 * 60_000)).toBe('10 min')
    expect(formatInterval(5 * 3_600_000)).toBe('5 h')
    expect(formatInterval(3 * DAY)).toBe('3 j')
    expect(formatInterval(75 * DAY)).toBe('2,5 mois')
    expect(formatInterval(400 * DAY)).toBe('1,1 an')
    expect(formatInterval(800 * DAY)).toBe('2,2 ans')
  })
})
