import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { createDb, exportBackup, exportReviewLogCsv, importBackup, type CahiersDb } from './db'

let opened: Dexie[] = []
let n = 0
const T0 = 1_700_000_000_000
const DAY = 86_400_000

function freshName() {
  return `cahiers-test-${Date.now()}-${n++}`
}

afterEach(async () => {
  for (const d of opened) {
    d.close()
    await Dexie.delete(d.name)
  }
  opened = []
})

/** Opens a database with the v2 schema and the v2 row shapes, as the app wrote them before phase 0. */
async function seedV2(name: string) {
  const old = new Dexie(name)
  old.version(1).stores({
    cahiers: 'id, name, createdAt',
    chapitres: 'id, cahierId, createdAt, onenotePageId',
    exercises: 'id, chapitreId, cahierId, type, srs.due',
    attempts: '++id, exerciseId, cahierId, chapitreId, ts',
    settings: 'id',
  })
  old.version(2).stores({
    supplements: 'id, chapitreId, cahierId, status, createdAt',
    mindmaps: 'id, chapitreId, cahierId, createdAt',
  })
  await old.table('cahiers').add({ id: 'c1', name: 'Physique', color: '#000', createdAt: 1, updatedAt: 1 })
  await old.table('chapitres').add({ id: 'ch1', cahierId: 'c1', title: 'Gauss', content: 'Flux…', source: 'paste', createdAt: 1, updatedAt: 1 })
  await old.table('exercises').bulkAdd([
    {
      id: 'ex1',
      chapitreId: 'ch1',
      cahierId: 'c1',
      type: 'flashcard',
      data: { type: 'flashcard', question: 'Q', answer: 'A' },
      difficulty: 1,
      tags: [],
      srs: { ease: 2.5, interval: 3, due: T0 + 3 * DAY, reps: 2, lapses: 0 },
      createdAt: 5,
    },
    {
      id: 'ex2',
      chapitreId: 'ch1',
      cahierId: 'c1',
      type: 'flashcard',
      data: { type: 'flashcard', question: 'Q2', answer: 'A2' },
      difficulty: 1,
      tags: [],
      srs: { ease: 2.5, interval: 0, due: T0, reps: 0, lapses: 0 },
      createdAt: 6,
    },
  ])
  await old.table('attempts').bulkAdd([
    { exerciseId: 'ex1', cahierId: 'c1', chapitreId: 'ch1', ts: T0 - 4 * DAY, correct: true, grade: 'good', mode: 'review', durationMs: 1000 },
    { exerciseId: 'ex1', cahierId: 'c1', chapitreId: 'ch1', ts: T0 - 3 * DAY, correct: true, grade: 'good', mode: 'review', durationMs: 2000 },
  ])
  await old.table('settings').put({ id: 'app', theme: 'light', chronoSeconds: 120, chronoCount: 15 })
  old.close()
}

function open(name: string): CahiersDb {
  const d = createDb(name)
  opened.push(d)
  return d
}

describe('Dexie upgrade v2 → v4', () => {
  it('converts attempts into review logs, drops attempts, fills v3 fields and rebuilds FSRS from the log', async () => {
    const name = freshName()
    await seedV2(name)
    const d = open(name)
    await d.open()

    expect(d.verno).toBe(4)
    expect(d.tables.map((t) => t.name)).not.toContain('attempts')

    const logs = await d.reviewLogs.orderBy('ts').toArray()
    expect(logs).toHaveLength(2)
    expect(logs[0]).toMatchObject({ exerciseId: 'ex1', rating: 3, correct: true, mode: 'review', affectsScheduling: true, fsrsLog: null })

    const ex1 = await d.exercises.get('ex1')
    expect(ex1).toMatchObject({ pointId: null, status: 'active', origin: 'claude', updatedAt: 5 })
    expect('srs' in ex1!).toBe(false)
    expect(ex1!.fsrs.reps).toBe(2) // replayed from the two logs
    expect(ex1!.fsrs.state).toBe(2)
    expect(ex1!.fsrs.due).toBe(T0 + 3 * DAY) // SM-2 due date kept

    const ex2 = await d.exercises.get('ex2')
    expect(ex2!.fsrs.state).toBe(0) // never reviewed: still new
    expect(ex2!.fsrs.due).toBe(T0)

    // New indexes are usable.
    expect(await d.exercises.where('status').equals('active').count()).toBe(2)
    expect(await d.exercises.where('fsrs.due').belowOrEqual(T0).count()).toBe(1)
    expect(await d.points.count()).toBe(0)
  })
})

describe('backup round trip', () => {
  it('imports a v1 backup into a fresh database and exports it as v4', async () => {
    const d = open(freshName())
    const v1 = {
      app: 'cahiers',
      version: 1,
      exportedAt: 1,
      cahiers: [{ id: 'c1', name: 'Bio', color: '#000', createdAt: 1, updatedAt: 1 }],
      chapitres: [{ id: 'ch1', cahierId: 'c1', title: 'F', content: 'x', source: 'paste', createdAt: 1, updatedAt: 1 }],
      exercises: [{ id: 'ex1', chapitreId: 'ch1', cahierId: 'c1', type: 'flashcard', data: { type: 'flashcard', question: 'Q', answer: 'A' }, difficulty: 1, tags: [], srs: { ease: 2.5, interval: 0, due: 1, reps: 0, lapses: 0 }, createdAt: 1 }],
      attempts: [{ id: 1, exerciseId: 'ex1', cahierId: 'c1', chapitreId: 'ch1', ts: 50, correct: true, grade: 'easy', mode: 'review', durationMs: 10 }],
      settings: { id: 'app', theme: 'dark', chronoSeconds: 60, chronoCount: 5 },
    }
    await importBackup(v1, d)

    expect(await d.cahiers.count()).toBe(1)
    const ex = await d.exercises.get('ex1')
    expect(ex?.status).toBe('active')
    expect(ex?.fsrs.reps).toBe(1)
    expect(await d.reviewLogs.count()).toBe(1)
    expect((await d.settings.get('app'))?.theme).toBe('dark')

    const out = await exportBackup(d)
    expect(out.schemaVersion).toBe(4)
    expect(out.reviewLogs[0].rating).toBe(4)
    expect(out.settings.promptTypes).toHaveLength(6)
    expect(out.settings.newPerDay).toBe(20)
  })

  it('is idempotent: importing the same export twice does not duplicate review logs', async () => {
    const d = open(freshName())
    await d.cahiers.add({ id: 'c1', name: 'Bio', color: '#000', createdAt: 1, updatedAt: 1 })
    await d.reviewLogs.add({ id: 'l1', exerciseId: 'e', chapitreId: 'ch', cahierId: 'c1', ts: 1, rating: 3, correct: true, durationMs: 1, mode: 'review', fsrsLog: null, affectsScheduling: true })
    const out = await exportBackup(d)
    await importBackup(out, d)
    await importBackup(JSON.parse(JSON.stringify(out)), d)
    expect(await d.reviewLogs.count()).toBe(1)
    expect(await d.cahiers.count()).toBe(1)
  })

  it('refuses a file from a newer schema', async () => {
    const d = open(freshName())
    await expect(importBackup({ app: 'cahiers', schemaVersion: 99 }, d)).rejects.toThrow(/plus récente/)
  })
})

describe('exportReviewLogCsv', () => {
  it('writes one line per scheduling answer in the optimizer format', async () => {
    const d = open(freshName())
    await d.reviewLogs.bulkAdd([
      { id: 'l1', exerciseId: 'e1', chapitreId: 'ch', cahierId: 'c', ts: 100, rating: 3, correct: true, durationMs: 1500, mode: 'review', fsrsLog: { prev: { state: 0 }, next: {}, log: {} }, affectsScheduling: true },
      { id: 'l2', exerciseId: 'e1', chapitreId: 'ch', cahierId: 'c', ts: 200, rating: 1, correct: false, durationMs: 900, mode: 'practice', fsrsLog: null, affectsScheduling: false },
      { id: 'l3', exerciseId: 'e1', chapitreId: 'ch', cahierId: 'c', ts: 300, rating: 4, correct: true, durationMs: 700, mode: 'review', fsrsLog: null, affectsScheduling: true },
    ])
    const csv = await exportReviewLogCsv(d)
    expect(csv.split('\n')).toEqual(['card_id,review_time,review_rating,review_state,review_duration', 'e1,100,3,0,1500', 'e1,300,4,0,700'])
  })
})
