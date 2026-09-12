import { describe, expect, it } from 'vitest'
import { BackupFormatError, SCHEMA_VERSION, attemptToReviewLog, migrateBackup, upgradeExercise, type LegacyAttempt } from './migrations'

const attempt: LegacyAttempt = {
  id: 7,
  exerciseId: 'ex1',
  cahierId: 'c1',
  chapitreId: 'ch1',
  ts: 1_700_000_000_000,
  correct: true,
  grade: 'good',
  mode: 'review',
  durationMs: 4200.6,
}

const legacyExercise = {
  id: 'ex1',
  chapitreId: 'ch1',
  cahierId: 'c1',
  type: 'flashcard' as const,
  data: { type: 'flashcard' as const, question: 'Q', answer: 'A' },
  difficulty: 2 as const,
  tags: ['t'],
  srs: { ease: 2.5, interval: 3, due: 1_700_000_000_000, reps: 2, lapses: 0 },
  createdAt: 1_699_000_000_000,
}

describe('attemptToReviewLog', () => {
  it('maps grades onto FSRS ratings and keeps the historical scheduling effect', () => {
    const log = attemptToReviewLog(attempt)
    expect(log.rating).toBe(3)
    expect(log.correct).toBe(true)
    expect(log.mode).toBe('review')
    expect(log.durationMs).toBe(4201)
    expect(log.affectsScheduling).toBe(true)
    expect(log.fsrsLog).toBeNull()
    expect(log.id).toMatch(/[0-9a-f-]{20,}/)
    expect(attemptToReviewLog({ ...attempt, grade: 'again', correct: false }).rating).toBe(1)
    expect(attemptToReviewLog({ ...attempt, grade: 'hard' }).rating).toBe(2)
    expect(attemptToReviewLog({ ...attempt, grade: 'easy' }).rating).toBe(4)
  })

  it('falls back on correctness when the grade is missing or unknown', () => {
    const broken = { ...attempt, grade: 'weird' as LegacyAttempt['grade'] }
    expect(attemptToReviewLog(broken).rating).toBe(3)
    expect(attemptToReviewLog({ ...broken, correct: false }).rating).toBe(1)
    expect(attemptToReviewLog({ ...attempt, mode: 'nope' as LegacyAttempt['mode'] }).mode).toBe('practice')
  })
})

describe('upgradeExercise', () => {
  it('adds the v3 fields with safe defaults', () => {
    const up = upgradeExercise(legacyExercise)
    expect(up.pointId).toBeNull()
    expect(up.status).toBe('active')
    expect(up.origin).toBe('claude')
    expect(up.updatedAt).toBe(legacyExercise.createdAt)
    expect(up.srs).toEqual(legacyExercise.srs)
  })

  it('is idempotent and never overwrites present values', () => {
    const v3 = { ...legacyExercise, pointId: 'p1', status: 'leech' as const, origin: 'manual' as const, updatedAt: 5 }
    expect(upgradeExercise(v3)).toEqual(v3)
    expect(upgradeExercise(upgradeExercise(legacyExercise))).toEqual(upgradeExercise(legacyExercise))
  })
})

describe('migrateBackup', () => {
  const v1 = {
    app: 'cahiers',
    version: 1,
    exportedAt: 1_700_000_000_000,
    cahiers: [{ id: 'c1', name: 'Bio', color: '#000', createdAt: 1, updatedAt: 1 }],
    chapitres: [{ id: 'ch1', cahierId: 'c1', title: 'F', content: 'x', source: 'paste', createdAt: 1, updatedAt: 1 }],
    exercises: [legacyExercise],
    attempts: [attempt, { ...attempt, id: 8, grade: 'again', correct: false, mode: 'chrono' }],
    settings: { id: 'app', theme: 'dark', chronoSeconds: 90, chronoCount: 10, promptCounts: { flashcard: 10 } },
  }

  it('upgrades a v1 file: attempts become review logs, exercises get v3 fields, settings are completed', () => {
    const out = migrateBackup(v1)
    expect(out.schemaVersion).toBe(SCHEMA_VERSION)
    expect(out.version).toBe(3)
    expect(out.reviewLogs).toHaveLength(2)
    expect(out.reviewLogs[1].rating).toBe(1)
    expect(out.reviewLogs[1].mode).toBe('chrono')
    expect(out.exercises[0].status).toBe('active')
    expect(out.points).toEqual([])
    expect(out.supplements).toEqual([])
    expect(out.mindmaps).toEqual([])
    expect(out.settings.theme).toBe('dark')
    expect(out.settings.promptTypes).toHaveLength(6) // filled from defaults
    expect(out.settings.id).toBe('app')
  })

  it('upgrades a v2 file and keeps supplements and mindmaps', () => {
    const v2 = { ...v1, version: 2, supplements: [{ id: 's1' }], mindmaps: [{ id: 'm1' }] }
    const out = migrateBackup(v2)
    expect(out.supplements).toHaveLength(1)
    expect(out.mindmaps).toHaveLength(1)
    expect(out.reviewLogs).toHaveLength(2)
  })

  it('passes a v3 file through, defaulting the optional log fields, and merges stray attempts', () => {
    const v3 = {
      app: 'cahiers',
      version: 3,
      schemaVersion: 3,
      exportedAt: 1,
      cahiers: [],
      chapitres: [],
      exercises: [],
      points: [{ id: 'p1', chapitreId: 'ch1', cahierId: 'c1', anchor: 'a', title: 't', nature: 'formule', order: 0, createdAt: 1 }],
      reviewLogs: [{ id: 'l1', exerciseId: 'ex1', chapitreId: 'ch1', cahierId: 'c1', ts: 1, rating: 3, correct: true, durationMs: 1, mode: 'review' }],
      attempts: [attempt],
      supplements: [],
      mindmaps: [],
      settings: { id: 'app' },
    }
    const out = migrateBackup(v3)
    expect(out.points).toHaveLength(1)
    expect(out.reviewLogs).toHaveLength(2)
    expect(out.reviewLogs[0].id).toBe('l1')
    expect(out.reviewLogs[0].affectsScheduling).toBe(true)
    expect(out.reviewLogs[0].fsrsLog).toBeNull()
  })

  it('is stable: migrating an already migrated file changes nothing but ids of nothing', () => {
    const once = migrateBackup(v1)
    const twice = migrateBackup(once)
    expect(twice).toEqual(once)
  })

  it('rejects foreign or future files', () => {
    expect(() => migrateBackup(null)).toThrow(BackupFormatError)
    expect(() => migrateBackup({ app: 'anki' })).toThrow(BackupFormatError)
    expect(() => migrateBackup({ app: 'cahiers', schemaVersion: SCHEMA_VERSION + 1 })).toThrow(/plus récente/)
  })

  it('tolerates missing arrays', () => {
    const out = migrateBackup({ app: 'cahiers', version: 1 })
    expect(out.cahiers).toEqual([])
    expect(out.exercises).toEqual([])
    expect(out.reviewLogs).toEqual([])
  })
})
