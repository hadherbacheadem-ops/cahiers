import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db, addExercises, createCahier, createChapitre, updateSettings } from '../db'
import { buildQueue, loadSessionContext, persistAnswer, undoAnswer } from './session'
import { hasAdjacentSiblings } from './interleave'
import type { Exercise } from '../types'

const DAY = 86_400_000

async function reset() {
  await Promise.all([db.cahiers.clear(), db.chapitres.clear(), db.exercises.clear(), db.reviewLogs.clear(), db.points.clear(), db.settings.clear()])
}

beforeEach(reset)
afterEach(reset)

/** A review-state card that is due now, with the given lapses. */
async function reviewCard(chapitreId: string, cahierId: string, pointId: string | null, lapses: number, now: number): Promise<Exercise> {
  const [e] = await addExercises(chapitreId, cahierId, [{ data: { type: 'flashcard', question: `q-${Math.random()}`, answer: 'a' }, difficulty: 1, tags: [], pointId }])
  const fsrs = { ...e.fsrs, state: 2 as const, stability: 3, difficulty: 6, reps: 10, lapses, due: now - DAY, last_review: now - 4 * DAY, scheduled_days: 3 }
  await db.exercises.update(e.id, { fsrs })
  return (await db.exercises.get(e.id))!
}

describe('persistAnswer', () => {
  it('turns the exercise into a leech on the failure that reaches the threshold', async () => {
    await updateSettings({ leechThreshold: 8, burySiblings: false })
    const cahier = await createCahier('Physique', '#000')
    const fiche = await createChapitre({ cahierId: cahier.id, title: 'F', content: 'x', source: 'paste' })
    const now = Date.now()
    const almost = await reviewCard(fiche.id, cahier.id, null, 7, now)
    const ctx = await loadSessionContext(now)

    const ok = await persistAnswer(almost, 'good', true, 'review', 1000, ctx, now)
    expect(ok.becameLeech).toBe(false)

    const fresh = (await db.exercises.get(almost.id))!
    const again = await persistAnswer({ ...fresh, fsrs: { ...fresh.fsrs, due: now, state: 2 } }, 'again', false, 'review', 1000, ctx, now + 60_000)
    expect(again.card?.lapses).toBe(8)
    expect(again.becameLeech).toBe(true)
    expect((await db.exercises.get(almost.id))?.status).toBe('leech')
  })

  it('buries the due siblings of an answered exercise to tomorrow, learning cards excepted', async () => {
    await updateSettings({ burySiblings: true })
    const cahier = await createCahier('Physique', '#000')
    const fiche = await createChapitre({ cahierId: cahier.id, title: 'F', content: 'x', source: 'paste' })
    const now = Date.now()
    const a = await reviewCard(fiche.id, cahier.id, 'p1', 0, now)
    const b = await reviewCard(fiche.id, cahier.id, 'p1', 0, now)
    const other = await reviewCard(fiche.id, cahier.id, 'p2', 0, now)
    const ctx = await loadSessionContext(now)

    const res = await persistAnswer(a, 'good', true, 'review', 500, ctx, now)
    expect(res.buriedIds).toEqual([b.id])
    const buried = (await db.exercises.get(b.id))!
    expect(buried.fsrs.due).toBeGreaterThan(now)
    expect(new Date(buried.fsrs.due).getHours()).toBe(0)
    expect((await db.exercises.get(other.id))!.fsrs.due).toBe(other.fsrs.due)

    // Practice answers never bury nor schedule.
    const res2 = await persistAnswer(other, 'good', true, 'practice', 500, ctx, now)
    expect(res2.buriedIds).toEqual([])
    expect(res2.card).toBeNull()
  })

  it('re-prioritises the exercises of the notions missed in a free recall and undo restores the card', async () => {
    await updateSettings({ burySiblings: false })
    const cahier = await createCahier('Physique', '#000')
    const fiche = await createChapitre({ cahierId: cahier.id, title: 'F', content: 'x', source: 'paste' })
    const now = Date.now()
    const linked = await reviewCard(fiche.id, cahier.id, 'p1', 0, now)
    await db.exercises.update(linked.id, { fsrs: { ...linked.fsrs, due: now + 5 * DAY } })
    const [recall] = await addExercises(fiche.id, cahier.id, [{ data: { type: 'rappel_libre', topic: 'F', checklist: [{ text: 'a', pointId: 'p1' }, { text: 'b', pointId: null }] }, difficulty: 2, tags: [] }])
    const ctx = await loadSessionContext(now)

    const res = await persistAnswer(recall, 'hard', true, 'review', 90_000, ctx, now, { missedPointIds: ['p1'] })
    expect(res.reprioritised).toBe(1)
    expect((await db.exercises.get(linked.id))!.fsrs.due).toBe(now)

    await undoAnswer(res.log.id)
    expect((await db.exercises.get(recall.id))!.fsrs).toEqual(recall.fsrs)
    expect(await db.reviewLogs.count()).toBe(0)
  })

  it('tracks worked-example fading on demonstration exercises', async () => {
    const cahier = await createCahier('Maths', '#000')
    const fiche = await createChapitre({ cahierId: cahier.id, title: 'F', content: 'x', source: 'paste' })
    const now = Date.now()
    const [demo] = await addExercises(fiche.id, cahier.id, [{ data: { type: 'demonstration', title: 'T', statement: 'S', steps: [{ text: '1' }, { text: '2' }, { text: '3' }] }, difficulty: 3, tags: [] }])
    const ctx = await loadSessionContext(now)
    await persistAnswer(demo, 'good', true, 'review', 1000, ctx, now)
    let fresh = (await db.exercises.get(demo.id))!
    expect(fresh.fading).toEqual({ level: 1, streak: 1 })
    await persistAnswer(fresh, 'good', true, 'review', 1000, ctx, now + 1)
    fresh = (await db.exercises.get(demo.id))!
    expect(fresh.fading).toEqual({ level: 2, streak: 0 })
  })
})

describe('hypercorrection', () => {
  it('forces a high-confidence error back at J+1 and J+7, then clears the dates as they pass', async () => {
    await updateSettings({ burySiblings: false })
    const cahier = await createCahier('Physique', '#000')
    const fiche = await createChapitre({ cahierId: cahier.id, title: 'F', content: 'x', source: 'paste' })
    const now = Date.now()
    const a = await reviewCard(fiche.id, cahier.id, null, 0, now)
    const ctx = await loadSessionContext(now)

    const res = await persistAnswer(a, 'again', false, 'review', 1000, ctx, now, { confidence: 3 })
    expect(res.log.confidence).toBe(3)
    let fresh = (await db.exercises.get(a.id))!
    expect(fresh.forcedDue).toHaveLength(2)
    const [j1, j7] = fresh.forcedDue!
    expect(Math.round((j7 - j1) / DAY)).toBe(6)
    expect(new Date(j1).getHours()).toBe(0)
    // The relearning step (minutes) is sooner than J+1: FSRS due kept.
    expect(fresh.fsrs.due).toBeLessThan(j1)

    // Answered again at J+1 morning: the J+1 date is consumed, J+7 caps the next due.
    const atJ1 = j1 + 9 * 3_600_000
    fresh = { ...fresh, fsrs: { ...fresh.fsrs, state: 2, stability: 50, due: atJ1 - 1000 } }
    const res2 = await persistAnswer(fresh, 'good', true, 'review', 1000, ctx, atJ1)
    expect(res2.card!.due).toBe(j7)
    expect((await db.exercises.get(a.id))!.forcedDue).toEqual([j7])

    // A confident error without the flag does not force anything.
    const b = await reviewCard(fiche.id, cahier.id, null, 0, now)
    await persistAnswer(b, 'again', false, 'review', 1000, ctx, now, { confidence: 2 })
    expect((await db.exercises.get(b.id))!.forcedDue).toBeUndefined()
  })
})

describe('interval labels and exam cap (Revue 2)', () => {
  /** Stability-5 review card, reviewed exactly on time. */
  async function stability5(chapitreId: string, cahierId: string, now: number, stability = 5): Promise<Exercise> {
    const [e] = await addExercises(chapitreId, cahierId, [{ data: { type: 'flashcard', question: 'q', answer: 'a' }, difficulty: 1, tags: [] }])
    const fsrs = { ...e.fsrs, state: 2 as const, stability, difficulty: 5, reps: 3, lapses: 0, due: now, last_review: now - stability * DAY, scheduled_days: stability, elapsed_days: stability }
    await db.exercises.update(e.id, { fsrs })
    return (await db.exercises.get(e.id))!
  }

  it('spreads Hard / Good / Easy through the session scheduler when no exam applies', async () => {
    await updateSettings({ desiredRetention: 0.9, maximumInterval: 365, lightDays: [] })
    const cahier = await createCahier('Physique', '#000')
    const fiche = await createChapitre({ cahierId: cahier.id, title: 'F', content: 'x', source: 'paste' })
    const now = Date.now()
    const e = await stability5(fiche.id, cahier.id, now)
    const ctx = await loadSessionContext(now)
    const { intervalCap, intervalLabels } = await import('./session')
    const { previewAll } = await import('./fsrs')
    expect(ctx.schedulerFor(e)).toBe(ctx.scheduler)
    expect(intervalCap(ctx, e, e.fsrs, now)).toBeUndefined()
    const p = previewAll(ctx.schedulerFor(e), e.fsrs, now, [])
    const days = (r: 2 | 3 | 4) => (p[r].due - now) / DAY
    expect(days(2)).toBeLessThan(0.9 * days(3))
    expect(days(4)).toBeGreaterThan(1.2 * days(3))
    const labels = intervalLabels(ctx, e, e.fsrs, now)
    expect(labels.good).toMatch(/j$/)
  })

  it('reports the exam cap on the buttons it actually constrains', async () => {
    const { addExam } = await import('../db')
    await updateSettings({ desiredRetention: 0.9, maximumInterval: 365, lightDays: [] })
    const cahier = await createCahier('Physique', '#000')
    const fiche = await createChapitre({ cahierId: cahier.id, title: 'F', content: 'x', source: 'paste' })
    const now = Date.now()
    const e = await stability5(fiche.id, cahier.id, now, 30)
    await addExam(cahier.id, { name: 'DS n° 2', date: now + 21 * DAY, chapitreIds: [fiche.id] })
    const ctx = await loadSessionContext(now)
    const { intervalCap } = await import('./session')
    const cap = intervalCap(ctx, e, e.fsrs, now)
    expect(cap).toBeDefined()
    expect(cap!.days).toBe(10)
    expect(cap!.examName).toBe('DS n° 2')
    // A 30-day stability wants ~30 days on Good: Good and Easy hit the 10-day cap, Again (minutes) does not.
    expect(cap!.grades).toContain('good')
    expect(cap!.grades).toContain('easy')
    expect(cap!.grades).not.toContain('again')
  })
})

describe('exam modes', () => {
  it('plans three sessions for an exam in 21 days, and cramming never moves a due date', async () => {
    const { addExam } = await import('../db')
    const cahier = await createCahier('Physique', '#000')
    const fiche = await createChapitre({ cahierId: cahier.id, title: 'F', content: 'x', source: 'paste' })
    const now = Date.now()
    const a = await reviewCard(fiche.id, cahier.id, 'p1', 0, now)
    const b = await reviewCard(fiche.id, cahier.id, 'p2', 0, now)
    await db.exercises.update(b.id, { fsrs: { ...b.fsrs, due: now + 3 * DAY, stability: 30 } })

    const exam = await addExam(cahier.id, { name: 'DS', date: now + 21 * DAY, chapitreIds: [fiche.id] })
    expect(exam.sessions).toHaveLength(3)
    const daysBefore = exam.sessions.map((s) => Math.round((exam.date - s.at) / DAY))
    expect(daysBefore).toEqual([12, 6, 1])

    const ctx = await loadSessionContext(now)
    // Interval cap: half of 21 days.
    expect(ctx.overrides.get(fiche.id)?.maximumInterval).toBe(10)
    expect(ctx.schedulerFor(a)).not.toBe(ctx.scheduler)

    const params = { scope: 'exam' as const, mode: 'cramming' as const, examId: exam.id }
    const { loadScopeExercises } = await import('./session')
    const rows = await loadScopeExercises(params, ctx)
    const queue = buildQueue(rows, params, ctx, now)
    // Lowest retrievability first: the overdue card `a`.
    expect(queue.map((e) => e.id)).toEqual([a.id, b.id])

    const before = (await db.exercises.toArray()).map((e) => [e.id, e.fsrs.due] as const)
    await persistAnswer(a, 'again', false, 'cramming', 1000, ctx, now)
    await persistAnswer(b, 'good', true, 'cramming', 1000, ctx, now)
    const after = (await db.exercises.toArray()).map((e) => [e.id, e.fsrs.due] as const)
    expect(after).toEqual(before)
    expect((await db.reviewLogs.toArray()).every((l) => !l.affectsScheduling)).toBe(true)
  })

  it('exam sessions schedule with the capped interval', async () => {
    const { addExam } = await import('../db')
    const cahier = await createCahier('Physique', '#000')
    const fiche = await createChapitre({ cahierId: cahier.id, title: 'F', content: 'x', source: 'paste' })
    const now = Date.now()
    const a = await reviewCard(fiche.id, cahier.id, 'p1', 0, now)
    await db.exercises.update(a.id, { fsrs: { ...a.fsrs, stability: 200 } })
    const fresh = (await db.exercises.get(a.id))!
    await addExam(cahier.id, { name: 'DS', date: now + 8 * DAY, chapitreIds: [fiche.id] })
    const ctx = await loadSessionContext(now)
    // Without the exam this stable card would go out for months.
    const free = await import('./fsrs').then((m) => m.applyRating(ctx.scheduler, fresh.fsrs, 3, now))
    expect(free.next.due - now).toBeGreaterThan(60 * DAY)
    const res = await persistAnswer(fresh, 'good', true, 'exam', 1000, ctx, now)
    expect(res.card).not.toBeNull()
    // Cap = floor(8 / 2) = 4 days; ts-fsrs keeps Hard < Good < Easy strictly, so Good may land one day above the cap.
    expect(res.card!.due - now).toBeLessThanOrEqual(5 * DAY + 60_000)
    expect(res.log.affectsScheduling).toBe(true)
  })
})

describe('buildQueue (review)', () => {
  it('interleaves two fiches so that siblings never follow each other', async () => {
    const cahier = await createCahier('Physique', '#000')
    const f1 = await createChapitre({ cahierId: cahier.id, title: 'F1', content: 'x', source: 'paste' })
    const f2 = await createChapitre({ cahierId: cahier.id, title: 'F2', content: 'y', source: 'paste' })
    const now = Date.now()
    for (const [fiche, point] of [
      [f1, 'a'],
      [f1, 'a'],
      [f1, 'a'],
      [f1, 'b'],
      [f2, 'c'],
      [f2, 'c'],
      [f2, 'd'],
    ] as const) {
      await reviewCard(fiche.id, cahier.id, point, 0, now)
    }
    const ctx = await loadSessionContext(now)
    const all = await db.exercises.toArray()
    const queue = buildQueue(all, { scope: 'cahier', id: cahier.id, mode: 'review' }, ctx, now)
    expect(queue).toHaveLength(7)
    expect(hasAdjacentSiblings(queue)).toBe(false)
  })
})
