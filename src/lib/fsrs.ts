// ---------------------------------------------------------------------------
// FSRS scheduling (ts-fsrs, FSRS-6 default parameters). This module is the
// only place that talks to ts-fsrs: it converts between the library's Card
// (Date fields) and our serialisable FsrsCard (epoch ms), applies the
// "light days" shift, and offers the SM-2 → FSRS conversion used by the
// migration. Pure functions, no database access.
// ---------------------------------------------------------------------------

import { createEmptyCard, fsrs, type Card, type FSRS, type Grade as FsrsGrade, type ReviewLog as FsrsReviewLog } from 'ts-fsrs'
import type { FsrsCard, FsrsStateValue, LegacySrsState, Rating } from '../types'

const DAY = 86_400_000
const MINUTE = 60_000

export const RETENTION_MIN = 0.8
export const RETENTION_MAX = 0.95

export interface SchedulerOptions {
  desiredRetention: number
  maximumInterval: number
  /** Deterministic intervals (tests, replay). Real sessions keep fuzz on for load balancing. */
  fuzz?: boolean
}

export function makeScheduler(o: SchedulerOptions): FSRS {
  return fsrs({
    request_retention: clampRetention(o.desiredRetention),
    maximum_interval: Math.max(1, Math.round(o.maximumInterval)),
    enable_fuzz: o.fuzz ?? true,
    enable_short_term: true,
    learning_steps: ['1m', '10m'],
    relearning_steps: ['10m'],
  })
}

export function clampRetention(r: number): number {
  if (!Number.isFinite(r)) return 0.9
  return Math.min(RETENTION_MAX, Math.max(RETENTION_MIN, r))
}

// ---- Card conversion -------------------------------------------------------

export function toCard(c: FsrsCard): Card {
  return {
    due: new Date(c.due),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    last_review: c.last_review === undefined ? undefined : new Date(c.last_review),
  }
}

export function fromCard(card: Card): FsrsCard {
  const c: FsrsCard = {
    due: card.due.getTime(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state as FsrsStateValue,
  }
  if (card.last_review) c.last_review = card.last_review.getTime()
  return c
}

export function newCard(now = Date.now()): FsrsCard {
  return fromCard(createEmptyCard(new Date(now)))
}

// ---- Review log entry stored in ReviewLog.fsrsLog -------------------------

/** ts-fsrs ReviewLog with dates as epoch ms. */
export interface SerializedFsrsLog {
  rating: number
  state: FsrsStateValue
  due: number
  stability: number
  difficulty: number
  elapsed_days: number
  last_elapsed_days: number
  scheduled_days: number
  learning_steps: number
  review: number
}

export interface FsrsLogEntry {
  /** Card exactly as it was before the answer: undo restores it verbatim. */
  prev: FsrsCard
  next: FsrsCard
  log: SerializedFsrsLog
}

function serializeLog(log: FsrsReviewLog): SerializedFsrsLog {
  return {
    rating: log.rating,
    state: log.state as FsrsStateValue,
    due: log.due.getTime(),
    stability: log.stability,
    difficulty: log.difficulty,
    elapsed_days: log.elapsed_days,
    last_elapsed_days: log.last_elapsed_days,
    scheduled_days: log.scheduled_days,
    learning_steps: log.learning_steps,
    review: log.review.getTime(),
  }
}

export function isFsrsLogEntry(v: unknown): v is FsrsLogEntry {
  return !!v && typeof v === 'object' && 'prev' in v && 'next' in v && 'log' in v
}

// ---- Scheduling ------------------------------------------------------------

/**
 * Applies a rating. `lightDays` (0 = Sunday … 6) nudges long intervals off the
 * chosen weekdays without touching the memory state (stability, difficulty).
 */
export function applyRating(scheduler: FSRS, card: FsrsCard, rating: Rating, now = Date.now(), lightDays: number[] = []): FsrsLogEntry {
  const res = scheduler.next(toCard(card), new Date(now), rating as FsrsGrade)
  const next = fromCard(res.card)
  next.due = avoidLightDays(next.due, now, lightDays)
  return { prev: card, next, log: serializeLog(res.log) }
}

/** The four possible outcomes, for interval labels on the buttons. */
export function previewAll(scheduler: FSRS, card: FsrsCard, now = Date.now(), lightDays: number[] = []): Record<Rating, FsrsCard> {
  const preview = scheduler.repeat(toCard(card), new Date(now))
  const out = {} as Record<Rating, FsrsCard>
  for (const r of [1, 2, 3, 4] as Rating[]) {
    const c = fromCard(preview[r as FsrsGrade].card)
    c.due = avoidLightDays(c.due, now, lightDays)
    out[r] = c
  }
  return out
}

/** Probability of recall right now, 0–1. New cards return 0. */
export function retrievability(scheduler: FSRS, card: FsrsCard, now = Date.now()): number {
  if (card.state === 0) return 0
  const r = scheduler.get_retrievability(toCard(card), new Date(now), false)
  return Number.isFinite(r) ? r : 0
}

/** Undo: the stored snapshot is exact, no need to recompute anything. */
export function rollbackCard(entry: FsrsLogEntry): FsrsCard {
  return entry.prev
}

/**
 * Moves a due date off light weekdays. Only intervals of three days or more are
 * shifted (a card due in ten minutes must stay due in ten minutes), and the
 * shift never brings the card earlier than tomorrow.
 */
export function avoidLightDays(due: number, now: number, lightDays: number[]): number {
  if (!lightDays.length || lightDays.length >= 7) return due
  if (due - now < 3 * DAY) return due
  if (!lightDays.includes(new Date(due).getDay())) return due
  // Prefer a day earlier (retention loses less), then later, widening.
  for (const delta of [-1, 1, -2, 2, -3, 3]) {
    const candidate = due + delta * DAY
    if (candidate < now + DAY) continue
    if (!lightDays.includes(new Date(candidate).getDay())) return candidate
  }
  return due
}

// ---- Migration from SM-2 ---------------------------------------------------

/**
 * Approximate conversion when no review history exists.
 *   stability  ≈ the SM-2 interval in days (floor 0.1 d)
 *   difficulty ≈ 5 + (2.5 − ease) × 4.17, clamped to 1–10  (ease 2.5 → 5, ease 1.3 → 10)
 * The SM-2 due date is kept as is: nothing becomes due or postponed by the switch.
 */
export function fromSm2(srs: LegacySrsState, now = Date.now()): FsrsCard {
  const isNew = srs.reps === 0 && srs.lapses === 0
  if (isNew) {
    const c = newCard(Math.min(srs.due, now))
    c.due = srs.due
    return c
  }
  const interval = Math.max(0.1, srs.interval || 0)
  const relearning = srs.reps === 0 && srs.lapses > 0
  const card: FsrsCard = {
    due: srs.due,
    stability: interval,
    difficulty: Math.min(10, Math.max(1, 5 + (2.5 - (srs.ease || 2.5)) * 4.17)),
    elapsed_days: 0,
    scheduled_days: Math.round(interval),
    learning_steps: 0,
    reps: srs.reps,
    lapses: srs.lapses,
    state: relearning ? 3 : 2,
    last_review: Math.max(0, srs.due - interval * DAY),
  }
  return card
}

export interface HistoryItem {
  rating: Rating
  ts: number
}

/**
 * Rebuilds the FSRS state by replaying every scheduling answer in order
 * (same computation as ts-fsrs `reschedule`, without fuzz so it is reproducible).
 * Returns null when there is nothing to replay.
 */
export function replayHistory(history: HistoryItem[], options: SchedulerOptions): FsrsCard | null {
  const items = [...history].filter((h) => h.rating >= 1 && h.rating <= 4).sort((a, b) => a.ts - b.ts)
  if (!items.length) return null
  const scheduler = makeScheduler({ ...options, fuzz: false })
  let card = createEmptyCard(new Date(items[0].ts))
  for (const h of items) card = scheduler.next(card, new Date(h.ts), h.rating as FsrsGrade).card
  return fromCard(card)
}

// ---- Workload estimate -------------------------------------------------------

/**
 * Expected reviews per day for a set of cards at a given retention: each card
 * in the review state contributes 1 / (its next interval at that retention).
 */
export function estimateReviewsPerDay(cards: FsrsCard[], desiredRetention: number, maximumInterval: number): number {
  const scheduler = makeScheduler({ desiredRetention, maximumInterval, fuzz: false })
  let perDay = 0
  for (const c of cards) {
    if (c.state === 0) continue
    const interval = Math.max(1, scheduler.next_interval(Math.max(0.1, c.stability), 0))
    perDay += 1 / interval
  }
  return perDay
}

// ---- Formatting ------------------------------------------------------------

/** Compact interval label for a button: "10 min", "1 j", "12 j", "2,5 mois", "1,3 an". */
export function formatInterval(ms: number): string {
  if (ms < MINUTE) return '<1 min'
  const minutes = Math.round(ms / MINUTE)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.round(ms / 3_600_000)
  if (hours < 24) return `${hours} h`
  const days = ms / DAY
  if (days < 30) return `${Math.round(days)} j`
  if (days < 365) return `${(days / 30).toFixed(1).replace('.0', '').replace('.', ',')} mois`
  return `${(days / 365).toFixed(1).replace('.0', '').replace('.', ',')} an${days >= 730 ? 's' : ''}`
}
