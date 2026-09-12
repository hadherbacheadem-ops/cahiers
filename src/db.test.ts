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

describe('Dexie upgrade v2 → current', () => {
  it('converts attempts into review logs, drops attempts, fills v3 fields and rebuilds FSRS from the log', async () => {
    const name = freshName()
    await seedV2(name)
    const d = open(name)
    await d.open()

    expect(d.verno).toBe(6)
    expect(d.tables.map((t) => t.name)).toContain('kv')
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

  it('writes a safety backup of the previous content before each migration, restorable and equal to migrateBackup()', async () => {
    const { listMigrationBackups, importBackup: importInto } = await import('./db')
    const { migrateBackup } = await import('./lib/migrations')
    const name = freshName()
    await seedV2(name)
    const d = open(name)
    await d.open()

    const backups = await listMigrationBackups(d)
    expect(backups.map((b) => b.key)).toEqual(['backup_before_v3', 'backup_before_v4', 'backup_before_v6'])

    // v3 snapshot = the v2 content, untouched (attempts, SM-2 srs).
    const v3 = backups[0].value
    expect(v3.version).toBe(2)
    expect((v3.attempts as unknown[]).length).toBe(2)
    expect(((v3.exercises as { srs?: unknown }[])[0]).srs).toBeDefined()
    expect(((v3.exercises as { fsrs?: unknown }[])[0]).fsrs).toBeUndefined()

    // v4 snapshot = the v3 content (reviewLogs present, srs still there).
    const v4 = backups[1].value
    expect(v4.version).toBe(3)
    expect((v4.reviewLogs as unknown[]).length).toBe(2)
    expect(((v4.exercises as { srs?: unknown }[])[0]).srs).toBeDefined()

    // The migrated database equals what migrateBackup() derives from the v2 snapshot.
    const fromSnapshot = migrateBackup(v3)
    const live = await d.exercises.toArray()
    for (const e of fromSnapshot.exercises) {
      const l = live.find((x) => x.id === e.id)!
      expect(l.fsrs.due).toBe(e.fsrs.due)
      expect(l.fsrs.state).toBe(e.fsrs.state)
      expect(l.fsrs.reps).toBe(e.fsrs.reps)
      expect(l.fsrs.stability).toBeCloseTo(e.fsrs.stability, 6)
      expect(l.status).toBe(e.status)
    }
    const liveLogs = await d.reviewLogs.orderBy('ts').toArray()
    expect(fromSnapshot.reviewLogs.map((l) => l.rating)).toEqual(liveLogs.map((l) => l.rating))

    // The snapshot is importable into a fresh database.
    const fresh = open(freshName())
    await importInto(v3, fresh)
    expect(await fresh.exercises.count()).toBe(2)
    expect(await fresh.reviewLogs.count()).toBe(2)
  })
})

describe('backup round trip', () => {
  it('imports a v1 backup into a fresh database and exports it at the current schema', async () => {
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
    expect(out.schemaVersion).toBe(6)
    expect(out.reviewLogs[0].rating).toBe(4)
    expect(out.settings.promptTypes).toHaveLength(8)
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

describe('mind-map exercises', () => {
  it('regenerating a map keeps the exercises, their FSRS state and their review log; deleting the map removes them', async () => {
    const { db: live, createCahier, createChapitre, saveMindmap, deleteMindmap, updateSettings } = await import('./db')
    await Promise.all([live.cahiers.clear(), live.chapitres.clear(), live.exercises.clear(), live.reviewLogs.clear(), live.mindmaps.clear(), live.settings.clear()])
    const cahier = await createCahier('Physique', '#000')
    const fiche = await createChapitre({ cahierId: cahier.id, title: 'F', content: 'x', source: 'paste' })

    // Default: the two exercises wait in the validation queue.
    const map = await saveMindmap({ cahierId: cahier.id, chapitreId: fiche.id, title: 'v1', root: { label: 'v1', children: [{ label: 'a' }] } })
    let ex = await live.exercises.where('chapitreId').equals(fiche.id).toArray()
    expect(ex.map((e) => e.status)).toEqual(['pending', 'pending'])
    expect(ex.map((e) => (e.data.type === 'carte_trous' ? e.data.variant : '')).sort()).toEqual(['reconstruction', 'trous'])

    // Give one of them history and an FSRS state.
    const trous = ex.find((e) => e.data.type === 'carte_trous' && e.data.variant === 'trous')!
    await live.exercises.update(trous.id, { status: 'active', fsrs: { ...trous.fsrs, state: 2, stability: 12.5, reps: 3 } })
    await live.reviewLogs.add({ id: 'l1', exerciseId: trous.id, chapitreId: fiche.id, cahierId: cahier.id, ts: 1, rating: 3, correct: true, durationMs: 1, mode: 'review', fsrsLog: null, affectsScheduling: true })

    // Regenerate: same map id, exercises untouched.
    const map2 = await saveMindmap({ cahierId: cahier.id, chapitreId: fiche.id, title: 'v2', root: { label: 'v2', children: [{ label: 'b' }, { label: 'c' }] } })
    expect(map2.id).toBe(map.id)
    ex = await live.exercises.where('chapitreId').equals(fiche.id).toArray()
    expect(ex).toHaveLength(2)
    const kept = ex.find((e) => e.id === trous.id)!
    expect(kept.fsrs.stability).toBe(12.5)
    expect(kept.fsrs.reps).toBe(3)
    expect(kept.status).toBe('active')
    expect(await live.reviewLogs.where('exerciseId').equals(trous.id).count()).toBe(1)

    // Setting: new maps create active exercises.
    await updateSettings({ mindmapExercisesActive: true })
    const fiche2 = await createChapitre({ cahierId: cahier.id, title: 'G', content: 'y', source: 'paste' })
    await saveMindmap({ cahierId: cahier.id, chapitreId: fiche2.id, title: 'g', root: { label: 'g', children: [{ label: 'a' }] } })
    expect((await live.exercises.where('chapitreId').equals(fiche2.id).toArray()).map((e) => e.status)).toEqual(['active', 'active'])

    // Explicit deletion removes the exercises and their log.
    await deleteMindmap(map.id)
    expect(await live.exercises.where('chapitreId').equals(fiche.id).count()).toBe(0)
    expect(await live.reviewLogs.where('exerciseId').equals(trous.id).count()).toBe(0)
    await Promise.all([live.cahiers.clear(), live.chapitres.clear(), live.exercises.clear(), live.reviewLogs.clear(), live.mindmaps.clear(), live.settings.clear()])
  })
})

describe('inverseCards', () => {
  it('reverses short flashcards of definition / formula points once, never other types', async () => {
    const { inverseCards } = await import('./db')
    const natures: Record<string, 'definition' | 'formule' | 'methode'> = { p1: 'definition', p2: 'methode', p3: 'formule' }
    const out = inverseCards(
      [
        { data: { type: 'flashcard', question: 'Que produit la mitochondrie ?', answer: 'De l’ATP' }, difficulty: 1, tags: ['x'], localPointId: 'p1' },
        { data: { type: 'flashcard', question: 'Autre question sur le même point', answer: 'de l’atp' }, difficulty: 1, tags: [], localPointId: 'p1' },
        { data: { type: 'flashcard', question: 'Étape 1 ?', answer: 'Isoler' }, difficulty: 1, tags: [], localPointId: 'p2' },
        { data: { type: 'flashcard', question: 'Formule ?', answer: '$E = mc^2$', typed: true }, difficulty: 2, tags: [], localPointId: 'p3' },
        { data: { type: 'flashcard', question: 'Longue ?', answer: 'un deux trois quatre cinq six sept huit neuf dix onze douze treize' }, difficulty: 1, tags: [], localPointId: 'p3' },
        { data: { type: 'cloze', text: 'La {{mitochondrie}}' }, difficulty: 1, tags: [], localPointId: 'p1' },
      ],
      (id) => (id ? natures[id] : undefined),
    )
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ inverse: true, origin: 'inverse_auto', localPointId: 'p1', data: { type: 'flashcard', question: 'De l’ATP', answer: 'Que produit la mitochondrie ?' } })
    expect(out[1].data).toMatchObject({ question: '$E = mc^2$', answer: 'Formule ?', typed: true })
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
