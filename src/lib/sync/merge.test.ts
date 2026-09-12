import { describe, expect, it } from 'vitest'
import type { Cahier, Exercise, ReviewLog } from '../../types'
import { newCard, makeScheduler, applyRating } from '../fsrs'
import { changesSince, emptyState, mergeStates, purgeTombstones, type SyncState, type Tombstone } from './merge'

const DAY = 86_400_000
const T0 = Date.UTC(2026, 8, 1, 10, 0, 0)
const opts = { scheduler: { desiredRetention: 0.9, maximumInterval: 365 } }

function cahier(id: string, updatedAt: number, name = id, deviceId = 'pc'): Cahier {
  return { id, name, color: '#000', createdAt: T0, updatedAt, deviceId } as Cahier
}

function exercise(id: string, updatedAt: number, fsrs = newCard(T0), extra: Partial<Exercise> = {}): Exercise {
  return { id, chapitreId: 'ch', cahierId: 'c', pointId: null, type: 'flashcard', data: { type: 'flashcard', question: 'q', answer: 'a' }, difficulty: 1, tags: [], status: 'active', origin: 'claude', fsrs, createdAt: T0, updatedAt, ...extra }
}

function log(id: string, exerciseId: string, ts: number, rating: 1 | 2 | 3 | 4 = 3): ReviewLog {
  return { id, exerciseId, chapitreId: 'ch', cahierId: 'c', ts, rating, correct: rating > 1, durationMs: 1000, mode: 'review', fsrsLog: null, affectsScheduling: true }
}

function tomb(table: Tombstone['table'], id: string, deletedAt: number, deviceId = 'phone'): Tombstone {
  return { table, id, deletedAt, deviceId }
}

function state(p: Partial<SyncState>): SyncState {
  return { ...emptyState(), ...p }
}

/** Applies ratings on a card at the given times with the real scheduler (fuzz off). */
function reviewed(ratings: [number, 1 | 2 | 3 | 4][]) {
  const s = makeScheduler({ ...opts.scheduler, fuzz: false })
  let card = newCard(T0 - DAY)
  for (const [ts, r] of ratings) card = applyRating(s, card, r, ts).next
  return card
}

const canon = (s: SyncState) => JSON.stringify(s)

describe('reviewLogs', () => {
  it('unions the journals by id, never duplicates, keeps order by ts', () => {
    const a = state({ reviewLogs: [log('l1', 'e', T0), log('l2', 'e', T0 + 1)] })
    const b = state({ reviewLogs: [log('l2', 'e', T0 + 1), log('l3', 'e', T0 + 2)] })
    const { state: m, summary } = mergeStates(a, b, opts)
    expect(m.reviewLogs.map((l) => l.id)).toEqual(['l1', 'l2', 'l3'])
    expect(summary.added.reviewLogs).toBe(1)
  })
})

describe('other tables: last write wins', () => {
  it('keeps the newest updatedAt on both sides', () => {
    const a = state({ cahiers: [cahier('c', T0 + 5, 'Physique (PC)')] })
    const b = state({ cahiers: [cahier('c', T0 + 1, 'Physique')] })
    expect(mergeStates(a, b, opts).state.cahiers[0].name).toBe('Physique (PC)')
    expect(mergeStates(b, a, opts).state.cahiers[0].name).toBe('Physique (PC)')
  })

  it('adds what only one side has', () => {
    const a = state({ cahiers: [cahier('a', T0)] })
    const b = state({ cahiers: [cahier('b', T0)] })
    const { state: m, summary } = mergeStates(a, b, opts)
    expect(m.cahiers.map((c) => c.id)).toEqual(['a', 'b'])
    expect(summary.added.cahiers).toBe(1)
  })

  it('breaks an exact tie deterministically and symmetrically', () => {
    const a = state({ cahiers: [cahier('c', T0, 'A')] })
    const b = state({ cahiers: [cahier('c', T0, 'B')] })
    const ab = mergeStates(a, b, opts).state.cahiers[0].name
    const ba = mergeStates(b, a, opts).state.cahiers[0].name
    expect(ab).toBe(ba)
  })
})

describe('deletions', () => {
  it('a tombstone newer than the record deletes it (record on the other side)', () => {
    const a = state({ cahiers: [cahier('c', T0)] })
    const b = state({ tombstones: [tomb('cahiers', 'c', T0 + 10)] })
    const { state: m, summary } = mergeStates(a, b, opts)
    expect(m.cahiers).toEqual([])
    expect(m.tombstones).toHaveLength(1)
    expect(summary.deleted.cahiers).toBe(1)
  })

  it('a tombstone newer than the record deletes it (tombstone first, record second)', () => {
    const a = state({ tombstones: [tomb('cahiers', 'c', T0 + 10)] })
    const b = state({ cahiers: [cahier('c', T0)] })
    expect(mergeStates(a, b, opts).state.cahiers).toEqual([])
  })

  it('a modification newer than the tombstone resurrects the record and drops the tombstone', () => {
    const a = state({ cahiers: [cahier('c', T0 + 20, 'revenu')] })
    const b = state({ tombstones: [tomb('cahiers', 'c', T0 + 10)] })
    const { state: m, summary } = mergeStates(b, a, opts)
    expect(m.cahiers.map((c) => c.name)).toEqual(['revenu'])
    expect(m.tombstones).toEqual([])
    expect(summary.resurrected.cahiers).toBe(1)
  })

  it('deleted on one side, untouched on the other: deleted (same timestamp counts as deleted)', () => {
    const a = state({ cahiers: [cahier('c', T0)] })
    const b = state({ tombstones: [tomb('cahiers', 'c', T0)] })
    expect(mergeStates(a, b, opts).state.cahiers).toEqual([])
  })

  it('keeps the latest tombstone when both sides deleted', () => {
    const a = state({ tombstones: [tomb('exercises', 'e', T0 + 1, 'pc')] })
    const b = state({ tombstones: [tomb('exercises', 'e', T0 + 5, 'phone')] })
    const m = mergeStates(a, b, opts).state
    expect(m.tombstones).toHaveLength(1)
    expect(m.tombstones[0].deviceId).toBe('phone')
  })
})

describe('exercises: content and FSRS state', () => {
  it('takes the content from the newest updatedAt and the FSRS state from the newest last_review', () => {
    const oldCard = reviewed([[T0, 3]])
    const newCardState = reviewed([[T0, 3], [T0 + 3 * DAY, 3]])
    const a = state({ exercises: [exercise('e', T0 + 9 * DAY, oldCard, { tags: ['pc'] })] })
    const b = state({ exercises: [exercise('e', T0 + DAY, newCardState, { tags: ['phone'] })], reviewLogs: [log('l2', 'e', T0 + 3 * DAY)] })
    const m = mergeStates(a, b, opts).state
    expect(m.exercises[0].tags).toEqual(['pc'])
    expect(m.exercises[0].fsrs.reps).toBe(2)
    expect(m.exercises[0].fsrs.last_review).toBe(newCardState.last_review)
  })

  it('replays the union of the journals when both devices reviewed since the common base', () => {
    const base = log('l0', 'e', T0)
    const pcCard = reviewed([[T0, 3], [T0 + 2 * DAY, 3]])
    const phoneCard = reviewed([[T0, 3], [T0 + 3 * DAY, 1]])
    const a = state({ exercises: [exercise('e', T0, pcCard)], reviewLogs: [base, log('lpc', 'e', T0 + 2 * DAY, 3)] })
    const b = state({ exercises: [exercise('e', T0, phoneCard)], reviewLogs: [base, log('lph', 'e', T0 + 3 * DAY, 1)] })
    const { state: m, summary } = mergeStates(a, b, opts)
    expect(summary.replayed).toBe(1)
    const expected = reviewed([[T0, 3], [T0 + 2 * DAY, 3], [T0 + 3 * DAY, 1]])
    expect(m.exercises[0].fsrs).toEqual(expected)
    expect(m.exercises[0].fsrs.lapses).toBe(1)
    expect(m.exercises[0].fsrs.reps).toBe(3)
  })

  it('does not replay when only one side reviewed since the base', () => {
    const base = log('l0', 'e', T0)
    const a = state({ exercises: [exercise('e', T0, reviewed([[T0, 3]]))], reviewLogs: [base] })
    const b = state({ exercises: [exercise('e', T0, reviewed([[T0, 3], [T0 + 2 * DAY, 4]]))], reviewLogs: [base, log('lph', 'e', T0 + 2 * DAY, 4)] })
    const { state: m, summary } = mergeStates(a, b, opts)
    expect(summary.replayed).toBe(0)
    expect(m.exercises[0].fsrs.reps).toBe(2)
  })

  it('unions the hypercorrection dates', () => {
    const a = state({ exercises: [exercise('e', T0, newCard(T0), { forcedDue: [T0 + DAY] })] })
    const b = state({ exercises: [exercise('e', T0, newCard(T0), { forcedDue: [T0 + 7 * DAY] })] })
    expect(mergeStates(a, b, opts).state.exercises[0].forcedDue).toEqual([T0 + DAY, T0 + 7 * DAY])
  })

  it('an exercise deleted on the phone after the PC edited it stays deleted and takes its journal with it', () => {
    const a = state({ exercises: [exercise('e', T0 + 1)], reviewLogs: [log('l1', 'e', T0), log('l2', 'other', T0)] })
    const b = state({ tombstones: [tomb('exercises', 'e', T0 + 5)] })
    const m = mergeStates(a, b, opts).state
    expect(m.exercises).toEqual([])
    expect(m.reviewLogs.map((l) => l.id)).toEqual(['l2'])
  })
})

describe('settings', () => {
  it('merges per key, newest stamp wins', () => {
    const a = state({ settings: { desiredRetention: 0.85, newPerDay: 20 }, settingsStamps: { desiredRetention: T0 + 5, newPerDay: T0 } })
    const b = state({ settings: { desiredRetention: 0.9, newPerDay: 30 }, settingsStamps: { desiredRetention: T0, newPerDay: T0 + 5 } })
    const { state: m, summary } = mergeStates(a, b, opts)
    expect(m.settings).toEqual({ desiredRetention: 0.85, newPerDay: 30 })
    expect(m.settingsStamps).toEqual({ desiredRetention: T0 + 5, newPerDay: T0 + 5 })
    expect(summary.settingsChanged).toEqual(['newPerDay'])
  })

  it('never merges the device settings', () => {
    const a = state({ settings: { background: 'full', theme: 'dark' }, settingsStamps: { background: T0, theme: T0 } })
    const b = state({ settings: { background: 'off', theme: 'light', motionParallax: true }, settingsStamps: { background: T0 + 9, theme: T0 + 9, motionParallax: T0 + 9 } })
    const m = mergeStates(a, b, opts).state
    expect(m.settings).toEqual({ theme: 'light' })
  })
})

describe('algebraic properties', () => {
  const rich = (seed: number): SyncState =>
    state({
      cahiers: [cahier('c1', T0 + seed, `n${seed}`), cahier('c2', T0 + 2 * seed)],
      exercises: [exercise('e1', T0 + seed, reviewed([[T0 + seed, 3]])), exercise('e2', T0, newCard(T0))],
      reviewLogs: [log(`l${seed}`, 'e1', T0 + seed), log('shared', 'e1', T0)],
      tombstones: seed % 2 ? [tomb('exercises', 'e3', T0 + seed)] : [],
      settings: { desiredRetention: 0.8 + seed / 100 },
      settingsStamps: { desiredRetention: T0 + seed },
    })

  it('is idempotent: merging a state with itself changes nothing', () => {
    const a = rich(1)
    const { state: m, summary } = mergeStates(a, a, opts)
    expect(canon(m)).toBe(canon(state({ ...a, reviewLogs: [...a.reviewLogs].sort((x, y) => x.ts - y.ts) })))
    expect(summary.added.cahiers + summary.updated.cahiers + summary.deleted.cahiers).toBe(0)
  })

  it('merging twice equals merging once', () => {
    const a = rich(1)
    const b = rich(2)
    const once = mergeStates(a, b, opts).state
    const twice = mergeStates(once, b, opts).state
    expect(canon(twice)).toBe(canon(once))
  })

  it('is commutative: A ⊕ B = B ⊕ A', () => {
    const a = rich(1)
    const b = rich(2)
    expect(canon(mergeStates(a, b, opts).state)).toBe(canon(mergeStates(b, a, opts).state))
  })

  it('is associative over three devices: (A ⊕ B) ⊕ C = A ⊕ (B ⊕ C)', () => {
    const a = rich(1)
    const b = rich(2)
    const c = rich(3)
    const left = mergeStates(mergeStates(a, b, opts).state, c, opts).state
    const right = mergeStates(a, mergeStates(b, c, opts).state, opts).state
    expect(canon(left)).toBe(canon(right))
  })
})

describe('tombstones and change lots', () => {
  it('purges tombstones older than 90 days', () => {
    const now = T0 + 100 * DAY
    const list = [tomb('cahiers', 'old', T0), tomb('cahiers', 'recent', now - 10 * DAY)]
    expect(purgeTombstones(list, now).map((t) => t.id)).toEqual(['recent'])
  })

  it('changesSince keeps only what moved after the mark', () => {
    const s = state({
      cahiers: [cahier('old', T0), cahier('new', T0 + 10)],
      reviewLogs: [log('l1', 'e', T0), log('l2', 'e', T0 + 10)],
      tombstones: [tomb('exercises', 'x', T0 + 10)],
      settings: { newPerDay: 5, theme: 'dark' },
      settingsStamps: { newPerDay: T0 + 10, theme: T0 },
    })
    const d = changesSince(s, T0 + 5)
    expect(d.cahiers.map((c) => c.id)).toEqual(['new'])
    expect(d.reviewLogs.map((l) => l.id)).toEqual(['l2'])
    expect(d.tombstones).toHaveLength(1)
    expect(d.settings).toEqual({ newPerDay: 5 })
  })
})
