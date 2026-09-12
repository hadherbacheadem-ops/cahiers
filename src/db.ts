import Dexie, { type EntityTable, type Transaction } from 'dexie'
import type { Cahier, Chapitre, ChapitreSource, Exam, Exercise, ExerciseData, ExerciseOrigin, FsrsCard, Mindmap, MindmapNode, PointDeCours, PointNature, ReviewLog, Settings, Supplement, SupplementKind } from './types'
import { DEFAULT_SETTINGS } from './types'
import { newCard } from './lib/fsrs'
import { DEFAULT_BOOST_DAYS, dayStart, planSessions } from './lib/exam'
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
  /** Small key/value store for non-domain state (file handles, autosave status). */
  kv: EntityTable<{ key: string; value: unknown }, 'key'>
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

  // v3: attempts → reviewLogs, points de cours, exercise status/origin/pointId,
  // and the key/value store that holds the pre-migration safety backups.
  database
    .version(3)
    .stores({
      exercises: 'id, chapitreId, cahierId, pointId, type, status, srs.due',
      reviewLogs: 'id, exerciseId, chapitreId, cahierId, ts',
      points: 'id, chapitreId, cahierId',
      kv: 'key',
      attempts: null,
    })
    .upgrade(async (tx) => {
      await snapshotBeforeMigration(tx, 3, 2, ['cahiers', 'chapitres', 'exercises', 'attempts', 'settings', 'supplements', 'mindmaps'])
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
      await snapshotBeforeMigration(tx, 4, 3, ['cahiers', 'chapitres', 'exercises', 'reviewLogs', 'points', 'settings', 'supplements', 'mindmaps'])
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

  // v5: nothing to transform any more (the kv store moved to v3); kept so that
  // databases already at version 5 still open.
  database.version(5).stores({})

  return database
}

export const MIGRATION_BACKUP_PREFIX = 'backup_before_v'

/** A full copy of the tables as they were before a schema migration, kept in `kv`. */
export interface MigrationBackup {
  app: 'cahiers'
  version: number
  schemaVersion: number
  exportedAt: number
  migrationBackup: true
  [table: string]: unknown
}

/**
 * Safety net: before a migration rewrites anything, the previous content is
 * copied verbatim into `kv` (key `backup_before_v<N>`). It is downloadable
 * from the settings and importable like any backup (migrateBackup understands
 * every past shape).
 */
async function snapshotBeforeMigration(tx: Transaction, toVersion: number, fromVersion: number, tables: string[]) {
  const snapshot: MigrationBackup = { app: 'cahiers', version: fromVersion, schemaVersion: fromVersion, exportedAt: Date.now(), migrationBackup: true }
  for (const name of tables) {
    // A store being deleted by this version (attempts at v3) is still readable
    // inside the upgrade transaction; one that never existed throws — skip it.
    let rows: unknown[]
    try {
      rows = await tx.table(name).toArray()
    } catch {
      continue
    }
    // Backups carry the single settings row as an object, like exportBackup().
    snapshot[name] = name === 'settings' ? (rows[0] ?? undefined) : rows
  }
  await tx.table('kv').put({ key: `${MIGRATION_BACKUP_PREFIX}${toVersion}`, value: snapshot })
}

export async function listMigrationBackups(database: CahiersDb = db): Promise<{ key: string; version: number; exportedAt: number; bytes: number; value: MigrationBackup }[]> {
  const rows = await database.kv.where('key').startsWith(MIGRATION_BACKUP_PREFIX).toArray()
  return rows
    .map((r) => {
      const value = r.value as MigrationBackup
      return { key: r.key, version: Number(r.key.slice(MIGRATION_BACKUP_PREFIX.length)), exportedAt: value.exportedAt, bytes: JSON.stringify(value).length, value }
    })
    .sort((a, b) => a.version - b.version)
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
  // From the first cahier on there is something to lose: ask the browser to keep the data.
  if (typeof navigator !== 'undefined' && navigator.storage?.persist) navigator.storage.persist().catch(() => undefined)
  return cahier
}

export async function updateCahier(id: string, patch: Partial<Pick<Cahier, 'name' | 'color' | 'programme' | 'limits' | 'lexical'>>) {
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

// ---- Exams (stored on the cahier) --------------------------------------------

export async function addExam(cahierId: string, input: { name: string; date: number; chapitreIds: string[]; boostFromDays?: number }): Promise<Exam> {
  const now = Date.now()
  const exam: Exam = {
    id: uid(),
    name: input.name.trim() || 'Examen',
    date: dayStart(input.date),
    chapitreIds: input.chapitreIds,
    boostFromDays: input.boostFromDays ?? DEFAULT_BOOST_DAYS,
    sessions: planSessions(input.date, now),
    createdAt: now,
  }
  await db.transaction('rw', db.cahiers, async () => {
    const c = await db.cahiers.get(cahierId)
    if (!c) return
    await db.cahiers.update(cahierId, { examens: [...(c.examens ?? []), exam], updatedAt: now })
  })
  return exam
}

export async function updateExam(cahierId: string, examId: string, patch: Partial<Pick<Exam, 'name' | 'date' | 'chapitreIds' | 'boostFromDays' | 'archived' | 'sessions'>>) {
  await db.transaction('rw', db.cahiers, async () => {
    const c = await db.cahiers.get(cahierId)
    if (!c) return
    const examens = (c.examens ?? []).map((e) => {
      if (e.id !== examId) return e
      const next: Exam = { ...e, ...patch }
      // A new date invalidates the plan: replan, keeping the sessions already done.
      if (patch.date !== undefined && dayStart(patch.date) !== e.date) {
        next.date = dayStart(patch.date)
        const done = e.sessions.filter((s) => s.done)
        next.sessions = [...done, ...planSessions(next.date).filter((s) => !done.some((d) => d.at === s.at))].slice(0, 3)
      }
      return next
    })
    await db.cahiers.update(cahierId, { examens, updatedAt: Date.now() })
  })
}

export async function removeExam(cahierId: string, examId: string) {
  await db.transaction('rw', db.cahiers, async () => {
    const c = await db.cahiers.get(cahierId)
    if (!c) return
    await db.cahiers.update(cahierId, { examens: (c.examens ?? []).filter((e) => e.id !== examId), updatedAt: Date.now() })
  })
}

export async function markExamSessionDone(cahierId: string, examId: string, sessionIndex: number, when = Date.now()) {
  await db.transaction('rw', db.cahiers, async () => {
    const c = await db.cahiers.get(cahierId)
    const exam = c?.examens?.find((e) => e.id === examId)
    if (!c || !exam || !exam.sessions[sessionIndex]) return
    const sessions = exam.sessions.map((s, i) => (i === sessionIndex ? { ...s, done: when } : s))
    await db.cahiers.update(cahierId, { examens: c.examens!.map((e) => (e.id === examId ? { ...e, sessions } : e)), updatedAt: when })
  })
}

/** Every exam of every cahier, with its cahier id. */
export async function listExams(database: CahiersDb = db): Promise<{ cahier: Cahier; exam: Exam }[]> {
  const cahiers = await database.cahiers.toArray()
  return cahiers.flatMap((cahier) => (cahier.examens ?? []).map((exam) => ({ cahier, exam })))
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

/**
 * One map per scope (fiche, or whole cahier): saving replaces the previous one.
 * A fiche map also gets its two retrieval exercises (gaps, reconstruction):
 * reading a map is not revision, recalling it is.
 */
export async function saveMindmap(input: { cahierId: string; chapitreId?: string; title: string; root: MindmapNode }): Promise<Mindmap> {
  const now = Date.now()
  return db.transaction('rw', [db.mindmaps, db.exercises, db.chapitres], async () => {
    const previous = await db.mindmaps
      .where('cahierId')
      .equals(input.cahierId)
      .filter((m) => (m.chapitreId ?? null) === (input.chapitreId ?? null))
      .toArray()
    const id = previous[0]?.id ?? uid()
    await db.mindmaps.bulkDelete(previous.map((m) => m.id))
    const map: Mindmap = { id, cahierId: input.cahierId, chapitreId: input.chapitreId, title: input.title, root: input.root, createdAt: previous[0]?.createdAt ?? now, updatedAt: now }
    await db.mindmaps.put(map)
    if (input.chapitreId) await ensureMindmapExercises(map, input.chapitreId)
    return map
  })
}

/** Creates the 'trous' and 'reconstruction' exercises of a fiche map when missing (keeps their history otherwise). */
async function ensureMindmapExercises(map: Mindmap, chapitreId: string) {
  const existing = await db.exercises.where('chapitreId').equals(chapitreId).filter((e) => e.data.type === 'carte_trous' && e.data.mindmapId === map.id).toArray()
  const have = new Set(existing.map((e) => (e.data.type === 'carte_trous' ? e.data.variant : '')))
  const missing = (['trous', 'reconstruction'] as const).filter((v) => !have.has(v))
  if (!missing.length) return
  await addExercises(
    chapitreId,
    map.cahierId,
    missing.map((variant) => ({ data: { type: 'carte_trous' as const, mindmapId: map.id, variant }, difficulty: variant === 'trous' ? (2 as const) : (3 as const), tags: ['carte mentale'], origin: 'manual' as const })),
    'active',
  )
}

export async function deleteMindmap(id: string) {
  await db.transaction('rw', [db.mindmaps, db.exercises, db.reviewLogs], async () => {
    const linked = await db.exercises.filter((e) => e.data.type === 'carte_trous' && e.data.mindmapId === id).primaryKeys()
    if (linked.length) await deleteExercises(linked as string[])
    await db.mindmaps.delete(id)
  })
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

export async function updateExercise(id: string, patch: Partial<Pick<Exercise, 'data' | 'difficulty' | 'tags' | 'status' | 'pointId' | 'fsrs' | 'fading'>>) {
  await db.exercises.update(id, { ...patch, updatedAt: Date.now() })
}

export async function setExercisesStatus(ids: string[], status: Exercise['status']) {
  const now = Date.now()
  await db.exercises.bulkUpdate(ids.map((id) => ({ key: id, changes: { status, updatedAt: now } })))
}

export async function deleteExercises(ids: string[]) {
  await db.transaction('rw', db.exercises, db.reviewLogs, async () => {
    await db.reviewLogs.where('exerciseId').anyOf(ids).delete()
    await db.exercises.bulkDelete(ids)
  })
}

export interface GenerationPoint extends NewPoint {
  /** Claude's local id, or the id of an existing point to reuse. */
  localId: string
}

export interface GenerationExercise extends NewExercise {
  localPointId?: string
}

const INVERSE_NATURES: PointNature[] = ['definition', 'formule']
const INVERSE_MAX_WORDS = 12

/**
 * Reverse cards (answer → question) for definition / formula points: the
 * definition should also call back its term. Only short answers reverse well.
 */
export function inverseCards(exercises: GenerationExercise[], natureOf: (localPointId: string | undefined) => PointNature | undefined): GenerationExercise[] {
  const out: GenerationExercise[] = []
  const seen = new Set<string>()
  for (const e of exercises) {
    if (e.data.type !== 'flashcard' || e.inverse) continue
    const nature = natureOf(e.localPointId)
    if (!nature || !INVERSE_NATURES.includes(nature)) continue
    const answer = e.data.answer.trim()
    if (answer.split(/\s+/).length > INVERSE_MAX_WORDS) continue
    const key = `${e.localPointId}|${answer.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      data: { type: 'flashcard', question: e.data.answer, answer: e.data.question, typed: e.data.typed },
      difficulty: e.difficulty,
      tags: e.tags,
      localPointId: e.localPointId,
      origin: 'inverse_auto',
      inverse: true,
    })
  }
  return out
}

/**
 * Stores a generation: new points are created (existing ids passed in a focused
 * generation are reused), then exercises are linked to them by local id.
 * With `withInverse`, reverse cards are added for definition / formula points.
 */
export async function importGeneration(
  chapitreId: string,
  cahierId: string,
  points: GenerationPoint[],
  exercises: GenerationExercise[],
  status: Exercise['status'],
  withInverse = false,
): Promise<{ points: PointDeCours[]; exercises: Exercise[] }> {
  return db.transaction('rw', db.points, db.exercises, db.chapitres, async () => {
    const existing = await db.points.where('chapitreId').equals(chapitreId).toArray()
    const idMap = new Map<string, string>()
    for (const p of existing) idMap.set(p.id, p.id)

    const toCreate = points.filter((p) => !idMap.has(p.localId))
    // Reuse an existing point with the same anchor instead of duplicating it.
    const byAnchor = new Map(existing.map((p) => [p.anchor, p.id]))
    const fresh = toCreate.filter((p) => !(p.anchor && byAnchor.has(p.anchor)))
    for (const p of toCreate) if (p.anchor && byAnchor.has(p.anchor)) idMap.set(p.localId, byAnchor.get(p.anchor)!)
    const created = await addPoints(chapitreId, cahierId, fresh)
    fresh.forEach((p, i) => idMap.set(p.localId, created[i].id))

    const natureOf = (localPointId: string | undefined): PointNature | undefined => {
      if (!localPointId) return undefined
      const realId = idMap.get(localPointId)
      return points.find((p) => p.localId === localPointId)?.nature ?? existing.find((p) => p.id === realId)?.nature
    }
    const all = withInverse ? [...exercises, ...inverseCards(exercises, natureOf)] : exercises

    const rows = await addExercises(
      chapitreId,
      cahierId,
      all.map((e) => {
        // Free-recall checklists reference points by Claude's local ids too.
        const data = e.data.type === 'rappel_libre' ? { ...e.data, checklist: e.data.checklist.map((c) => ({ text: c.text, pointId: c.pointId ? (idMap.get(c.pointId) ?? null) : null })) } : e.data
        return { ...e, data, pointId: e.localPointId ? (idMap.get(e.localPointId) ?? null) : null }
      }),
      status,
    )
    return { points: created, exercises: rows }
  })
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

// ---- Key/value ---------------------------------------------------------------

export async function getKv<T>(key: string): Promise<T | undefined> {
  return (await db.kv.get(key))?.value as T | undefined
}

export async function setKv(key: string, value: unknown) {
  await db.kv.put({ key, value })
}

export async function deleteKv(key: string) {
  await db.kv.delete(key)
}

/** Pre-test questions answered before a chapter was written, to be turned into exercises afterwards. */
export interface PretestRecord {
  topic: string
  questions: { question: string; answer: string; given: string }[]
  at: number
}

export const pretestKey = (cahierId: string) => `pretest:${cahierId}`

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
/** True when the database holds changes newer than the backup: the caller should confirm before merging. */
export async function backupIsOlderThanData(raw: unknown, database: CahiersDb = db): Promise<boolean> {
  const file = migrateBackup(raw)
  const [c, ch, e, l] = await Promise.all([
    database.cahiers.toArray().then((rows) => Math.max(0, ...rows.map((r) => r.updatedAt))),
    database.chapitres.toArray().then((rows) => Math.max(0, ...rows.map((r) => r.updatedAt))),
    database.exercises.toArray().then((rows) => Math.max(0, ...rows.map((r) => r.updatedAt))),
    database.reviewLogs.orderBy('ts').last().then((r) => r?.ts ?? 0),
  ])
  return Math.max(c, ch, e, l) > file.exportedAt
}

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
