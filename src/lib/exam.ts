// ---------------------------------------------------------------------------
// Exam preparation (pure): successive-relearning plan (Rawson & Dunlosky:
// three spaced sessions reaching one correct recall each), scheduler overrides
// for the exam's fiches (interval cap at half the remaining time, retention
// raised to 0.95 near the exam — the practice recommended by the FSRS authors).
// ---------------------------------------------------------------------------

import type { Exam, ExamSession } from '../types'

const DAY = 86_400_000

export const EXAM_RETENTION = 0.95
export const DEFAULT_BOOST_DAYS = 14

/** Local-time midnight of the day containing `ts`. */
export function dayStart(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Whole days from today to the exam day (0 = today, negative = past). */
export function daysUntil(examDate: number, now = Date.now()): number {
  return Math.round((dayStart(examDate) - dayStart(now)) / DAY)
}

/**
 * Three sessions ending the day before the exam, with gaps that shrink as the
 * exam approaches (Cepeda 2008: the optimal gap is a fraction of the retention
 * interval). For an exam in 21 days: J−12, J−6, J−1. Never before today; days
 * are distinct when the delay allows it.
 */
export function planSessions(examDate: number, now = Date.now()): ExamSession[] {
  const today = dayStart(now)
  const exam = dayStart(examDate)
  const remaining = Math.max(0, Math.round((exam - today) / DAY))
  const s3 = Math.max(today, exam - DAY)
  const s2 = Math.max(today, s3 - Math.max(1, Math.round(remaining * 0.25)) * DAY)
  const s1 = Math.max(today, s2 - Math.max(1, Math.round(remaining * 0.3)) * DAY)
  const days = [...new Set([s1, s2, s3])].sort((a, b) => a - b)
  return days.map((at) => ({ at }))
}

/** Which planned session should be run next (first not done, at or before today first). */
export function nextSession(exam: Exam, now = Date.now()): { index: number; session: ExamSession; late: boolean } | null {
  const today = dayStart(now)
  for (let i = 0; i < exam.sessions.length; i++) {
    const s = exam.sessions[i]
    if (s.done) continue
    return { index: i, session: s, late: s.at < today }
  }
  return null
}

export type ExamPhase = 'upcoming' | 'today' | 'past'

export function examPhase(exam: Exam, now = Date.now()): ExamPhase {
  const d = daysUntil(exam.date, now)
  if (d > 0) return 'upcoming'
  if (d === 0) return 'today'
  return 'past'
}

export interface SchedulerOverride {
  maximumInterval: number
  desiredRetention?: number
}

/**
 * Per-fiche overrides from every upcoming exam: the maximum interval is capped
 * at half the days left (min 1), the retention is raised from `boostFromDays`
 * before the exam. When several exams cover a fiche, the strictest wins.
 */
export function overridesFor(exams: Exam[], globalMaxInterval: number, now = Date.now()): Map<string, SchedulerOverride> {
  const map = new Map<string, SchedulerOverride>()
  for (const exam of exams) {
    if (exam.archived) continue
    const left = daysUntil(exam.date, now)
    if (left < 0) continue
    const cap = Math.max(1, Math.min(globalMaxInterval, Math.floor(left / 2)))
    const boost = left <= exam.boostFromDays
    for (const chapitreId of exam.chapitreIds) {
      const prev = map.get(chapitreId)
      map.set(chapitreId, {
        maximumInterval: Math.min(prev?.maximumInterval ?? Infinity, cap),
        desiredRetention: boost ? EXAM_RETENTION : prev?.desiredRetention,
      })
    }
  }
  return map
}

/** Exams whose day is over and that the user has not archived yet. */
export function finishedExams(exams: Exam[], now = Date.now()): Exam[] {
  return exams.filter((e) => !e.archived && examPhase(e, now) === 'past')
}

const dateFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })

export function formatExamDay(ts: number): string {
  return dateFmt.format(ts)
}

export function formatCountdown(examDate: number, now = Date.now()): string {
  const d = daysUntil(examDate, now)
  if (d < 0) return `il y a ${-d} j`
  if (d === 0) return 'aujourd’hui'
  if (d === 1) return 'demain'
  return `J−${d}`
}
