import { describe, expect, it } from 'vitest'
import type { ReviewLog } from '../types'
import { calibration, dayKey, forecast, hourlyAccuracy, lenientStreak, retentionByDay, trueRetention } from './stats'

const DAY = 86_400_000
const now = new Date(2026, 8, 12, 15, 0).getTime()
const today = dayKey(now)

function log(daysAgo: number, correct: boolean, opts: Partial<ReviewLog> & { prevState?: 0 | 1 | 2 | 3 } = {}): ReviewLog {
  const { prevState = 2, ...rest } = opts
  return {
    id: Math.random().toString(36),
    exerciseId: 'e',
    chapitreId: 'ch',
    cahierId: 'c',
    ts: today - daysAgo * DAY + 10 * 3_600_000,
    rating: correct ? 3 : 1,
    correct,
    durationMs: 1000,
    mode: 'review',
    affectsScheduling: true,
    fsrsLog: { prev: { state: prevState }, next: {}, log: {} },
    ...rest,
  }
}

describe('trueRetention', () => {
  it('counts only scheduled reviews of cards already in the review state, inside the window', () => {
    const logs = [
      log(1, true),
      log(2, false),
      log(3, true, { prevState: 0 }), // new card introduction: excluded
      log(4, true, { prevState: 1 }), // learning step: excluded
      log(5, true, { mode: 'practice', affectsScheduling: false }), // practice: excluded
      log(40, false), // outside a 30-day window
    ]
    const r = trueRetention(logs, 30, now)
    expect(r.total).toEqual({ answered: 2, correct: 1, rate: 0.5 })
    expect(r.byCahier.get('c')?.answered).toBe(2)
    expect(trueRetention(logs, 90, now).total.answered).toBe(3)
    expect(trueRetention([], 30, now).total.rate).toBeNull()
  })

  it('buckets retention by day, oldest first, with empty days present', () => {
    const series = retentionByDay([log(0, true), log(0, false), log(2, true)], 3, now)
    expect(series.map((s) => s.point.answered)).toEqual([1, 0, 2])
    expect(series[2].point.rate).toBe(0.5)
    expect(series[1].point.rate).toBeNull()
  })
})

describe('forecast', () => {
  it('piles overdue cards on day 0 and ignores inactive cards', () => {
    const ex = (dueOffsetDays: number, status: 'active' | 'suspended' = 'active') => ({ status, fsrs: { due: today + dueOffsetDays * DAY + 3600_000 } }) as never
    const f = forecast([ex(-3), ex(0), ex(1), ex(1), ex(45), ex(2, 'suspended')], 7, now)
    expect(f.map((d) => d.count)).toEqual([2, 2, 0, 0, 0, 0, 0])
    expect(f[0].day).toBe(today)
  })
})

describe('hourlyAccuracy and calibration', () => {
  it('groups scheduled answers by hour', () => {
    const h = hourlyAccuracy([log(0, true), log(0, false), log(1, true, { affectsScheduling: false })])
    expect(h[10]).toEqual({ hour: 10, answered: 2, rate: 0.5 })
    expect(h[11].answered).toBe(0)
  })

  it('computes accuracy per confidence level and flags overconfidence', () => {
    const logs = [
      ...Array.from({ length: 8 }, () => log(1, true, { confidence: 3 })),
      ...Array.from({ length: 4 }, () => log(1, false, { confidence: 3 })),
      log(1, false, { confidence: 1 }),
      log(1, true, { confidence: 2 }),
    ]
    const c = calibration(logs, 90, now)
    expect(c.rows[2]).toEqual({ confidence: 3, answered: 12, correct: 8, rate: 8 / 12 })
    expect(c.overconfidence).toBeCloseTo(1 / 3, 5)
    expect(c.warn).toBe(true)
    expect(calibration(logs.slice(0, 5), 90, now).warn).toBe(false) // fewer than 10 "sûr": no verdict yet
  })
})

describe('lenientStreak', () => {
  const day = (daysAgo: number, n: number) => Array.from({ length: n }, () => ({ ts: today - daysAgo * DAY + 3600_000 }))

  it('counts consecutive days meeting the minimal goal; today does not break it', () => {
    const logs = [...day(1, 10), ...day(2, 12), ...day(3, 10)]
    const s = lenientStreak(logs, 10, 2, now)
    expect(s.days).toBe(3)
    expect(s.today).toBe(0)
    expect(s.minimalReached).toBe(false)
    expect(s.freezesUsed).toBe(0)
  })

  it('freezes up to two missed days per month instead of breaking', () => {
    const logs = [...day(0, 10), ...day(1, 10), ...day(3, 10), ...day(5, 10), ...day(6, 10)] // days 2 and 4 missed
    const s = lenientStreak(logs, 10, 2, now)
    expect(s.days).toBe(5)
    expect(s.freezesUsed).toBe(2)
    expect(s.minimalReached).toBe(true)
  })

  it('breaks once the freezes of the month are spent, and a day under the minimal goal does not count', () => {
    const logs = [...day(0, 10), ...day(1, 3), ...day(2, 10), ...day(4, 10), ...day(6, 10), ...day(7, 10)]
    // day 1 (3 answers) frozen, day 3 frozen, day 5 breaks.
    const s = lenientStreak(logs, 10, 2, now)
    expect(s.days).toBe(3) // days 0, 2, 4
    expect(s.freezesUsed).toBe(2)
  })

  it('returns zero with no history', () => {
    expect(lenientStreak([], 10, 2, now).days).toBe(0)
  })
})
