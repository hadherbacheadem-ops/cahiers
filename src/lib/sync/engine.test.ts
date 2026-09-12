import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { createDb, type CahiersDb } from '../../db'
import { newCard } from '../fsrs'
import type { Exercise, ReviewLog } from '../../types'
import { setDeviceId } from './device'
import { getSyncCursor, localChanges, MAX_ATTEMPTS, syncOnce } from './engine'
import { MANIFEST_NAME, parseManifest } from './format'
import { MemoryProvider } from './provider'

let opened: Dexie[] = []
let n = 0
const T0 = 1_700_000_000_000
const DAY = 86_400_000

afterEach(async () => {
  for (const d of opened) {
    d.close()
    await Dexie.delete(d.name)
  }
  opened = []
})

function open(): CahiersDb {
  const d = createDb(`cahiers-engine-${Date.now()}-${n++}`)
  opened.push(d)
  return d
}

function exercise(id: string, updatedAt: number, extra: Partial<Exercise> = {}): Exercise {
  return { id, chapitreId: 'ch1', cahierId: 'c1', pointId: null, type: 'flashcard', data: { type: 'flashcard', question: 'Q', answer: 'A' }, difficulty: 1, tags: [], status: 'active', origin: 'claude', fsrs: newCard(T0), createdAt: 1, updatedAt, ...extra }
}

function log(id: string, exerciseId: string, ts: number): ReviewLog {
  return { id, exerciseId, chapitreId: 'ch1', cahierId: 'c1', ts, rating: 3, correct: true, durationMs: 1, mode: 'review', fsrsLog: null, affectsScheduling: true }
}

/** Writes as a given device (the stamping middleware reads the current device id). */
async function as<T>(device: string, fn: () => Promise<T>): Promise<T> {
  setDeviceId(device)
  return fn()
}

const manifestOf = async (p: MemoryProvider) => parseManifest(JSON.parse((await p.read(MANIFEST_NAME))!.text))

describe('two devices through a shared folder', () => {
  it('first device writes a snapshot, second device pulls it, then changes flow both ways as lots', async () => {
    const folder = new MemoryProvider()
    const pc = open()
    const phone = open()
    await as('pc', async () => {
      await pc.cahiers.add({ id: 'c1', name: 'Bio', color: '#000', createdAt: 1, updatedAt: T0 })
      await pc.exercises.bulkAdd([exercise('e1', T0), exercise('e2', T0)])
      await pc.reviewLogs.add(log('l1', 'e1', T0))
    })

    const r1 = await syncOnce(folder, { database: pc, deviceId: 'pc', deviceName: 'PC', now: T0 + 1 })
    expect(r1.snapshotWritten).toBe(true)
    expect(r1.pulled).toBeNull()
    let m = await manifestOf(folder)
    expect(m.snapshot?.seq).toBe(1)
    expect(m.changes).toEqual([])
    expect(m.devices.pc.name).toBe('PC')

    const r2 = await syncOnce(folder, { database: phone, deviceId: 'phone', deviceName: 'Tél', now: T0 + 2 })
    expect(r2.pulled?.added.exercises).toBe(2)
    expect(r2.pushedRows).toBe(0)
    expect(await phone.exercises.count()).toBe(2)
    expect((await phone.exercises.get('e1'))?.deviceId).toBe('pc')

    // Phone answers a card and edits the cahier; PC edits an exercise.
    await as('phone', async () => {
      await phone.reviewLogs.add(log('l2', 'e2', T0 + 3))
      await phone.cahiers.update('c1', { name: 'Biologie', updatedAt: T0 + 3 })
    })
    await as('pc', () => pc.exercises.update('e1', { tags: ['pc'], updatedAt: T0 + 4 }))

    const r3 = await syncOnce(folder, { database: phone, deviceId: 'phone', deviceName: 'Tél', now: T0 + 5 })
    expect(r3.pushedRows).toBe(2)
    expect(r3.snapshotWritten).toBe(false)
    m = await manifestOf(folder)
    expect(m.changes.map((c) => c.name)).toEqual(['changes-phone-1.json'])

    const r4 = await syncOnce(folder, { database: pc, deviceId: 'pc', deviceName: 'PC', now: T0 + 6 })
    expect(r4.pulled?.added.reviewLogs).toBe(1)
    expect((await pc.cahiers.get('c1'))?.name).toBe('Biologie')
    expect(r4.pushedRows).toBe(1)
    m = await manifestOf(folder)
    expect(m.changes.map((c) => c.name)).toEqual(['changes-phone-1.json', 'changes-pc-1.json'])

    const r5 = await syncOnce(folder, { database: phone, deviceId: 'phone', deviceName: 'Tél', now: T0 + 7 })
    expect((await phone.exercises.get('e1'))?.tags).toEqual(['pc'])
    expect(r5.pushedRows).toBe(0)
    // Nothing more to do: a round with no changes writes only the manifest (lastSeen).
    const before = folder.writes
    await syncOnce(folder, { database: phone, deviceId: 'phone', deviceName: 'Tél', now: T0 + 8 })
    expect(folder.writes - before).toBe(1)
  })

  it('a deletion on one device deletes on the other; the cursor keeps what was applied', async () => {
    const folder = new MemoryProvider()
    const pc = open()
    const phone = open()
    await as('pc', () => pc.exercises.bulkAdd([exercise('e1', T0), exercise('e2', T0)]))
    await syncOnce(folder, { database: pc, deviceId: 'pc', now: T0 + 1 })
    await syncOnce(folder, { database: phone, deviceId: 'phone', now: T0 + 2 })
    await as('phone', () => phone.transaction('rw', phone.exercises, phone.tombstones, async () => {
      await phone.tombstones.put({ table: 'exercises', id: 'e2', deletedAt: T0 + 3, deviceId: 'phone' })
      await phone.exercises.delete('e2')
    }))
    await syncOnce(folder, { database: phone, deviceId: 'phone', now: T0 + 4 })
    await syncOnce(folder, { database: pc, deviceId: 'pc', now: T0 + 5 })
    expect(await pc.exercises.get('e2')).toBeUndefined()
    expect(await pc.tombstones.count()).toBe(1)
    const cursor = await getSyncCursor('memory', pc)
    expect(cursor.applied.phone).toBe(1)
    expect(cursor.appliedSnapshotSeq).toBe(1)
    expect(cursor.mark).toBe(T0 + 5)
  })

  it('rewrites a snapshot after 500 changed rows or 7 days and drops the folded lots', async () => {
    const folder = new MemoryProvider()
    const pc = open()
    await as('pc', () => pc.exercises.add(exercise('e1', T0)))
    await syncOnce(folder, { database: pc, deviceId: 'pc', now: T0 })
    await as('pc', () => pc.exercises.bulkAdd(Array.from({ length: 501 }, (_, i) => exercise(`x${i}`, T0 + 1))))
    const r = await syncOnce(folder, { database: pc, deviceId: 'pc', now: T0 + 2 })
    expect(r.snapshotWritten).toBe(true)
    let m = await manifestOf(folder)
    expect(m.snapshot?.seq).toBe(2)
    expect(m.changes).toEqual([])

    await as('pc', () => pc.exercises.update('e1', { tags: ['t'], updatedAt: T0 + 3 }))
    await syncOnce(folder, { database: pc, deviceId: 'pc', now: T0 + 4 })
    m = await manifestOf(folder)
    expect(m.changes).toHaveLength(1)
    await as('pc', () => pc.exercises.update('e1', { tags: ['u'], updatedAt: T0 + 8 * DAY }))
    const r2 = await syncOnce(folder, { database: pc, deviceId: 'pc', now: T0 + 8 * DAY })
    expect(r2.snapshotWritten).toBe(true)
    m = await manifestOf(folder)
    expect(m.snapshot?.seq).toBe(3)
    const names = Object.keys(folder.snapshot()).sort()
    // Lots folded, previous snapshot kept one generation, older one gone.
    expect(names).toEqual(['manifest.json', 'snapshot-2.json', 'snapshot-3.json'])
  })
})

describe('ETag conflicts on the manifest', () => {
  it('retries when another device wrote the manifest in between, and ends up with both lots', async () => {
    const folder = new MemoryProvider()
    const pc = open()
    const phone = open()
    await as('pc', () => pc.exercises.add(exercise('e1', T0)))
    await syncOnce(folder, { database: pc, deviceId: 'pc', now: T0 })
    await syncOnce(folder, { database: phone, deviceId: 'phone', now: T0 + 1 })
    await as('pc', () => pc.exercises.update('e1', { tags: ['pc'], updatedAt: T0 + 2 }))
    await as('phone', () => phone.exercises.add(exercise('e9', T0 + 2)))

    // While the PC syncs, the phone sneaks a round in just before the PC writes the manifest.
    let intruded = false
    folder.onBeforeWrite = async (name) => {
      if (name === MANIFEST_NAME && !intruded) {
        intruded = true
        folder.onBeforeWrite = undefined
        await syncOnce(folder, { database: phone, deviceId: 'phone', now: T0 + 3 })
      }
    }
    const r = await syncOnce(folder, { database: pc, deviceId: 'pc', now: T0 + 4 })
    expect(r.attempts).toBe(2)
    expect(r.pulled?.added.exercises).toBe(1)
    const m = await manifestOf(folder)
    expect(m.changes.map((c) => c.deviceId).sort()).toEqual(['pc', 'phone'])
    // The lot written by the failed attempt was cleaned up: one lot per device.
    expect(Object.keys(folder.snapshot()).filter((f) => f.startsWith('changes-pc')).length).toBe(1)
    expect(await pc.exercises.get('e9')).toBeDefined()
  })

  it('gives up after three attempts when the manifest keeps changing', async () => {
    const folder = new MemoryProvider()
    const pc = open()
    await as('pc', () => pc.exercises.add(exercise('e1', T0)))
    await syncOnce(folder, { database: pc, deviceId: 'pc', now: T0 })
    let tries = 0
    const intrude = async (name: string) => {
      if (name !== MANIFEST_NAME) return
      tries++
      const cur = await folder.read(MANIFEST_NAME)
      folder.onBeforeWrite = undefined
      await folder.write(MANIFEST_NAME, cur!.text, cur!.etag)
      folder.onBeforeWrite = intrude
    }
    folder.onBeforeWrite = intrude
    await as('pc', () => pc.exercises.update('e1', { tags: ['x'], updatedAt: T0 + 1 }))
    await expect(syncOnce(folder, { database: pc, deviceId: 'pc', now: T0 + 2 })).rejects.toThrow(/3 tentatives/)
    expect(tries).toBe(MAX_ATTEMPTS)
  })
})

describe('localChanges', () => {
  it('keeps only this device’s rows after the mark, and unstamped rows (pre-v6) count as ours', () => {
    const state = {
      cahiers: [
        { id: 'a', name: 'a', color: '', createdAt: 1, updatedAt: 10, deviceId: 'pc' },
        { id: 'b', name: 'b', color: '', createdAt: 1, updatedAt: 10, deviceId: 'phone' },
        { id: 'c', name: 'c', color: '', createdAt: 1, updatedAt: 3, deviceId: 'pc' },
        { id: 'd', name: 'd', color: '', createdAt: 1, updatedAt: 10 },
      ],
      chapitres: [],
      exercises: [],
      points: [],
      supplements: [],
      mindmaps: [],
      reviewLogs: [log('l1', 'e', 10), { ...log('l2', 'e', 10), deviceId: 'phone' }],
      tombstones: [{ table: 'cahiers' as const, id: 'z', deletedAt: 10, deviceId: 'phone' }],
      settings: { theme: 'dark' as const, newPerDay: 4 },
      settingsStamps: { theme: 10, newPerDay: 2 },
    }
    const d = localChanges(state, 5, 'pc')
    expect(d.cahiers.map((c) => c.id)).toEqual(['a', 'd'])
    expect(d.reviewLogs.map((l) => l.id)).toEqual(['l1'])
    expect(d.tombstones).toEqual([])
    expect(d.settings).toEqual({ theme: 'dark' })
  })
})
