// ---------------------------------------------------------------------------
// Statistics, all derived from the review log and the current exercises
// (pure): true retention, workload forecast, yearly heatmap, hourly accuracy,
// confidence calibration, estimated retention, and the lenient streak.
// ---------------------------------------------------------------------------

import type { FSRS } from 'ts-fsrs'
import type { Confidence, Exercise, ReviewLog } from '../types'
import { isFsrsLogEntry, retrievability } from './fsrs'

const DAY = 86_400_000

/** Local-time midnight of the day containing `ts`. */
export function dayKey(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

type LogLike = Pick<ReviewLog, 'ts' | 'correct' | 'affectsScheduling' | 'fsrsLog' | 'cahierId' | 'confidence' | 'mode'>

/** Scheduled reviews of cards that were already in the review state (no learning, no practice). */
function isTrueReview(l: LogLike): boolean {
  if (!l.affectsScheduling) return false
  if (!isFsrsLogEntry(l.fsrsLog)) return false
  return l.fsrsLog.prev.state === 2
}

export interface RetentionPoint {
  answered: number
  correct: number
  /** 0–1, or null without data. */
  rate: number | null
}

function rate(answered: number, correct: number): RetentionPoint {
  return { answered, correct, rate: answered ? correct / answered : null }
}

/** True retention over a window ending now, overall and per cahier. */
export function trueRetention(logs: LogLike[], windowDays: number, now = Date.now()): { total: RetentionPoint; byCahier: Map<string, RetentionPoint> } {
  const since = now - windowDays * DAY
  let answered = 0
  let correct = 0
  const per = new Map<string, { a: number; c: number }>()
  for (const l of logs) {
    if (l.ts < since || !isTrueReview(l)) continue
    answered++
    if (l.correct) correct++
    const p = per.get(l.cahierId) ?? { a: 0, c: 0 }
    p.a++
    if (l.correct) p.c++
    per.set(l.cahierId, p)
  }
  return { total: rate(answered, correct), byCahier: new Map([...per].map(([k, v]) => [k, rate(v.a, v.c)])) }
}

/** True retention per day for the last `days` days (oldest first). */
export function retentionByDay(logs: LogLike[], days: number, now = Date.now()): { day: number; point: RetentionPoint }[] {
  const today = dayKey(now)
  const buckets = new Map<number, { a: number; c: number }>()
  for (let i = days - 1; i >= 0; i--) buckets.set(today - i * DAY, { a: 0, c: 0 })
  for (const l of logs) {
    if (!isTrueReview(l)) continue
    const b = buckets.get(dayKey(l.ts))
    if (!b) continue
    b.a++
    if (l.correct) b.c++
  }
  return [...buckets].map(([day, v]) => ({ day, point: rate(v.a, v.c) }))
}

/** Due exercises per day for the next `days` days; overdue ones land on day 0. */
export function forecast(exercises: Pick<Exercise, 'status' | 'fsrs'>[], days: number, now = Date.now()): { day: number; count: number }[] {
  const today = dayKey(now)
  const counts = new Array<number>(days).fill(0)
  for (const e of exercises) {
    if (e.status !== 'active') continue
    const idx = Math.floor((dayKey(e.fsrs.due) - today) / DAY)
    if (idx < 0) counts[0]++
    else if (idx < days) counts[idx]++
  }
  return counts.map((count, i) => ({ day: today + i * DAY, count }))
}

/** Answers per day for the last `days` days (every mode), oldest first. */
export function activityByDay(logs: Pick<ReviewLog, 'ts'>[], days: number, now = Date.now()): { day: number; count: number }[] {
  const today = dayKey(now)
  const counts = new Map<number, number>()
  for (let i = days - 1; i >= 0; i--) counts.set(today - i * DAY, 0)
  for (const l of logs) {
    const k = dayKey(l.ts)
    if (counts.has(k)) counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  return [...counts].map(([day, count]) => ({ day, count }))
}

/** Accuracy per hour of the day (0–23), scheduled reviews only. */
export function hourlyAccuracy(logs: LogLike[]): { hour: number; answered: number; rate: number | null }[] {
  const buckets = Array.from({ length: 24 }, () => ({ a: 0, c: 0 }))
  for (const l of logs) {
    if (!l.affectsScheduling) continue
    const b = buckets[new Date(l.ts).getHours()]
    b.a++
    if (l.correct) b.c++
  }
  return buckets.map((b, hour) => ({ hour, answered: b.a, rate: b.a ? b.c / b.a : null }))
}

export interface CalibrationRow {
  confidence: Confidence
  answered: number
  correct: number
  rate: number | null
}

export interface Calibration {
  rows: CalibrationRow[]
  /** Share of "sûr" answers that were wrong (null without data). */
  overconfidence: number | null
  /** True when "sûr" succeeds below 85 %. */
  warn: boolean
}

export const CALIBRATION_WARN_BELOW = 0.85

export function calibration(logs: LogLike[], windowDays = 90, now = Date.now()): Calibration {
  const since = now - windowDays * DAY
  const per = new Map<Confidence, { a: number; c: number }>([
    [1, { a: 0, c: 0 }],
    [2, { a: 0, c: 0 }],
    [3, { a: 0, c: 0 }],
  ])
  for (const l of logs) {
    if (l.ts < since || !l.confidence) continue
    const p = per.get(l.confidence)!
    p.a++
    if (l.correct) p.c++
  }
  const rows: CalibrationRow[] = ([1, 2, 3] as Confidence[]).map((confidence) => {
    const p = per.get(confidence)!
    return { confidence, answered: p.a, correct: p.c, rate: p.a ? p.c / p.a : null }
  })
  const sure = rows[2]
  const overconfidence = sure.answered ? 1 - sure.correct / sure.answered : null
  return { rows, overconfidence, warn: sure.answered >= 10 && (sure.rate ?? 1) < CALIBRATION_WARN_BELOW }
}

/** Mean probability of recall of the active, non-new cards: "knowledge retained". */
export function estimatedRetention(exercises: Pick<Exercise, 'status' | 'fsrs' | 'chapitreId'>[], schedulerFor: (e: Pick<Exercise, 'chapitreId'>) => FSRS, now = Date.now()): { mean: number | null; cards: number } {
  let sum = 0
  let n = 0
  for (const e of exercises) {
    if (e.status !== 'active' || e.fsrs.state === 0) continue
    sum += retrievability(schedulerFor(e), e.fsrs, now)
    n++
  }
  return { mean: n ? sum / n : null, cards: n }
}

export interface StreakInfo {
  /** Consecutive days (ending today or yesterday) that met the minimal goal, freezes included. */
  days: number
  /** Freezes consumed inside the current streak. */
  freezesUsed: number
  /** Freezes still available this calendar month. */
  freezesLeft: number
  /** Answers today and whether the minimal goal is met. */
  today: number
  minimalReached: boolean
}

/**
 * A kind streak: a day counts when at least `minimalGoal` answers were given;
 * up to `freezesPerMonth` missed days per calendar month are frozen instead of
 * breaking the streak. Today never breaks the streak (the day is not over).
 */
export function lenientStreak(logs: Pick<ReviewLog, 'ts'>[], minimalGoal: number, freezesPerMonth = 2, now = Date.now()): StreakInfo {
  const counts = new Map<number, number>()
  for (const l of logs) counts.set(dayKey(l.ts), (counts.get(dayKey(l.ts)) ?? 0) + 1)
  const today = dayKey(now)
  const todayCount = counts.get(today) ?? 0
  const met = (day: number) => (counts.get(day) ?? 0) >= Math.max(1, minimalGoal)

  const freezesByMonth = new Map<string, number>()
  const monthOf = (day: number) => {
    const d = new Date(day)
    return `${d.getFullYear()}-${d.getMonth()}`
  }

  let days = 0
  let freezesUsed = 0
  let day = met(today) ? today : today - DAY
  if (met(today)) {
    days = 1
    day = today - DAY
  }
  // Walk back while days are met or can be frozen.
  for (let guard = 0; guard < 3660; guard++) {
    if (met(day)) {
      days++
      day -= DAY
      continue
    }
    const m = monthOf(day)
    const used = freezesByMonth.get(m) ?? 0
    // No activity ever before: the streak simply ends.
    const anyBefore = [...counts.keys()].some((k) => k <= day)
    if (!anyBefore) break
    if (used < freezesPerMonth) {
      freezesByMonth.set(m, used + 1)
      freezesUsed++
      day -= DAY
      continue
    }
    break
  }
  const thisMonth = monthOf(today)
  const freezesLeft = Math.max(0, freezesPerMonth - (freezesByMonth.get(thisMonth) ?? 0))
  return { days, freezesUsed, freezesLeft, today: todayCount, minimalReached: met(today) }
}
