import Dexie, { type EntityTable } from 'dexie'
import type { Cahier, Chapitre, ChapitreSource, Exercise, ExerciseData, ExerciseOrigin, FsrsCard, Mindmap, MindmapNode, PointDeCours, PointNature, ReviewLog, Settings, Supplement, SupplementKind } from './types'
import { DEFAULT_SETTINGS } from './types'
import { newCard } from './lib/fsrs'
import { uid } from './lib/ids'
import { attemptToReviewLog, historyByExercise, migrateBackup, upgradeExerciseV3, upgradeExerciseV4, type BackupFile, type LegacyAttempt, type LegacyExerciseRow } from './lib/migrations'

export type CahiersDb = Dexie & {
  cahiers: EntityTable<Cahier, 'id'>
  chapitres: EntityTable<Chapitre, 'id'>
  exercises: EntityTable<Exercise, 'id'>
  reviewLogs: EntityTable<ReviewLog, 'id'>
  points: EntityTable<PointDeCours, 'id'>
  settings: EntityTable<Settings, 'id'>
  supplements: EntityTable<Supplement, 'id'>
  mindmaps: EntityTable<Mindmap, 'id'>
}

/**
 * Builds the database with its full version history. Exported as a factory so
 * tests can open throw-away databases; the app uses the `db` singleton below.
 */
export function createDb(name = 'cahiers'): CahiersDb {
  const database = new Dexie(name) as CahiersDb

  database.version(1).stores({
    cahiers: 'id, name, createdAt',
    chapitres: 'id, cahierId, createdAt, onenotePageId',
    exercises: 'id, chapitreId, cahierId, type, srs.due',
    attempts: '++id, exerciseId, cahierId, chapitreId, ts',
    settings: 'id',
  })

  database.version(2).stores({
    supplements: 'id, chapitreId, cahierId, status, createdAt',
    mindmaps: 'id, chapitreId, cahierId, createdAt',
  })

  // v3: attempts → reviewLogs, points de cours, exercise status/origin/pointId.
  database
    .version(3)
    .stores({
      exercises: 'id, chapitreId, cahierId, pointId, type, status, srs.due',
      reviewLogs: 'id, exerciseId, chapitreId, cahierId, ts',
      points: 'id, chapitreId, cahierId',
      attempts: null,
    })
    .upgrade(async (tx) => {
      const attempts = (await tx.table('attempts').toArray()) as LegacyAttempt[]
      await tx.table('reviewLogs').bulkAdd(attempts.map(attemptToReviewLog))
      await tx
        .table('exercises')
        .toCollection()
        .modify((e: LegacyExerciseRow) => Object.assign(e, upgradeExerciseV3(e)))
    })

  // v4: SM-2 → FSRS. Replayed from the review log when the exercise has one.
  database
    .version(4)
    .stores({
      exercises: 'id, chapitreId, cahierId, pointId, type, status, fsrs.due',
    })
    .upgrade(async (tx) => {
      const logs = (await tx.table('reviewLogs').toArray()) as ReviewLog[]
      const history = historyByExercise(logs)
      const now = Date.now()
      await tx
        .table('exercises')
        .toCollection()
        .modify((e: LegacyExerciseRow) => {
          const up = upgradeExerciseV4(e, history.get(e.id) ?? [], now)
          delete e.srs
          Object.assign(e, up)
        })
    })

  return database
}

export const db = createDb()

// ---- Settings --------------------------------------------------------------

export async function getSettings(): Promise<Settings> {
  const stored = await db.settings.get('app')
  return { ...DEFAULT_SETTINGS, ...stored }
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch, id: 'app' as const }
  await db.settings.put(next)
  return next
}

// ---- Cahiers ---------------------------------------------------------------

export async function createCahier(name: string, color: string): Promise<Cahier> {
  const now = Date.now()
  const cahier: Cahier = { id: uid(), name: name.trim(), color, createdAt: now, updatedAt: now }
  await db.cahiers.add(cahier)
  return cahier
}

export async function updateCahier(id: string, patch: Partial<Pick<Cahier, 'name' | 'color' | 'programme' | 'limits'>>) {
  await db.cahiers.update(id, { ...patch, updatedAt: Date.now() })
}

/** Deletes the cahier and everything under it. */
export async function deleteCahier(id: string) {
  await db.transaction('rw', [db.cahiers, db.chapitres, db.exercises, db.reviewLogs, db.points, db.supplements, db.mindmaps], async () => {
    await db.reviewLogs.where('cahierId').equals(id).delete()
    await db.exercises.where('cahierId').equals(id).delete()
    await db.points.where('cahierId').equals(id).delete()
    await db.supplements.where('cahierId').equals(id).delete()
    await db.mindmaps.where('cahierId').equals(id).delete()
    await db.chapitres.where('cahierId').equals(id).delete()
    await db.cahiers.delete(id)
  })
}

// ---- Chapitres -------------------------------------------------------------

export async function createChapitre(input: {
  cahierId: string
  title: string
  content: string
  source: ChapitreSource
  onenotePageId?: string
}): Promise<Chapitre> {
  const now = Date.now()
  const chapitre: Chapitre = {
    id: uid(),
    cahierId: input.cahierId,
    title: input.title.trim() || 'Sans titre',
    content: input.content,
    source: input.source,
    onenotePageId: input.onenotePageId,
    createdAt: now,
    updatedAt: now,
  }
  await db.chapitres.add(chapitre)
  await db.cahiers.update(input.cahierId, { updatedAt: now })
  return chapitre
}

export async function updateChapitre(id: string, patch: Partial<Pick<Chapitre, 'title' | 'content'>>) {
  await db.chapitres.update(id, { ...patch, updatedAt: Date.now() })
}

export async function deleteChapitre(id: string) {
  await db.transaction('rw', [db.chapitres, db.exercises, db.reviewLogs, db.points, db.supplements, db.mindmaps], async () => {
    await db.reviewLogs.where('chapitreId').equals(id).delete()
    await db.exercises.where('chapitreId').equals(id).delete()
    await db.points.where('chapitreId').equals(id).delete()
    await db.supplements.where('chapitreId').equals(id).delete()
    await db.mindmaps.where('chapitreId').equals(id).delete()
    await db.chapitres.delete(id)
  })
}

// ---- Points de cours -------------------------------------------------------

export interface NewPoint {
  anchor: string
  title: string
  nature: PointNature
}

/** Appends points to a fiche, after the existing ones. Returns the stored rows (ids are needed to link exercises). */
export async function addPoints(chapitreId: string, cahierId: string, items: NewPoint[]): Promise<PointDeCours[]> {
  const now = Date.now()
  const existing = await db.points.where('chapitreId').equals(chapitreId).count()
  const rows: PointDeCours[] = items.map((p, i) => ({
    id: uid(),
    chapitreId,
    cahierId,
    anchor: p.anchor.trim().slice(0, 200),
    title: p.title.trim(),
    nature: p.nature,
    order: existing + i,
    createdAt: now + i,
  }))
  await db.points.bulkAdd(rows)
  return rows
}

// ---- Supplements -----------------------------------------------------------

export interface NewSupplement {
  title: string
  kind: SupplementKind
  reason: string
  content: string
}

export async function addSupplements(chapitreId: string, cahierId: string, items: NewSupplement[]): Promise<Supplement[]> {
  const now = Date.now()
  const rows: Supplement[] = items.map((it, i) => ({ id: uid(), chapitreId, cahierId, ...it, status: 'pending', createdAt: now + i }))
  await db.supplements.bulkAdd(rows)
  return rows
}

/** Appends the supplement to the fiche and marks it as kept. */
export async function keepSupplement(id: string) {
  await db.transaction('rw', db.supplements, db.chapitres, async () => {
    const s = await db.supplements.get(id)
    if (!s || s.status === 'kept') return
    const ch = await db.chapitres.get(s.chapitreId)
    if (!ch) return
    // Claude often repeats the title as a heading inside the content: keep a single heading.
    const body = s.content.trim().replace(/^#{1,6}\s+[^\n]*\n?/, '').trim()
    const block = `\n\n## ${s.title}\n${body}`
    await db.chapitres.update(ch.id, { content: ch.content.trimEnd() + block, updatedAt: Date.now() })
    await db.supplements.update(id, { status: 'kept' })
  })
}

export async function discardSupplement(id: string) {
  await db.supplements.delete(id)
}

// ---- Mind maps -------------------------------------------------------------

/** One map per scope (fiche, or whole cahier): saving replaces the previous one. */
export async function saveMindmap(input: { cahierId: string; chapitreId?: string; title: string; root: MindmapNode }): Promise<Mindmap> {
  const now = Date.now()
  return db.transaction('rw', db.mindmaps, async () => {
    const previous = await db.mindmaps
      .where('cahierId')
      .equals(input.cahierId)
      .filter((m) => (m.chapitreId ?? null) === (input.chapitreId ?? null))
      .toArray()
    const id = previous[0]?.id ?? uid()
    await db.mindmaps.bulkDelete(previous.map((m) => m.id))
    const map: Mindmap = { id, cahierId: input.cahierId, chapitreId: input.chapitreId, title: input.title, root: input.root, createdAt: previous[0]?.createdAt ?? now, updatedAt: now }
    await db.mindmaps.put(map)
    return map
  })
}

export async function deleteMindmap(id: string) {
  await db.mindmaps.delete(id)
}

// ---- Exercises -------------------------------------------------------------

export interface NewExercise {
  data: ExerciseData
  difficulty: 1 | 2 | 3
  tags: string[]
  pointId?: string | null
  origin?: ExerciseOrigin
  inverse?: boolean
}

/** Adds exercises. `status` defaults to 'active' until the validation queue lands (phase 2). */
export async function addExercises(chapitreId: string, cahierId: string, items: NewExercise[], status: Exercise['status'] = 'active'): Promise<Exercise[]> {
  const now = Date.now()
  const rows: Exercise[] = items.map((it, i) => ({
    id: uid(),
    chapitreId,
    cahierId,
    pointId: it.pointId ?? null,
    type: it.data.type,
    data: it.data,
    difficulty: it.difficulty,
    tags: it.tags,
    status,
    origin: it.origin ?? 'claude',
    inverse: it.inverse,
    fsrs: newCard(now),
    createdAt: now + i, // keeps insertion order stable when sorting by createdAt
    updatedAt: now + i,
  }))
  await db.exercises.bulkAdd(rows)
  await db.chapitres.update(chapitreId, { updatedAt: now })
  return rows
}

export async function updateExercise(id: string, patch: Partial<Pick<Exercise, 'data' | 'difficulty' | 'tags' | 'status' | 'pointId' | 'fsrs'>>) {
  await db.exercises.update(id, { ...patch, updatedAt: Date.now() })
}

/** Rewrites the FSRS state of several exercises at once (postpone / advance). */
export async function bulkUpdateFsrs(changes: { id: string; fsrs: FsrsCard }[]) {
  const now = Date.now()
  await db.exercises.bulkUpdate(changes.map((c) => ({ key: c.id, changes: { fsrs: c.fsrs, updatedAt: now } })))
}

export async function deleteExercise(id: string) {
  await db.transaction('rw', db.exercises, db.reviewLogs, async () => {
    await db.reviewLogs.where('exerciseId').equals(id).delete()
    await db.exercises.delete(id)
  })
}

// ---- Review log ------------------------------------------------------------

export async function addReviewLog(log: Omit<ReviewLog, 'id'>): Promise<ReviewLog> {
  const row: ReviewLog = { id: uid(), ...log }
  await db.reviewLogs.add(row)
  return row
}

/** Review log as a CSV for the fsrs4anki optimizer (only answers that moved the schedule). */
export async function exportReviewLogCsv(database: CahiersDb = db): Promise<string> {
  const logs = await database.reviewLogs.orderBy('ts').toArray()
  const lines = ['card_id,review_time,review_rating,review_state,review_duration']
  for (const l of logs) {
    if (!l.affectsScheduling) continue
    const entry = l.fsrsLog as { prev?: FsrsCard } | null
    const state = entry?.prev?.state ?? 0
    lines.push(`${l.exerciseId},${l.ts},${l.rating},${state},${l.durationMs}`)
  }
  return lines.join('\n')
}

// ---- Backup ----------------------------------------------------------------

export type { BackupFile }

export async function exportBackup(database: CahiersDb = db): Promise<BackupFile> {
  const [cahiers, chapitres, exercises, reviewLogs, points, settings, supplements, mindmaps] = await Promise.all([
    database.cahiers.toArray(),
    database.chapitres.toArray(),
    database.exercises.toArray(),
    database.reviewLogs.toArray(),
    database.points.toArray(),
    database.settings.get('app').then((s) => ({ ...DEFAULT_SETTINGS, ...s })),
    database.supplements.toArray(),
    database.mindmaps.toArray(),
  ])
  return { app: 'cahiers', version: 4, schemaVersion: 4, exportedAt: Date.now(), cahiers, chapitres, exercises, reviewLogs, points, supplements, mindmaps, settings }
}

/**
 * Merges a backup (any schema version) into the database. Rows are matched by
 * id, so importing the same file twice is idempotent — including review logs.
 */
export async function importBackup(raw: unknown, database: CahiersDb = db): Promise<BackupFile> {
  const file = migrateBackup(raw)
  await database.transaction('rw', [database.cahiers, database.chapitres, database.exercises, database.reviewLogs, database.points, database.settings, database.supplements, database.mindmaps], async () => {
    await database.cahiers.bulkPut(file.cahiers)
    await database.chapitres.bulkPut(file.chapitres)
    await database.exercises.bulkPut(file.exercises)
    await database.points.bulkPut(file.points)
    await database.supplements.bulkPut(file.supplements)
    await database.mindmaps.bulkPut(file.mindmaps)
    await database.reviewLogs.bulkPut(file.reviewLogs)
    await database.settings.put(file.settings)
  })
  return file
}
