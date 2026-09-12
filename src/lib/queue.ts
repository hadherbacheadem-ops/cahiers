// ---------------------------------------------------------------------------
// Review queue with daily limits (pure). Learning-state cards are always
// served; review-state cards count against `reviewsMaxPerDay`; new cards
// against `newPerDay`. Limits apply per cahier (cahier override, else global).
// ---------------------------------------------------------------------------

import type { Cahier, Exercise, ReviewLog, Settings } from '../types'
import { isFsrsLogEntry } from './fsrs'

export interface DailyLimits {
  newPerDay: number
  reviewsMaxPerDay: number
}

/** Answers already given today, per cahier, split by what the card was before the answer. */
export interface DailyCounts {
  newToday: number
  reviewsToday: number
}

export function limitsFor(cahier: Pick<Cahier, 'limits'> | undefined, settings: Pick<Settings, 'newPerDay' | 'reviewsMaxPerDay'>): DailyLimits {
  return {
    newPerDay: cahier?.limits?.newPerDay ?? settings.newPerDay,
    reviewsMaxPerDay: cahier?.limits?.reviewsMaxPerDay ?? settings.reviewsMaxPerDay,
  }
}

/** Local-time start of the day containing `now`. */
export function startOfDay(now = Date.now()): number {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Counts today's scheduling answers per cahier (new cards introduced, review cards seen). */
export function countToday(logs: Pick<ReviewLog, 'cahierId' | 'ts' | 'affectsScheduling' | 'fsrsLog'>[], now = Date.now()): Map<string, DailyCounts> {
  const since = startOfDay(now)
  const map = new Map<string, DailyCounts>()
  for (const l of logs) {
    if (!l.affectsScheduling || l.ts < since) continue
    const c = map.get(l.cahierId) ?? { newToday: 0, reviewsToday: 0 }
    const prevState = isFsrsLogEntry(l.fsrsLog) ? l.fsrsLog.prev.state : 2
    if (prevState === 0) c.newToday++
    else if (prevState === 2) c.reviewsToday++
    map.set(l.cahierId, c)
  }
  return map
}

export interface QueueInput {
  exercises: Exercise[]
  limitsByCahier: (cahierId: string) => DailyLimits
  countsByCahier: Map<string, DailyCounts>
  now?: number
  /** Optional hard cap on the whole queue (URL `count`). */
  cap?: number
}

/**
 * Builds the review queue: learning cards first (due now, ordered by due),
 * then due review cards (ordered by due), then new cards (creation order),
 * each cahier's review and new counts capped by its remaining daily allowance.
 */
export function buildReviewQueue({ exercises, limitsByCahier, countsByCahier, now = Date.now(), cap }: QueueInput): Exercise[] {
  const active = exercises.filter((e) => e.status === 'active' && e.fsrs.due <= now)
  const learning = active.filter((e) => e.fsrs.state === 1 || e.fsrs.state === 3).sort((a, b) => a.fsrs.due - b.fsrs.due)
  const reviews = active.filter((e) => e.fsrs.state === 2).sort((a, b) => a.fsrs.due - b.fsrs.due)
  const fresh = active.filter((e) => e.fsrs.state === 0).sort((a, b) => a.createdAt - b.createdAt)

  const remaining = new Map<string, { reviews: number; fresh: number }>()
  const allowance = (cahierId: string) => {
    let r = remaining.get(cahierId)
    if (!r) {
      const limits = limitsByCahier(cahierId)
      const counts = countsByCahier.get(cahierId) ?? { newToday: 0, reviewsToday: 0 }
      r = { reviews: Math.max(0, limits.reviewsMaxPerDay - counts.reviewsToday), fresh: Math.max(0, limits.newPerDay - counts.newToday) }
      remaining.set(cahierId, r)
    }
    return r
  }

  const pickedReviews = reviews.filter((e) => {
    const r = allowance(e.cahierId)
    if (r.reviews <= 0) return false
    r.reviews--
    return true
  })
  const pickedFresh = fresh.filter((e) => {
    const r = allowance(e.cahierId)
    if (r.fresh <= 0) return false
    r.fresh--
    return true
  })

  const queue = [...learning, ...pickedReviews, ...pickedFresh]
  return cap ? queue.slice(0, cap) : queue
}

/** Median answer time, used for the "~12 min" estimate. Falls back on 20 s. */
export function medianDurationMs(logs: Pick<ReviewLog, 'durationMs'>[]): number {
  const values = logs.map((l) => l.durationMs).filter((d) => d > 0 && d < 10 * 60_000).sort((a, b) => a - b)
  if (!values.length) return 20_000
  return values[Math.floor(values.length / 2)]
}

export function estimateMinutes(count: number, medianMs: number): number {
  return Math.max(1, Math.round((count * medianMs) / 60_000))
}
