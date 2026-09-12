import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { applySyncState, createDb, exportBackup, importBackup, listMigrationBackups, mergeBackup, mergeIntoDb, purgeOldTombstones, readSyncState, SETTINGS_STAMPS_KEY, wipeAll, type CahiersDb } from './db'
import { migrateBackup } from './lib/migrations'
import { setDeviceId } from './lib/sync/device'
import { newCard } from './lib/fsrs'
import type { Exercise, ReviewLog } from './types'

let opened: Dexie[] = []
let n = 0
const T0 = 1_700_000_000_000
const DAY = 86_400_000

function freshName() {
  return `cahiers-sync-${Date.now()}-${n++}`
}

afterEach(async () => {
  for (const d of opened) {
    d.close()
    await Dexie.delete(d.name)
  }
  opened = []
})

function open(name = freshName()): CahiersDb {
  const d = createDb(name)
  opened.push(d)
  return d
}

/** A database at schema v5 with the row shapes written before the sync (no deviceId, no updatedAt on points). */
async function seedV5(name: string) {
  const old = new Dexie(name)
  old.version(1).stores({ cahiers: 'id, name, createdAt', chapitres: 'id, cahierId, createdAt, onenotePageId', exercises: 'id, chapitreId, cahierId, type, srs.due', attempts: '++id, exerciseId, cahierId, chapitreId, ts', settings: 'id' })
  old.version(2).stores({ supplements: 'id, chapitreId, cahierId, status, createdAt', mindmaps: 'id, chapitreId, cahierId, createdAt' })
  old.version(3).stores({ exercises: 'id, chapitreId, cahierId, pointId, type, status, srs.due', reviewLogs: 'id, exerciseId, chapitreId, cahierId, ts', points: 'id, chapitreId, cahierId', kv: 'key', attempts: null })
  old.version(4).stores({ exercises: 'id, chapitreId, cahierId, pointId, type, status, fsrs.due' })
  old.version(5).stores({})
  await old.table('cahiers').add({ id: 'c1', name: 'Physique', color: '#000', createdAt: 1, updatedAt: 1 })
  await old.table('chapitres').add({ id: 'ch1', cahierId: 'c1', title: 'Gauss', content: 'Flux…', source: 'paste', createdAt: 1, updatedAt: 1 })
  await old.table('points').add({ id: 'p1', chapitreId: 'ch1', cahierId: 'c1', anchor: 'a', title: 't', nature: 'definition', order: 0, createdAt: 7 })
  await old.table('exercises').add(exercise('ex1', 5))
  await old.table('settings').put({ id: 'app', theme: 'light', newPerDay: 12 })
  old.close()
}

function exercise(id: string, updatedAt: number, extra: Partial<Exercise> = {}): Exercise {
  return { id, chapitreId: 'ch1', cahierId: 'c1', pointId: null, type: 'flashcard', data: { type: 'flashcard', question: 'Q', answer: 'A' }, difficulty: 1, tags: [], status: 'active', origin: 'claude', fsrs: newCard(T0), createdAt: 1, updatedAt, ...extra }
}

function log(id: string, exerciseId: string, ts: number): ReviewLog {
  return { id, exerciseId, chapitreId: 'ch1', cahierId: 'c1', ts, rating: 3, correct: true, durationMs: 1, mode: 'review', fsrsLog: null, affectsScheduling: true }
}

describe('Dexie v6 migration', () => {
  it('writes backup_before_v6 through the existing mechanism, stamps rows and settings', async () => {
    setDeviceId('pc')
    const name = freshName()
    await seedV5(name)
    const d = open(name)
    await d.open()
    const backups = await listMigrationBackups(d)
    const v6 = backups.find((b) => b.key === 'backup_before_v6')!
    expect(v6).toBeDefined()
    expect(v6.value.schemaVersion).toBe(5)
    expect((v6.value.points as { updatedAt?: number }[])[0].updatedAt).toBeUndefined()
    // The snapshot is a valid backup for the current importer.
    expect(migrateBackup(v6.value).points[0].updatedAt).toBe(7)

    expect((await d.points.get('p1'))?.updatedAt).toBe(7)
    expect((await d.points.get('p1'))?.deviceId).toBe('pc')
    expect((await d.cahiers.get('c1'))?.deviceId).toBe('pc')
    const stamps = (await d.kv.get(SETTINGS_STAMPS_KEY))?.value as Record<string, number>
    expect(Object.keys(stamps).sort()).toEqual(['newPerDay', 'theme'])
    expect(await d.tombstones.count()).toBe(0)
  })
})

describe('device stamping', () => {
  it('stamps every write with the device, but not an import (the file keeps its origins)', async () => {
    setDeviceId('phone')
    const d = open()
    await d.cahiers.add({ id: 'c1', name: 'Bio', color: '#000', createdAt: 1, updatedAt: 1 })
    expect((await d.cahiers.get('c1'))?.deviceId).toBe('phone')
    await d.cahiers.update('c1', { name: 'Biologie' })
    expect((await d.cahiers.get('c1'))?.deviceId).toBe('phone')
    const out = await exportBackup(d)
    out.cahiers[0].deviceId = 'pc'
    await importBackup(JSON.parse(JSON.stringify(out)), d)
    expect((await d.cahiers.get('c1'))?.deviceId).toBe('pc')
  })
})

describe('deletions leave tombstones', () => {
  it('deleting a cahier tombstones every row under it; wipeAll tombstones everything', async () => {
    setDeviceId('pc')
    const { deleteCahier, deleteChapitre, deleteExercise, discardSupplement, db } = await import('./db')
    // The app helpers work on the singleton: use it and clean it.
    opened.push(db)
    await db.cahiers.add({ id: 'c1', name: 'Bio', color: '#000', createdAt: 1, updatedAt: 1 })
    await db.chapitres.bulkAdd([
      { id: 'ch1', cahierId: 'c1', title: 'A', content: '', source: 'paste', createdAt: 1, updatedAt: 1 },
      { id: 'ch2', cahierId: 'c1', title: 'B', content: '', source: 'paste', createdAt: 1, updatedAt: 1 },
    ])
    await db.exercises.bulkAdd([exercise('e1', 1), exercise('e2', 1, { chapitreId: 'ch2' }), exercise('e3', 1, { chapitreId: 'ch2' })])
    await db.supplements.add({ id: 's1', chapitreId: 'ch2', cahierId: 'c1', title: 't', kind: 'precision', reason: '', content: '', status: 'pending', createdAt: 1 })
    await db.reviewLogs.add(log('l1', 'e1', 1))

    await deleteExercise('e3')
    await discardSupplement('s1')
    await deleteChapitre('ch2')
    let t = await db.tombstones.toArray()
    expect(t.map((x) => `${x.table}/${x.id}`).sort()).toEqual(['chapitres/ch2', 'exercises/e2', 'exercises/e3', 'supplements/s1'])
    expect(t.every((x) => x.deviceId === 'pc' && x.deletedAt > 0)).toBe(true)

    await deleteCahier('c1')
    t = await db.tombstones.toArray()
    expect(t.map((x) => `${x.table}/${x.id}`).sort()).toEqual(['cahiers/c1', 'chapitres/ch1', 'chapitres/ch2', 'exercises/e1', 'exercises/e2', 'exercises/e3', 'supplements/s1'])
    expect(await db.reviewLogs.count()).toBe(0)

    await db.cahiers.add({ id: 'c9', name: 'X', color: '#000', createdAt: 1, updatedAt: 1 })
    await wipeAll(db)
    expect(await db.cahiers.count()).toBe(0)
    expect((await db.tombstones.toArray()).some((x) => x.id === 'c9')).toBe(true)
  })

  it('purges tombstones older than 90 days', async () => {
    const d = open()
    await d.tombstones.bulkPut([
      { table: 'cahiers', id: 'old', deletedAt: T0, deviceId: 'pc' },
      { table: 'cahiers', id: 'new', deletedAt: T0 + 89 * DAY, deviceId: 'pc' },
    ])
    expect(await purgeOldTombstones(d, T0 + 100 * DAY)).toBe(1)
    expect((await d.tombstones.toArray()).map((t) => t.id)).toEqual(['new'])
  })
})

describe('merge into the database', () => {
  it('« Fusionner une sauvegarde » keeps both sides, applies the file’s deletions and never restamps', async () => {
    setDeviceId('pc')
    const d = open()
    await d.cahiers.add({ id: 'c1', name: 'Bio', color: '#000', createdAt: 1, updatedAt: T0 + 5 })
    await d.chapitres.add({ id: 'ch1', cahierId: 'c1', title: 'A', content: '', source: 'paste', createdAt: 1, updatedAt: 1 })
    await d.exercises.bulkAdd([exercise('e1', 1), exercise('e2', 1)])
    await d.reviewLogs.add(log('l1', 'e1', T0))
    await d.settings.put({ id: 'app', theme: 'dark', newPerDay: 5 } as never)
    await d.kv.put({ key: SETTINGS_STAMPS_KEY, value: { theme: T0, newPerDay: T0 + 9 } })

    const phone = open()
    setDeviceId('phone')
    await phone.cahiers.add({ id: 'c1', name: 'Bio (téléphone)', color: '#000', createdAt: 1, updatedAt: T0 + 1 })
    await phone.exercises.bulkAdd([exercise('e1', 2, { tags: ['phone'] }), exercise('e3', 1)])
    await phone.reviewLogs.bulkAdd([log('l1', 'e1', T0), log('l2', 'e3', T0 + 1)])
    await phone.tombstones.put({ table: 'exercises', id: 'e2', deletedAt: T0 + 3, deviceId: 'phone' })
    await phone.settings.put({ id: 'app', theme: 'light', newPerDay: 40, background: 'off' } as never)
    await phone.kv.put({ key: SETTINGS_STAMPS_KEY, value: { theme: T0 + 20, newPerDay: T0, background: T0 + 20 } })
    const file = JSON.parse(JSON.stringify(await exportBackup(phone)))

    setDeviceId('pc')
    const summary = await mergeBackup(file, d)
    expect(summary.added.exercises).toBe(1)
    expect(summary.deleted.exercises).toBe(1)
    expect(summary.added.reviewLogs).toBe(1)
    expect((await d.cahiers.get('c1'))?.name).toBe('Bio')
    expect((await d.exercises.get('e1'))?.tags).toEqual(['phone'])
    expect((await d.exercises.get('e1'))?.deviceId).toBe('phone')
    expect(await d.exercises.get('e2')).toBeUndefined()
    expect(await d.exercises.get('e3')).toBeDefined()
    expect(await d.reviewLogs.count()).toBe(2)
    expect(await d.tombstones.count()).toBe(1)
    const s = (await d.settings.get('app'))!
    expect(s.theme).toBe('light')
    expect(s.newPerDay).toBe(5)
    expect(s.background).toBeUndefined()
  })

  it('merging the same file twice changes nothing more; a file from an older schema merges too', async () => {
    const d = open()
    await d.cahiers.add({ id: 'c1', name: 'Bio', color: '#000', createdAt: 1, updatedAt: 1 })
    const v4 = { app: 'cahiers', version: 4, schemaVersion: 4, exportedAt: T0, cahiers: [{ id: 'c2', name: 'Chimie', color: '#000', createdAt: 1, updatedAt: 1 }], exercises: [], reviewLogs: [], settings: { id: 'app', theme: 'dark' } }
    const first = await mergeBackup(v4, d)
    expect(first.added.cahiers).toBe(1)
    const second = await mergeBackup(v4, d)
    expect(Object.values(second.added).reduce((a, b) => a + b, 0)).toBe(0)
    expect(await d.cahiers.count()).toBe(2)
    await expect(mergeBackup({ app: 'nope' }, d)).rejects.toThrow(/pas une sauvegarde/)
    await expect(mergeBackup({ app: 'cahiers', schemaVersion: 99 }, d)).rejects.toThrow(/plus récente/)
  })

  it('applySyncState returns the number of rows touched and keeps the device settings', async () => {
    const d = open()
    await d.settings.put({ id: 'app', theme: 'dark', background: 'full' } as never)
    const state = await readSyncState(d)
    expect(state.settings.background).toBeUndefined()
    state.cahiers.push({ id: 'c1', name: 'Bio', color: '#000', createdAt: 1, updatedAt: 1, deviceId: 'phone' })
    expect(await applySyncState(state, d)).toBe(1)
    expect(await applySyncState(state, d)).toBe(0)
    expect((await d.settings.get('app'))?.background).toBe('full')
    expect(await mergeIntoDb(state, d)).toBeDefined()
  })
})
