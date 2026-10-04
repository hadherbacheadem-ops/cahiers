import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { createDb, readSyncState, wipeAll, type CahiersDb } from '../db'
import { asBundledContent, contentToState, readApplied, syncBundledContent, type BundledContent, type BundledExercise } from './bundledContent'
import { newCard } from './fsrs'
import { SCHEMA_VERSION } from './migrations'

const T0 = 1_700_000_000_000
const DAY = 86_400_000

let opened: Dexie[] = []
let n = 0
afterEach(async () => {
  for (const d of opened) {
    d.close()
    await Dexie.delete(d.name)
  }
  opened = []
})
function open(): CahiersDb {
  const d = createDb(`cahiers-contenu-${Date.now()}-${n++}`)
  opened.push(d)
  return d
}

const ex = (id: string, extra: Partial<BundledExercise> = {}): BundledExercise => ({
  id,
  chapitreId: 'ch1',
  cahierId: 'c1',
  pointId: null,
  type: 'flashcard',
  data: { type: 'flashcard', question: `Question ${id}`, answer: 'Réponse' },
  difficulty: 2,
  tags: [],
  status: 'active',
  origin: 'claude',
  createdAt: T0,
  updatedAt: T0,
  ...extra,
})

function content(over: Partial<BundledContent> = {}): BundledContent {
  return {
    app: 'cahiers',
    kind: 'contenu',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: T0,
    cahiers: [{ id: 'c1', name: 'Physique', color: '#3b6cf6', createdAt: T0, updatedAt: T0 }],
    chapitres: [{ id: 'ch1', cahierId: 'c1', title: 'Gauss', content: 'Le théorème de Gauss…', source: 'claude', createdAt: T0, updatedAt: T0 }],
    exercises: [ex('e1'), ex('e2')],
    points: [],
    supplements: [],
    mindmaps: [],
    ...over,
  }
}

const serve = (file: unknown, status = 200) => (async () => new Response(typeof file === 'string' ? file : JSON.stringify(file), { status })) as typeof fetch

describe('asBundledContent', () => {
  it('accepts a content file and fills the missing lists', () => {
    const f = asBundledContent({ app: 'cahiers', kind: 'contenu', schemaVersion: SCHEMA_VERSION, exportedAt: 1 })
    expect(f?.exercises).toEqual([])
  })
  it('refuses anything else: a backup, a page, a newer schema', () => {
    expect(asBundledContent({ app: 'cahiers', kind: 'snapshot', schemaVersion: 6, exportedAt: 1 })).toBeNull()
    expect(asBundledContent('<html>')).toBeNull()
    expect(asBundledContent(null)).toBeNull()
    expect(asBundledContent({ app: 'cahiers', kind: 'contenu', schemaVersion: SCHEMA_VERSION + 1, exportedAt: 1 })).toBeNull()
  })
})

describe('syncBundledContent', () => {
  it('fills an empty app with new cards, and says nothing is new the second time', async () => {
    const db = open()
    const first = await syncBundledContent({ database: db, fetcher: serve(content()) })
    expect(first.status).toBe('applied')
    const s = await readSyncState(db)
    expect(s.cahiers).toHaveLength(1)
    expect(s.chapitres).toHaveLength(1)
    expect(s.exercises).toHaveLength(2)
    expect(s.exercises.every((e) => e.fsrs.reps === 0 && e.fsrs.last_review == null)).toBe(true)
    expect(s.reviewLogs).toEqual([])
    expect((await readApplied(db))?.exportedAt).toBe(T0)

    const second = await syncBundledContent({ database: db, fetcher: serve(content()) })
    expect(second.status).toBe('current')
  })

  it('brings new rows and content changes, never the reader’s scheduling, status or settings', async () => {
    const db = open()
    await syncBundledContent({ database: db, fetcher: serve(content()) })
    // The reader reviews e1 and suspends e2; they have their own settings.
    const reviewed = { ...newCard(T0), reps: 4, stability: 12, last_review: T0 + DAY }
    await db.exercises.update('e1', { fsrs: reviewed })
    await db.exercises.update('e2', { status: 'suspended', updatedAt: T0 + 1 })
    await db.settings.put({ id: 'app', niveau: 'PC', newPerDay: 3 } as never)

    const newer = content({
      exportedAt: T0 + 10 * DAY,
      exercises: [ex('e1', { data: { type: 'flashcard', question: 'Question e1 corrigée', answer: 'Réponse' }, updatedAt: T0 + 5 * DAY }), ex('e2', { updatedAt: T0 + 5 * DAY }), ex('e3', { updatedAt: T0 + 5 * DAY })],
    })
    const r = await syncBundledContent({ database: db, fetcher: serve(newer) })
    expect(r.status).toBe('applied')

    const s = await readSyncState(db)
    const byId = new Map(s.exercises.map((e) => [e.id, e]))
    expect(byId.size).toBe(3)
    expect((byId.get('e1')!.data as { question: string }).question).toBe('Question e1 corrigée')
    expect(byId.get('e1')!.fsrs.reps).toBe(4)
    expect(byId.get('e1')!.fsrs.stability).toBe(12)
    expect(byId.get('e2')!.status).toBe('suspended')
    expect(byId.get('e3')!.fsrs.reps).toBe(0)
    const settings = (await db.settings.get('app')) as unknown as { niveau: string; newPerDay: number }
    expect(settings.niveau).toBe('PC')
    expect(settings.newPerDay).toBe(3)
  })

  it('does not bring back what the reader deleted, unless asked to reload', async () => {
    const db = open()
    await syncBundledContent({ database: db, fetcher: serve(content()) })
    await wipeAll(db)
    expect((await readSyncState(db)).chapitres).toHaveLength(0)

    const again = content({ exportedAt: T0 + DAY })
    await syncBundledContent({ database: db, fetcher: serve(again) })
    expect((await readSyncState(db)).chapitres).toHaveLength(0)

    await syncBundledContent({ database: db, fetcher: serve(again), force: true })
    const s = await readSyncState(db)
    expect(s.chapitres).toHaveLength(1)
    expect(s.exercises).toHaveLength(2)
  })

  it('keeps the reader’s exams and daily limits on a cahier', async () => {
    const db = open()
    await syncBundledContent({ database: db, fetcher: serve(content()) })
    await db.cahiers.update('c1', { limits: { newPerDay: 2 }, examens: [{ id: 'x', name: 'DS', date: T0 + 30 * DAY, chapitreIds: ['ch1'] }] } as never)
    const state = contentToState(content({ exportedAt: T0 + DAY, cahiers: [{ id: 'c1', name: 'Physique (renommé)', color: '#3b6cf6', createdAt: T0, updatedAt: T0 + DAY }] }), await readSyncState(db))
    expect(state.cahiers[0].name).toBe('Physique (renommé)')
    expect(state.cahiers[0].limits).toEqual({ newPerDay: 2 })
    expect(state.cahiers[0].examens).toHaveLength(1)
  })

  it('never throws: missing file, a page instead of JSON, a network error', async () => {
    const db = open()
    expect((await syncBundledContent({ database: db, fetcher: serve('', 404) })).status).toBe('absent')
    expect((await syncBundledContent({ database: db, fetcher: serve('<!doctype html><html>') })).status).toBe('absent')
    expect((await syncBundledContent({ database: db, fetcher: (async () => Promise.reject(new TypeError('offline'))) as typeof fetch })).status).toBe('absent')
    expect((await readSyncState(db)).cahiers).toHaveLength(0)
  })
})
