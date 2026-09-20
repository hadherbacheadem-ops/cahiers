import Dexie, { type DBCoreMutateRequest, type EntityTable, type Transaction } from 'dexie'
import type {
  Cahier,
  Chapitre,
  ChapitreSource,
  Exam,
  Exercise,
  ExerciseData,
  ExerciseOrigin,
  FsrsCard,
  Mindmap,
  MindmapNode,
  PointDeCours,
  PointNature,
  ReviewLog,
  Settings,
  Supplement,
  SupplementKind,
  SyncTable,
  Tombstone,
} from './types'
import { DEFAULT_SETTINGS } from './types'
import { newCard } from './lib/fsrs'
import { DEFAULT_BOOST_DAYS, dayStart, planSessions } from './lib/exam'
import { uid } from './lib/ids'
import { attemptToReviewLog, historyByExercise, migrateBackup, SCHEMA_VERSION, upgradeExerciseV3, upgradeExerciseV4, type BackupFile, type LegacyAttempt, type LegacyExerciseRow } from './lib/migrations'
import { getDeviceId } from './lib/sync/device'
import { DEVICE_SETTING_KEYS, mergeStates, purgeTombstones, SYNC_TABLES, type MergeSummary, type SyncState } from './lib/sync/merge'
import { stateFromBackup } from './lib/sync/format'

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
  /** v6: deletions to propagate to the other devices (compound key table+id). */
  tombstones: EntityTable<Tombstone, 'id'>
}

/** Transactions that must not restamp rows with this device (imports, merges). */
type StampAwareTransaction = Transaction & { noStamp?: boolean }

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

  // v6: sync. Every synced row carries the device that last wrote it, points
  // and supplements get an updatedAt, deletions leave tombstones, and the
  // settings remember when each key changed (per-key merge).
  database
    .version(6)
    .stores({
      tombstones: '[table+id], deletedAt',
    })
    .upgrade(async (tx) => {
      await snapshotBeforeMigration(tx, 6, 5, ['cahiers', 'chapitres', 'exercises', 'reviewLogs', 'points', 'settings', 'supplements', 'mindmaps'])
      const deviceId = getDeviceId()
      const now = Date.now()
      for (const name of ['points', 'supplements'] as const) {
        await tx
          .table(name)
          .toCollection()
          .modify((r: PointDeCours | Supplement) => {
            r.updatedAt = r.updatedAt ?? r.createdAt
            r.deviceId = r.deviceId ?? deviceId
          })
      }
      for (const name of ['cahiers', 'chapitres', 'exercises', 'mindmaps', 'reviewLogs'] as const) {
        await tx
          .table(name)
          .toCollection()
          .modify((r: { deviceId?: string }) => {
            r.deviceId = r.deviceId ?? deviceId
          })
      }
      // Existing settings are "as old as the migration": an older backup merged later never overrides them.
      const settings = (await tx.table('settings').get('app')) as Settings | undefined
      if (settings)
        await tx.table('kv').put({
          key: SETTINGS_STAMPS_KEY,
          value: Object.fromEntries(
            Object.keys(settings)
              .filter((k) => k !== 'id')
              .map((k) => [k, now]),
          ),
        })
    })

  // Stamp every synced row with this device, except inside transactions that
  // replay data written elsewhere (import, merge).
  database.use({
    stack: 'dbcore',
    name: 'deviceStamp',
    create: (core) => ({
      ...core,
      table: (name) => {
        const table = core.table(name)
        if (!STAMPED_TABLES.includes(name)) return table
        return {
          ...table,
          mutate: (req: DBCoreMutateRequest) => {
            if ((req.type === 'add' || req.type === 'put') && !(Dexie.currentTransaction as StampAwareTransaction | null)?.noStamp) {
              const deviceId = getDeviceId()
              for (const v of req.values as { deviceId?: string }[]) if (v && typeof v === 'object') v.deviceId = deviceId
            }
            return table.mutate(req)
          },
        }
      },
    }),
  })

  return database
}

export const SETTINGS_STAMPS_KEY = 'settingsStamps'
/** Tables whose rows carry the writing device (the journal too: a device pushes only its own answers). */
const STAMPED_TABLES: string[] = [...SYNC_TABLES, 'reviewLogs']

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
  await db.transaction('rw', db.settings, db.kv, async () => {
    await db.settings.put(next)
    const stamps = ((await db.kv.get(SETTINGS_STAMPS_KEY))?.value as Record<string, number> | undefined) ?? {}
    const now = Date.now()
    for (const k of Object.keys(patch)) if (k !== 'id') stamps[k] = now
    await db.kv.put({ key: SETTINGS_STAMPS_KEY, value: stamps })
  })
  return next
}

// ---- Tombstones ----------------------------------------------------------------

/** Records deletions so the other devices delete too. Must run inside the deleting transaction. */
async function addTombstones(table: SyncTable, ids: string[], database: CahiersDb = db, now = Date.now()) {
  if (!ids.length) return
  const deviceId = getDeviceId()
  await database.tombstones.bulkPut(ids.map((id) => ({ table, id, deletedAt: now, deviceId })))
}

/** Drops tombstones older than 90 days (call at start-up). */
export async function purgeOldTombstones(database: CahiersDb = db, now = Date.now()): Promise<number> {
  const all = await database.tombstones.toArray()
  const keep = new Set(purgeTombstones(all, now).map((t) => `${t.table}/${t.id}`))
  const stale = all.filter((t) => !keep.has(`${t.table}/${t.id}`))
  if (stale.length) await database.tombstones.bulkDelete(stale.map((t) => [t.table, t.id] as unknown as string))
  return stale.length
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

/** Deletes the cahier and everything under it (one tombstone per row, so the other devices delete the same rows). */
export async function deleteCahier(id: string) {
  await db.transaction('rw', [db.cahiers, db.chapitres, db.exercises, db.reviewLogs, db.points, db.supplements, db.mindmaps, db.tombstones], async () => {
    const now = Date.now()
    await db.reviewLogs.where('cahierId').equals(id).delete()
    for (const table of ['exercises', 'points', 'supplements', 'mindmaps', 'chapitres'] as const) {
      const keys = (await db[table].where('cahierId').equals(id).primaryKeys()) as string[]
      await addTombstones(table, keys, db, now)
      await db[table].bulkDelete(keys)
    }
    await addTombstones('cahiers', [id], db, now)
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

export async function createChapitre(input: { cahierId: string; title: string; content: string; html?: string; source: ChapitreSource; onenotePageId?: string }): Promise<Chapitre> {
  const now = Date.now()
  const chapitre: Chapitre = {
    id: uid(),
    cahierId: input.cahierId,
    title: input.title.trim() || 'Sans titre',
    content: input.content,
    ...(input.html ? { html: input.html } : {}),
    source: input.source,
    onenotePageId: input.onenotePageId,
    createdAt: now,
    updatedAt: now,
  }
  await db.chapitres.add(chapitre)
  await db.cahiers.update(input.cahierId, { updatedAt: now })
  return chapitre
}

/** `html: undefined` turns a rich fiche back into a plain markdown one. */
export async function updateChapitre(id: string, patch: Partial<Pick<Chapitre, 'title' | 'content' | 'html' | 'prepa'>>) {
  await db.chapitres.update(id, { ...patch, updatedAt: Date.now() })
}

export async function deleteChapitre(id: string) {
  await db.transaction('rw', [db.chapitres, db.exercises, db.reviewLogs, db.points, db.supplements, db.mindmaps, db.tombstones], async () => {
    const now = Date.now()
    await db.reviewLogs.where('chapitreId').equals(id).delete()
    for (const table of ['exercises', 'points', 'supplements', 'mindmaps'] as const) {
      const keys = (await db[table].where('chapitreId').equals(id).primaryKeys()) as string[]
      await addTombstones(table, keys, db, now)
      await db[table].bulkDelete(keys)
    }
    await addTombstones('chapitres', [id], db, now)
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
    updatedAt: now + i,
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
  const rows: Supplement[] = items.map((it, i) => ({ id: uid(), chapitreId, cahierId, ...it, status: 'pending', createdAt: now + i, updatedAt: now + i }))
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
    const body = s.content
      .trim()
      .replace(/^#{1,6}\s+[^\n]*\n?/, '')
      .trim()
    const block = `\n\n## ${s.title}\n${body}`
    await db.chapitres.update(ch.id, { content: ch.content.trimEnd() + block, updatedAt: Date.now() })
    await db.supplements.update(id, { status: 'kept', updatedAt: Date.now() })
  })
}

export async function discardSupplement(id: string) {
  await db.transaction('rw', db.supplements, db.tombstones, async () => {
    await addTombstones('supplements', [id])
    await db.supplements.delete(id)
  })
}

// ---- Mind maps -------------------------------------------------------------

/**
 * One map per scope (fiche, or whole cahier): saving replaces the previous one.
 * A fiche map also gets its two retrieval exercises (gaps, reconstruction):
 * reading a map is not revision, recalling it is.
 */
export async function saveMindmap(input: { cahierId: string; chapitreId?: string; title: string; root: MindmapNode }): Promise<Mindmap> {
  const now = Date.now()
  return db.transaction('rw', [db.mindmaps, db.exercises, db.chapitres, db.settings, db.tombstones], async () => {
    const previous = await db.mindmaps
      .where('cahierId')
      .equals(input.cahierId)
      .filter((m) => (m.chapitreId ?? null) === (input.chapitreId ?? null))
      .toArray()
    const id = previous[0]?.id ?? uid()
    // The first map keeps its id (put below); duplicates, if any, are deleted for good.
    await addTombstones(
      'mindmaps',
      previous.slice(1).map((m) => m.id),
      db,
      now,
    )
    await db.mindmaps.bulkDelete(previous.map((m) => m.id))
    const map: Mindmap = { id, cahierId: input.cahierId, chapitreId: input.chapitreId, title: input.title, root: input.root, createdAt: previous[0]?.createdAt ?? now, updatedAt: now }
    await db.mindmaps.put(map)
    if (input.chapitreId) await ensureMindmapExercises(map, input.chapitreId)
    return map
  })
}

/**
 * Creates the 'trous' and 'reconstruction' exercises of a fiche map when
 * missing. A regenerated map keeps its id, so existing exercises (their FSRS
 * state and review log) are untouched. New ones start in the validation queue
 * unless the `mindmapExercisesActive` setting says otherwise.
 */
async function ensureMindmapExercises(map: Mindmap, chapitreId: string) {
  const existing = await db.exercises
    .where('chapitreId')
    .equals(chapitreId)
    .filter((e) => e.data.type === 'carte_trous' && e.data.mindmapId === map.id)
    .toArray()
  const have = new Set(existing.map((e) => (e.data.type === 'carte_trous' ? e.data.variant : '')))
  const missing = (['trous', 'reconstruction'] as const).filter((v) => !have.has(v))
  if (!missing.length) return
  const settings = { ...DEFAULT_SETTINGS, ...(await db.settings.get('app')) }
  await addExercises(
    chapitreId,
    map.cahierId,
    missing.map((variant) => ({ data: { type: 'carte_trous' as const, mindmapId: map.id, variant }, difficulty: variant === 'trous' ? (2 as const) : (3 as const), tags: ['carte mentale'], origin: 'manual' as const })),
    settings.mindmapExercisesActive ? 'active' : 'pending',
  )
}

export async function deleteMindmap(id: string) {
  await db.transaction('rw', [db.mindmaps, db.exercises, db.reviewLogs, db.tombstones], async () => {
    const linked = await db.exercises.filter((e) => e.data.type === 'carte_trous' && e.data.mindmapId === id).primaryKeys()
    if (linked.length) await deleteExercises(linked as string[])
    await addTombstones('mindmaps', [id])
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
  /** The JSON of this exercise needed a backslash repair at import: validate it first. */
  repaired?: boolean
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
    repaired: it.repaired,
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
  await db.transaction('rw', db.exercises, db.reviewLogs, db.tombstones, async () => {
    await db.reviewLogs.where('exerciseId').anyOf(ids).delete()
    await addTombstones('exercises', ids)
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
  await deleteExercises([id])
}

/**
 * Removes the flashcards of a fiche that ask a question already asked
 * (findFlashcardDuplicates): the copy without history goes, the survivor
 * becomes a plain flip card. Returns what was removed.
 */
export async function resolveFlashcardDuplicates(chapitreId: string): Promise<{ removed: number; removedPending: number }> {
  const { findFlashcardDuplicates } = await import('./lib/dedupe')
  const exercises = await db.exercises.where('chapitreId').equals(chapitreId).toArray()
  const pairs = findFlashcardDuplicates(exercises)
  if (!pairs.length) return { removed: 0, removedPending: 0 }
  await db.transaction('rw', db.exercises, db.reviewLogs, db.tombstones, async () => {
    await deleteExercises(pairs.map((p) => p.removed.id))
    for (const p of pairs) {
      if (p.survivor.data.type === 'flashcard' && p.survivor.data.typed) await updateExercise(p.survivor.id, { data: { ...p.survivor.data, typed: undefined } })
    }
  })
  return { removed: pairs.length, removedPending: pairs.filter((p) => p.removed.status === 'pending').length }
}

/** « Tout effacer »: every row leaves a tombstone, so a later sync deletes it everywhere instead of bringing it back. */
export async function wipeAll(database: CahiersDb = db) {
  await database.transaction('rw', [database.cahiers, database.chapitres, database.exercises, database.reviewLogs, database.points, database.supplements, database.mindmaps, database.tombstones], async () => {
    const now = Date.now()
    for (const table of SYNC_TABLES) {
      const keys = (await database[table].toCollection().primaryKeys()) as string[]
      await addTombstones(table, keys, database, now)
      await database[table].clear()
    }
    await database.reviewLogs.clear()
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
  const [cahiers, chapitres, exercises, reviewLogs, points, settings, supplements, mindmaps, tombstones, stamps] = await Promise.all([
    database.cahiers.toArray(),
    database.chapitres.toArray(),
    database.exercises.toArray(),
    database.reviewLogs.toArray(),
    database.points.toArray(),
    database.settings.get('app').then((s) => ({ ...DEFAULT_SETTINGS, ...s })),
    database.supplements.toArray(),
    database.mindmaps.toArray(),
    database.tombstones.toArray(),
    database.kv.get(SETTINGS_STAMPS_KEY).then((r) => (r?.value as Record<string, number> | undefined) ?? {}),
  ])
  return {
    app: 'cahiers',
    version: SCHEMA_VERSION,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: Date.now(),
    cahiers,
    chapitres,
    exercises,
    reviewLogs,
    points,
    supplements,
    mindmaps,
    settings,
    tombstones,
    settingsStamps: stamps,
  }
}

/**
 * The content alone: cahiers, fiches, points, compléments, mind maps and the
 * exercises as new cards — what one gives to a classmate. No review log, no
 * settings, no deletions. Imported with « Fusionner », ids are kept: a second
 * export updates instead of duplicating.
 */
export async function exportContentOnly(database: CahiersDb = db): Promise<BackupFile> {
  const full = await exportBackup(database)
  const now = Date.now()
  return {
    ...full,
    exercises: full.exercises.map((e) => ({ ...e, fsrs: newCard(now), status: e.status === 'leech' || e.status === 'suspended' ? 'active' : e.status })),
    reviewLogs: [],
    tombstones: [],
    settings: { ...DEFAULT_SETTINGS },
    settingsStamps: {},
  }
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
    database.reviewLogs
      .orderBy('ts')
      .last()
      .then((r) => r?.ts ?? 0),
  ])
  return Math.max(c, ch, e, l) > file.exportedAt
}

export async function importBackup(raw: unknown, database: CahiersDb = db): Promise<BackupFile> {
  const file = migrateBackup(raw)
  await database.transaction(
    'rw',
    [database.cahiers, database.chapitres, database.exercises, database.reviewLogs, database.points, database.settings, database.supplements, database.mindmaps, database.tombstones, database.kv],
    async (tx) => {
      ;(tx as StampAwareTransaction).noStamp = true
      await database.cahiers.bulkPut(file.cahiers)
      await database.chapitres.bulkPut(file.chapitres)
      await database.exercises.bulkPut(file.exercises)
      await database.points.bulkPut(file.points)
      await database.supplements.bulkPut(file.supplements)
      await database.mindmaps.bulkPut(file.mindmaps)
      await database.reviewLogs.bulkPut(file.reviewLogs)
      await database.settings.put(file.settings)
      if (file.tombstones?.length) await database.tombstones.bulkPut(file.tombstones)
      const stamps = ((await database.kv.get(SETTINGS_STAMPS_KEY))?.value as Record<string, number> | undefined) ?? {}
      for (const k of Object.keys(file.settings)) if (k !== 'id') stamps[k] = Math.max(stamps[k] ?? 0, file.settingsStamps?.[k] ?? file.exportedAt)
      await database.kv.put({ key: SETTINGS_STAMPS_KEY, value: stamps })
    },
  )
  return file
}

// ---- Sync state (merge) ------------------------------------------------------

const SYNC_STORES = (database: CahiersDb) => [
  database.cahiers,
  database.chapitres,
  database.exercises,
  database.reviewLogs,
  database.points,
  database.settings,
  database.supplements,
  database.mindmaps,
  database.tombstones,
  database.kv,
]

/** Everything the merge engine works on, read from the database. */
export async function readSyncState(database: CahiersDb = db): Promise<SyncState> {
  const [cahiers, chapitres, exercises, points, supplements, mindmaps, reviewLogs, tombstones, settingsRow, stamps] = await Promise.all([
    database.cahiers.toArray(),
    database.chapitres.toArray(),
    database.exercises.toArray(),
    database.points.toArray(),
    database.supplements.toArray(),
    database.mindmaps.toArray(),
    database.reviewLogs.toArray(),
    database.tombstones.toArray(),
    database.settings.get('app'),
    database.kv.get(SETTINGS_STAMPS_KEY).then((r) => (r?.value as Record<string, number> | undefined) ?? {}),
  ])
  const { id: _id, ...settings } = { ...DEFAULT_SETTINGS, ...settingsRow }
  for (const k of DEVICE_SETTING_KEYS) delete (settings as Record<string, unknown>)[k as string]
  return { cahiers, chapitres, exercises, points, supplements, mindmaps, reviewLogs, tombstones, settings, settingsStamps: stamps }
}

/**
 * Makes the database equal to a merged state: rows that changed are written
 * as they are (no restamp), rows that disappeared are deleted, device settings
 * are kept. Returns the number of rows written or deleted.
 */
export async function applySyncState(state: SyncState, database: CahiersDb = db): Promise<number> {
  let touched = 0
  await database.transaction('rw', SYNC_STORES(database), async (tx) => {
    ;(tx as StampAwareTransaction).noStamp = true
    for (const table of SYNC_TABLES) {
      const current = new Map(((await database[table].toArray()) as { id: string }[]).map((r) => [r.id, JSON.stringify(r)]))
      const next = state[table] as { id: string }[]
      const changed = next.filter((r) => current.get(r.id) !== JSON.stringify(r))
      const gone = [...current.keys()].filter((id) => !next.some((r) => r.id === id))
      if (changed.length) await (database[table] as EntityTable<{ id: string }, 'id'>).bulkPut(changed)
      if (gone.length) await database[table].bulkDelete(gone)
      touched += changed.length + gone.length
    }
    const logIds = new Set((await database.reviewLogs.toCollection().primaryKeys()) as string[])
    const nextLogIds = new Set(state.reviewLogs.map((l) => l.id))
    const newLogs = state.reviewLogs.filter((l) => !logIds.has(l.id))
    const goneLogs = [...logIds].filter((id) => !nextLogIds.has(id))
    if (newLogs.length) await database.reviewLogs.bulkPut(newLogs)
    if (goneLogs.length) await database.reviewLogs.bulkDelete(goneLogs)
    touched += newLogs.length + goneLogs.length
    await database.tombstones.clear()
    if (state.tombstones.length) await database.tombstones.bulkPut(state.tombstones)
    const current = { ...DEFAULT_SETTINGS, ...(await database.settings.get('app')) }
    const device: Partial<Settings> = {}
    for (const k of DEVICE_SETTING_KEYS) if (current[k] !== undefined) (device as Record<string, unknown>)[k as string] = current[k]
    await database.settings.put({ ...DEFAULT_SETTINGS, ...state.settings, ...device, id: 'app' })
    await database.kv.put({ key: SETTINGS_STAMPS_KEY, value: state.settingsStamps })
  })
  return touched
}

/** Scheduler options the merge replays with (the user's own settings). */
async function mergeOptions(database: CahiersDb) {
  const s = { ...DEFAULT_SETTINGS, ...(await database.settings.get('app')) }
  return { scheduler: { desiredRetention: s.desiredRetention, maximumInterval: s.maximumInterval } }
}

/** Merges a state (another device, a file) into the database. */
export async function mergeIntoDb(other: SyncState, database: CahiersDb = db): Promise<MergeSummary> {
  const local = await readSyncState(database)
  const { state, summary } = mergeStates(local, other, await mergeOptions(database))
  await applySyncState(state, database)
  return summary
}

/** « Fusionner une sauvegarde »: unlike importBackup (the file wins), both sides are kept by the merge rules. */
export async function mergeBackup(raw: unknown, database: CahiersDb = db): Promise<MergeSummary> {
  return mergeIntoDb(stateFromBackup(migrateBackup(raw)), database)
}
