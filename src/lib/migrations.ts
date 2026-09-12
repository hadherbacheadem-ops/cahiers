// ---------------------------------------------------------------------------
// Schema migrations, as pure functions so they can be unit-tested and shared
// between the Dexie upgrade hooks and the JSON backup importer.
//
// History
//   v1  cahiers / chapitres / exercises / attempts / settings
//   v2  + supplements, mindmaps
//   v3  attempts → reviewLogs (rating, mode, affectsScheduling, fsrsLog),
//       exercises + pointId / status / origin / updatedAt, + points table
//   v4  SM-2 `srs` → FSRS `fsrs` on exercises (replayed from the review log
//       when one exists, converted otherwise; due dates are preserved)
//   v5  (no change of shape)
//   v6  sync: `deviceId` on every synced row, `updatedAt` on points and
//       supplements, `tombstones` table, per-key settings stamps
// ---------------------------------------------------------------------------

import type { Cahier, Chapitre, Exercise, FsrsCard, Grade, LegacySrsState, Mindmap, PointDeCours, Rating, ReviewLog, Settings, Supplement, Tombstone, TrainMode } from '../types'
import { DEFAULT_SETTINGS, GRADE_TO_RATING } from '../types'
import { uid } from './ids'
import { fromSm2, newCard, replayHistory, type HistoryItem } from './fsrs'

export const SCHEMA_VERSION = 6

/** Shape of the `attempts` rows written by schema versions 1 and 2. */
export interface LegacyAttempt {
  id?: number
  exerciseId: string
  cahierId: string
  chapitreId: string
  ts: number
  correct: boolean
  grade: Grade
  mode: TrainMode
  durationMs: number
}

const VALID_GRADES: Grade[] = ['again', 'hard', 'good', 'easy']

function ratingFor(a: LegacyAttempt): Rating {
  if (VALID_GRADES.includes(a.grade)) return GRADE_TO_RATING[a.grade]
  return a.correct ? 3 : 1
}

/**
 * Historical attempts all moved the SM-2 state (even chrono ones), so
 * `affectsScheduling` is true for every migrated row: replaying the log must
 * reproduce what actually happened.
 */
export function attemptToReviewLog(a: LegacyAttempt): ReviewLog {
  return {
    id: uid(),
    exerciseId: a.exerciseId,
    chapitreId: a.chapitreId,
    cahierId: a.cahierId,
    ts: typeof a.ts === 'number' ? a.ts : Date.parse(String(a.ts)) || 0,
    rating: ratingFor(a),
    correct: !!a.correct,
    durationMs: Math.max(0, Math.round(Number(a.durationMs) || 0)),
    mode: a.mode === 'review' || a.mode === 'chrono' ? a.mode : 'practice',
    fsrsLog: null,
    affectsScheduling: true,
  }
}

/** Exercise row as written by schema ≤ 3 (SM-2 state), possibly partially upgraded. */
export type LegacyExerciseRow = Partial<Exercise> & { id: string; srs?: LegacySrsState }

/** v3: pointId / status / origin / updatedAt. Idempotent. */
export function upgradeExerciseV3<T extends LegacyExerciseRow>(e: T): T & Pick<Exercise, 'pointId' | 'status' | 'origin' | 'updatedAt'> {
  return {
    ...e,
    pointId: e.pointId ?? null,
    status: e.status ?? 'active',
    origin: e.origin ?? 'claude',
    updatedAt: e.updatedAt ?? e.createdAt ?? Date.now(),
  }
}

const REPLAY_OPTIONS = { desiredRetention: DEFAULT_SETTINGS.desiredRetention, maximumInterval: DEFAULT_SETTINGS.maximumInterval }

/**
 * v4: SM-2 → FSRS. With a history, the memory state (stability, difficulty,
 * reps, lapses, state) is rebuilt by replaying the answers; without one, it is
 * approximated from the SM-2 fields. In both cases the SM-2 due date is kept so
 * the switch changes nothing in the user's schedule (gradual transition).
 * Rows that already carry `fsrs` are returned untouched, minus the legacy `srs`.
 */
export function upgradeExerciseV4(e: LegacyExerciseRow, history: HistoryItem[] = [], now = Date.now()): Exercise {
  const { srs, ...rest } = e
  if (rest.fsrs) return rest as Exercise
  const legacy: LegacySrsState = srs ?? { ease: 2.5, interval: 0, due: e.createdAt ?? now, reps: 0, lapses: 0 }
  let fsrs: FsrsCard | null = history.length ? replayHistory(history, REPLAY_OPTIONS) : null
  if (fsrs) fsrs = { ...fsrs, due: legacy.due }
  else fsrs = legacy ? fromSm2(legacy, now) : newCard(e.createdAt ?? now)
  return { ...(rest as Exercise), fsrs }
}

/** Full upgrade for a row of any age (backup import). */
export function upgradeExercise(e: LegacyExerciseRow, history: HistoryItem[] = [], now = Date.now()): Exercise {
  return upgradeExerciseV4(upgradeExerciseV3(e), history, now)
}

/** Groups scheduling answers by exercise, oldest first. */
export function historyByExercise(logs: Pick<ReviewLog, 'exerciseId' | 'rating' | 'ts' | 'affectsScheduling'>[]): Map<string, HistoryItem[]> {
  const map = new Map<string, HistoryItem[]>()
  for (const l of logs) {
    if (!l.affectsScheduling) continue
    const list = map.get(l.exerciseId) ?? []
    list.push({ rating: l.rating, ts: l.ts })
    map.set(l.exerciseId, list)
  }
  for (const list of map.values()) list.sort((a, b) => a.ts - b.ts)
  return map
}

// ---- Backup files ----------------------------------------------------------

/** Current on-disk format. `version` is kept for readers of older builds; `schemaVersion` is authoritative. */
export interface BackupFile {
  app: 'cahiers'
  version: typeof SCHEMA_VERSION
  schemaVersion: typeof SCHEMA_VERSION
  exportedAt: number
  cahiers: Cahier[]
  chapitres: Chapitre[]
  exercises: Exercise[]
  reviewLogs: ReviewLog[]
  points: PointDeCours[]
  supplements: Supplement[]
  mindmaps: Mindmap[]
  settings: Settings
  /** v6: deletions still to propagate, and when each setting key last changed. Absent in older files. */
  tombstones?: Tombstone[]
  settingsStamps?: Record<string, number>
}

export class BackupFormatError extends Error {}

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}

/**
 * Upgrades any backup ever written by the app to the current schema.
 * Throws BackupFormatError on files that are not Cahiers backups.
 */
export function migrateBackup(raw: unknown, now = Date.now()): BackupFile {
  if (!raw || typeof raw !== 'object') throw new BackupFormatError('Ce fichier n’est pas une sauvegarde Cahiers.')
  const f = raw as Record<string, unknown>
  if (f.app !== 'cahiers') throw new BackupFormatError('Ce fichier n’est pas une sauvegarde Cahiers.')

  const declared = Number(f.schemaVersion ?? f.version ?? 1)
  if (!Number.isFinite(declared) || declared < 1) throw new BackupFormatError('Version de sauvegarde illisible.')
  if (declared > SCHEMA_VERSION) throw new BackupFormatError(`Cette sauvegarde vient d’une version plus récente de l’application (schéma ${declared}, attendu ≤ ${SCHEMA_VERSION}).`)

  // v1/v2 shipped `attempts`; v3+ ships `reviewLogs`. A file may carry both if
  // it was produced by hand — merge them, never drop data.
  const reviewLogs: ReviewLog[] = [
    ...asArray<ReviewLog>(f.reviewLogs).map((l) => ({ ...l, id: l.id ?? uid(), fsrsLog: l.fsrsLog ?? null, affectsScheduling: l.affectsScheduling ?? true })),
    ...asArray<LegacyAttempt>(f.attempts).map(attemptToReviewLog),
  ]

  const history = historyByExercise(reviewLogs)
  const exercises = asArray<LegacyExerciseRow>(f.exercises).map((e) => upgradeExercise(e, history.get(e.id) ?? [], now))

  const settings = { ...DEFAULT_SETTINGS, ...((f.settings as Partial<Settings>) ?? {}), id: 'app' as const }

  const tombstones = asArray<Tombstone>(f.tombstones).filter((t) => t && typeof t.id === 'string' && typeof t.table === 'string' && typeof t.deletedAt === 'number')
  const settingsStamps = f.settingsStamps && typeof f.settingsStamps === 'object' ? (f.settingsStamps as Record<string, number>) : undefined

  return {
    app: 'cahiers',
    version: SCHEMA_VERSION,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: typeof f.exportedAt === 'number' ? f.exportedAt : now,
    cahiers: asArray<Cahier>(f.cahiers),
    chapitres: asArray<Chapitre>(f.chapitres),
    exercises,
    reviewLogs,
    // v6: points and supplements are stamped so the merge can compare them.
    points: asArray<PointDeCours>(f.points).map((p) => ({ ...p, updatedAt: p.updatedAt ?? p.createdAt })),
    supplements: asArray<Supplement>(f.supplements).map((s) => ({ ...s, updatedAt: s.updatedAt ?? s.createdAt })),
    mindmaps: asArray<Mindmap>(f.mindmaps),
    settings,
    tombstones,
    settingsStamps,
  }
}
