// ---------------------------------------------------------------------------
// Schema migrations, as pure functions so they can be unit-tested and shared
// between the Dexie upgrade hooks and the JSON backup importer.
//
// History
//   v1  cahiers / chapitres / exercises / attempts / settings
//   v2  + supplements, mindmaps
//   v3  attempts → reviewLogs (rating, mode, affectsScheduling, fsrsLog),
//       exercises + pointId / status / origin / updatedAt, + points table
// ---------------------------------------------------------------------------

import type { Cahier, Chapitre, Exercise, Grade, Mindmap, PointDeCours, Rating, ReviewLog, Settings, Supplement, TrainMode } from '../types'
import { DEFAULT_SETTINGS, GRADE_TO_RATING } from '../types'
import { uid } from './ids'

export const SCHEMA_VERSION = 3

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

/** Fills the v3 fields of an exercise row written by an older schema. Idempotent. */
export function upgradeExercise(e: Partial<Exercise> & { id: string }): Exercise {
  const row = e as Exercise
  return {
    ...row,
    pointId: row.pointId ?? null,
    status: row.status ?? 'active',
    origin: row.origin ?? 'claude',
    updatedAt: row.updatedAt ?? row.createdAt ?? Date.now(),
  }
}

// ---- Backup files ----------------------------------------------------------

/** Current on-disk format. `version` is kept for readers of older builds; `schemaVersion` is authoritative. */
export interface BackupFile {
  app: 'cahiers'
  version: 3
  schemaVersion: 3
  exportedAt: number
  cahiers: Cahier[]
  chapitres: Chapitre[]
  exercises: Exercise[]
  reviewLogs: ReviewLog[]
  points: PointDeCours[]
  supplements: Supplement[]
  mindmaps: Mindmap[]
  settings: Settings
}

export class BackupFormatError extends Error {}

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}

/**
 * Upgrades any backup ever written by the app to the current schema.
 * Throws BackupFormatError on files that are not Cahiers backups.
 */
export function migrateBackup(raw: unknown): BackupFile {
  if (!raw || typeof raw !== 'object') throw new BackupFormatError('Ce fichier n’est pas une sauvegarde Cahiers.')
  const f = raw as Record<string, unknown>
  if (f.app !== 'cahiers') throw new BackupFormatError('Ce fichier n’est pas une sauvegarde Cahiers.')

  const declared = Number(f.schemaVersion ?? f.version ?? 1)
  if (!Number.isFinite(declared) || declared < 1) throw new BackupFormatError('Version de sauvegarde illisible.')
  if (declared > SCHEMA_VERSION) throw new BackupFormatError(`Cette sauvegarde vient d’une version plus récente de l’application (schéma ${declared}, attendu ≤ ${SCHEMA_VERSION}).`)

  const exercises = asArray<Partial<Exercise> & { id: string }>(f.exercises).map(upgradeExercise)

  // v1/v2 shipped `attempts`; v3 ships `reviewLogs`. A v3 file may still carry an
  // `attempts` array if it was produced by hand — merge both, never drop data.
  const reviewLogs: ReviewLog[] = [
    ...asArray<ReviewLog>(f.reviewLogs).map((l) => ({ ...l, id: l.id ?? uid(), fsrsLog: l.fsrsLog ?? null, affectsScheduling: l.affectsScheduling ?? true })),
    ...asArray<LegacyAttempt>(f.attempts).map(attemptToReviewLog),
  ]

  const settings = { ...DEFAULT_SETTINGS, ...((f.settings as Partial<Settings>) ?? {}), id: 'app' as const }

  return {
    app: 'cahiers',
    version: 3,
    schemaVersion: 3,
    exportedAt: typeof f.exportedAt === 'number' ? f.exportedAt : Date.now(),
    cahiers: asArray<Cahier>(f.cahiers),
    chapitres: asArray<Chapitre>(f.chapitres),
    exercises,
    reviewLogs,
    points: asArray<PointDeCours>(f.points),
    supplements: asArray<Supplement>(f.supplements),
    mindmaps: asArray<Mindmap>(f.mindmaps),
    settings,
  }
}
