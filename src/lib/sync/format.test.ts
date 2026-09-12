import { describe, expect, it } from 'vitest'
import { SCHEMA_VERSION } from '../migrations'
import { countRows, emptyManifest, makeChanges, makeSnapshot, parseManifest, parseSyncFile, stateFromBackup, SyncFormatError } from './format'
import { emptyState } from './merge'

const T0 = Date.UTC(2026, 8, 1)

describe('sync files', () => {
  it('round-trips a snapshot and a change lot', () => {
    const state = { ...emptyState(), cahiers: [{ id: 'c', name: 'Bio', color: '#000', createdAt: T0, updatedAt: T0, deviceId: 'pc' }], settings: { newPerDay: 7 }, settingsStamps: { newPerDay: T0 } }
    const snap = parseSyncFile(JSON.parse(JSON.stringify(makeSnapshot(state, 'pc', 3, T0))))
    expect(snap.kind).toBe('snapshot')
    expect(snap.seq).toBe(3)
    expect(snap.cahiers).toHaveLength(1)
    expect(snap.settings).toEqual({ newPerDay: 7 })
    expect(snap.settingsStamps).toEqual({ newPerDay: T0 })
    const lot = parseSyncFile(JSON.parse(JSON.stringify(makeChanges(state, 'phone', 1, T0 - 1, T0))))
    expect(lot.kind).toBe('changes')
    expect((lot as { since: number }).since).toBe(T0 - 1)
    expect(countRows(lot)).toBe(2)
  })

  it('refuses a corrupted file', () => {
    expect(() => parseSyncFile('not json object')).toThrow(SyncFormatError)
    expect(() => parseSyncFile({ app: 'other' })).toThrow(SyncFormatError)
    expect(() => parseSyncFile({ app: 'cahiers', kind: 'snapshot', schemaVersion: SCHEMA_VERSION, deviceId: 'pc', seq: 1, exercises: 'oops' })).toThrow(/corrompu/)
    expect(() => parseSyncFile({ app: 'cahiers', kind: 'snapshot', schemaVersion: SCHEMA_VERSION, seq: 1 })).toThrow(/en-tête/)
  })

  it('refuses a file from a newer schema', () => {
    expect(() => parseSyncFile({ app: 'cahiers', kind: 'snapshot', schemaVersion: SCHEMA_VERSION + 1, deviceId: 'pc', seq: 1 })).toThrow(/plus récente/)
    expect(() => parseManifest({ app: 'cahiers', kind: 'manifest', schemaVersion: SCHEMA_VERSION + 1 })).toThrow(/plus récente/)
  })

  it('upgrades a file written by an older schema (SM-2 exercises, no tombstones)', () => {
    const old = {
      app: 'cahiers',
      kind: 'snapshot',
      schemaVersion: 3,
      deviceId: 'pc',
      seq: 1,
      writtenAt: T0,
      exercises: [{ id: 'e', chapitreId: 'ch', cahierId: 'c', type: 'flashcard', data: { type: 'flashcard', question: 'Q', answer: 'A' }, difficulty: 1, tags: [], srs: { ease: 2.5, interval: 0, due: T0, reps: 0, lapses: 0 }, createdAt: T0 }],
      points: [{ id: 'p', chapitreId: 'ch', cahierId: 'c', anchor: '', title: 't', nature: 'definition', order: 0, createdAt: T0 }],
      settings: { theme: 'light' },
    }
    const f = parseSyncFile(old)
    expect(f.exercises[0].fsrs).toBeDefined()
    expect((f.exercises[0] as { srs?: unknown }).srs).toBeUndefined()
    expect(f.points[0].updatedAt).toBe(T0)
    expect(f.tombstones).toEqual([])
    expect(f.settingsStamps).toEqual({ theme: T0 })
  })

  it('reads a manifest and tolerates missing parts', () => {
    const m = parseManifest({ app: 'cahiers', kind: 'manifest', schemaVersion: SCHEMA_VERSION, changes: [{ name: 'changes-pc-1.json', deviceId: 'pc', seq: 1, writtenAt: T0, count: 3 }, { bad: true }] })
    expect(m.snapshot).toBeNull()
    expect(m.changes).toHaveLength(1)
    expect(m.devices).toEqual({})
    expect(() => parseManifest({})).toThrow(SyncFormatError)
    expect(emptyManifest().schemaVersion).toBe(SCHEMA_VERSION)
  })

  it('turns an older backup into a state whose settings are stamped at the export time', () => {
    const state = stateFromBackup({
      app: 'cahiers',
      version: SCHEMA_VERSION,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: T0,
      cahiers: [],
      chapitres: [],
      exercises: [],
      reviewLogs: [],
      points: [],
      supplements: [],
      mindmaps: [],
      settings: { id: 'app', theme: 'dark', newPerDay: 3 } as never,
    })
    expect(state.settings).toEqual({ theme: 'dark', newPerDay: 3 })
    expect(state.settingsStamps).toEqual({ theme: T0, newPerDay: T0 })
    expect(state.tombstones).toEqual([])
  })
})
