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
