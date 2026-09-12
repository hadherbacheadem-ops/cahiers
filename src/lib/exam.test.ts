import { describe, expect, it } from 'vitest'
import type { Exam } from '../types'
import { daysUntil, dayStart, examPhase, finishedExams, formatCountdown, nextSession, overridesFor, planSessions } from './exam'

const DAY = 86_400_000
const now = new Date(2026, 8, 12, 10, 30).getTime() // Saturday 12 Sept 2026, 10:30 local
const today = dayStart(now)

function exam(daysAhead: number, extra: Partial<Exam> = {}): Exam {
  return { id: 'x', name: 'DS', date: today + daysAhead * DAY, chapitreIds: ['f1'], boostFromDays: 14, sessions: planSessions(today + daysAhead * DAY, now), createdAt: now, ...extra }
}

describe('planSessions', () => {
  it('plans three sessions at J−12, J−6 and J−1 for an exam in 21 days', () => {
    const s = planSessions(today + 21 * DAY, now)
    expect(s.map((x) => daysUntil(today + 21 * DAY, x.at))).toEqual([12, 6, 1])
  })

  it('keeps sessions on distinct days when the delay is short, never before today', () => {
    expect(planSessions(today + 3 * DAY, now).map((x) => (x.at - today) / DAY)).toEqual([0, 1, 2])
    expect(planSessions(today + 1 * DAY, now).map((x) => (x.at - today) / DAY)).toEqual([0])
    expect(planSessions(today, now).map((x) => (x.at - today) / DAY)).toEqual([0])
  })
})

describe('nextSession and phases', () => {
  it('returns the first undone session and flags it late when its day is past', () => {
    const e = exam(21)
    expect(nextSession(e, now)?.index).toBe(0)
    e.sessions[0].done = now
    expect(nextSession(e, now)?.index).toBe(1)
    expect(nextSession(e, now)?.late).toBe(false)
    expect(nextSession(e, e.sessions[1].at + 2 * DAY)?.late).toBe(true)
    e.sessions[1].done = now
    e.sessions[2].done = now
    expect(nextSession(e, now)).toBeNull()
  })

  it('classifies exams as upcoming / today / past and lists the finished, unarchived ones', () => {
    expect(examPhase(exam(3), now)).toBe('upcoming')
    expect(examPhase(exam(0), now)).toBe('today')
    expect(examPhase(exam(-1), now)).toBe('past')
    expect(finishedExams([exam(-1), exam(-2, { archived: true }), exam(4)], now)).toHaveLength(1)
    expect(formatCountdown(today + 5 * DAY, now)).toBe('J−5')
    expect(formatCountdown(today + DAY, now)).toBe('demain')
  })
})

describe('overridesFor', () => {
  it('caps the interval at half the remaining days and boosts retention inside the window', () => {
    const far = exam(40, { chapitreIds: ['f1'] })
    const near = exam(10, { id: 'y', chapitreIds: ['f2'] })
    const o = overridesFor([far, near], 365, now)
    expect(o.get('f1')).toEqual({ maximumInterval: 20, desiredRetention: undefined, examName: 'DS' })
    expect(o.get('f2')).toEqual({ maximumInterval: 5, desiredRetention: 0.95, examName: 'DS' })
  })

  it('takes the strictest values when exams overlap and ignores past or archived exams', () => {
    const a = exam(30, { chapitreIds: ['f1'] })
    const b = exam(6, { id: 'b', chapitreIds: ['f1'] })
    const past = exam(-3, { id: 'p', chapitreIds: ['f1'] })
    const archived = exam(2, { id: 'z', chapitreIds: ['f3'], archived: true })
    const o = overridesFor([a, b, past, archived], 365, now)
    expect(o.get('f1')).toEqual({ maximumInterval: 3, desiredRetention: 0.95, examName: 'DS' })
    expect(o.has('f3')).toBe(false)
    expect(overridesFor([exam(1)], 365, now).get('f1')?.maximumInterval).toBe(1)
  })
})
