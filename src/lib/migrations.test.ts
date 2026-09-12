import { describe, expect, it } from 'vitest'
import { BackupFormatError, SCHEMA_VERSION, attemptToReviewLog, historyByExercise, migrateBackup, upgradeExercise, upgradeExerciseV3, upgradeExerciseV4, type LegacyAttempt } from './migrations'

const T0 = 1_700_000_000_000
const DAY = 86_400_000

const attempt: LegacyAttempt = {
  id: 7,
  exerciseId: 'ex1',
  cahierId: 'c1',
  chapitreId: 'ch1',
  ts: T0,
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
  srs: { ease: 2.5, interval: 3, due: T0 + 2 * DAY, reps: 2, lapses: 0 },
  createdAt: T0 - 10 * DAY,
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

describe('upgradeExerciseV3', () => {
  it('adds the v3 fields with safe defaults and is idempotent', () => {
    const up = upgradeExerciseV3(legacyExercise)
    expect(up.pointId).toBeNull()
    expect(up.status).toBe('active')
    expect(up.origin).toBe('claude')
    expect(up.updatedAt).toBe(legacyExercise.createdAt)
    expect(up.srs).toEqual(legacyExercise.srs) // untouched until v4
    const v3 = { ...legacyExercise, pointId: 'p1', status: 'leech' as const, origin: 'manual' as const, updatedAt: 5 }
    expect(upgradeExerciseV3(v3)).toEqual(v3)
  })
})

describe('upgradeExerciseV4 (SM-2 → FSRS)', () => {
  it('converts from the SM-2 fields when there is no history, keeping the due date', () => {
    const up = upgradeExerciseV4(upgradeExerciseV3(legacyExercise), [], T0)
    expect('srs' in up).toBe(false)
    expect(up.fsrs.due).toBe(legacyExercise.srs.due)
    expect(up.fsrs.state).toBe(2)
    expect(up.fsrs.stability).toBe(3)
    expect(up.fsrs.reps).toBe(2)
  })

  it('replays the history when there is one, still keeping the SM-2 due date', () => {
    const history = [
      { rating: 3 as const, ts: T0 - 9 * DAY },
      { rating: 3 as const, ts: T0 - 8 * DAY },
      { rating: 3 as const, ts: T0 - 5 * DAY },
    ]
    const up = upgradeExerciseV4(upgradeExerciseV3(legacyExercise), history, T0)
    expect(up.fsrs.reps).toBe(3)
    expect(up.fsrs.state).toBe(2)
    expect(up.fsrs.stability).toBeGreaterThan(0)
    expect(up.fsrs.due).toBe(legacyExercise.srs.due)
    // Replay is deterministic.
    expect(upgradeExerciseV4(upgradeExerciseV3(legacyExercise), history, T0).fsrs).toEqual(up.fsrs)
  })

  it('leaves an exercise that already has an FSRS state untouched (minus the legacy srs)', () => {
    const v4 = { ...upgradeExercise(legacyExercise, [], T0), srs: legacyExercise.srs }
    const again = upgradeExerciseV4(v4, [{ rating: 1, ts: T0 }], T0)
    expect(again.fsrs).toEqual(v4.fsrs)
    expect('srs' in again).toBe(false)
  })

  it('gives a brand-new card to a row with neither srs nor fsrs', () => {
    const { srs: _srs, ...bare } = legacyExercise
    const up = upgradeExercise(bare, [], T0)
    expect(up.fsrs.state).toBe(0)
    expect(up.fsrs.due).toBe(bare.createdAt)
  })
})

describe('historyByExercise', () => {
  it('keeps only scheduling answers, grouped and sorted by time', () => {
    const map = historyByExercise([
      { exerciseId: 'a', rating: 3, ts: 30, affectsScheduling: true },
      { exerciseId: 'a', rating: 1, ts: 10, affectsScheduling: true },
      { exerciseId: 'a', rating: 4, ts: 20, affectsScheduling: false },
      { exerciseId: 'b', rating: 2, ts: 5, affectsScheduling: true },
    ])
    expect(map.get('a')).toEqual([
      { rating: 1, ts: 10 },
      { rating: 3, ts: 30 },
    ])
    expect(map.get('b')).toEqual([{ rating: 2, ts: 5 }])
  })
})

describe('migrateBackup', () => {
  const v1 = {
    app: 'cahiers',
    version: 1,
    exportedAt: T0,
    cahiers: [{ id: 'c1', name: 'Bio', color: '#000', createdAt: 1, updatedAt: 1 }],
    chapitres: [{ id: 'ch1', cahierId: 'c1', title: 'F', content: 'x', source: 'paste', createdAt: 1, updatedAt: 1 }],
    exercises: [legacyExercise],
    attempts: [attempt, { ...attempt, id: 8, ts: T0 + DAY, grade: 'again', correct: false, mode: 'chrono' }],
    settings: { id: 'app', theme: 'dark', chronoSeconds: 90, chronoCount: 10, promptCounts: { flashcard: 10 } },
  }

  it('upgrades a v1 file: attempts become review logs, exercises get FSRS from the replayed log, settings are completed', () => {
    const out = migrateBackup(v1, T0 + 2 * DAY)
    expect(out.schemaVersion).toBe(SCHEMA_VERSION)
    expect(out.version).toBe(4)
    expect(out.reviewLogs).toHaveLength(2)
    expect(out.reviewLogs[1].rating).toBe(1)
    expect(out.reviewLogs[1].mode).toBe('chrono')
    const ex = out.exercises[0]
    expect(ex.status).toBe('active')
    expect(ex.fsrs.reps).toBe(2) // two attempts replayed
    // An "Again" while the card is still in the learning steps is not a lapse in FSRS.
    expect(ex.fsrs.lapses).toBe(0)
    expect(ex.fsrs.state).toBe(1)
    expect(ex.fsrs.due).toBe(legacyExercise.srs.due)
    expect('srs' in ex).toBe(false)
    expect(out.points).toEqual([])
    expect(out.settings.theme).toBe('dark')
    expect(out.settings.promptTypes).toHaveLength(6)
    expect(out.settings.desiredRetention).toBe(0.9)
    expect(out.settings.id).toBe('app')
  })

  it('upgrades a v2 file and keeps supplements and mindmaps', () => {
    const v2 = { ...v1, version: 2, supplements: [{ id: 's1' }], mindmaps: [{ id: 'm1' }] }
    const out = migrateBackup(v2)
    expect(out.supplements).toHaveLength(1)
    expect(out.mindmaps).toHaveLength(1)
    expect(out.reviewLogs).toHaveLength(2)
  })

  it('upgrades a v3 file (reviewLogs + srs) and merges stray attempts', () => {
    const v3 = {
      app: 'cahiers',
      version: 3,
      schemaVersion: 3,
      exportedAt: 1,
      cahiers: [],
      chapitres: [],
      exercises: [legacyExercise],
      points: [{ id: 'p1', chapitreId: 'ch1', cahierId: 'c1', anchor: 'a', title: 't', nature: 'formule', order: 0, createdAt: 1 }],
      reviewLogs: [{ id: 'l1', exerciseId: 'ex1', chapitreId: 'ch1', cahierId: 'c1', ts: T0, rating: 3, correct: true, durationMs: 1, mode: 'review' }],
      attempts: [{ ...attempt, ts: T0 + DAY }],
      supplements: [],
      mindmaps: [],
      settings: { id: 'app' },
    }
    const out = migrateBackup(v3, T0 + 2 * DAY)
    expect(out.points).toHaveLength(1)
    expect(out.reviewLogs).toHaveLength(2)
    expect(out.reviewLogs[0].id).toBe('l1')
    expect(out.reviewLogs[0].affectsScheduling).toBe(true)
    expect(out.reviewLogs[0].fsrsLog).toBeNull()
    expect(out.exercises[0].fsrs.reps).toBe(2)
  })

  it('is stable: migrating an already migrated file changes nothing', () => {
    const once = migrateBackup(v1, T0)
    const twice = migrateBackup(once, T0 + 5 * DAY)
    expect(twice.exercises).toEqual(once.exercises)
    expect(twice.reviewLogs).toEqual(once.reviewLogs)
    expect(twice.settings).toEqual(once.settings)
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
