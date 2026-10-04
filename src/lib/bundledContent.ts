// The author's content (cahiers, fiches, exercises, points, mind maps) published with the site as
// `contenu.json`, so that anyone opening the app — a new device, a friend — finds it without importing a file.
// It is merged, never restored: what the reader did stays (review progress, settings, deletions).
//
// The file is made by `npm run publier-contenu -- <sauvegarde.json>` (scripts/publier-contenu.mjs): content only,
// without review history, exercise scheduling, settings or tombstones.

import type { Cahier, Chapitre, Exercise, Mindmap, PointDeCours, Supplement } from '../types'
import { db, mergeIntoDb, readSyncState, type CahiersDb } from '../db'
import { SCHEMA_VERSION } from './migrations'
import { newCard } from './fsrs'
import type { MergeSummary, SyncState } from './sync/merge'

/** An exercise as published: no scheduling state, the reader's own is kept (or a new card is made). */
export type BundledExercise = Omit<Exercise, 'fsrs' | 'fading' | 'forcedDue'>

export interface BundledContent {
  app: 'cahiers'
  kind: 'contenu'
  schemaVersion: number
  /** When the author's backup was made: a newer value means new content. */
  exportedAt: number
  cahiers: Cahier[]
  chapitres: Chapitre[]
  exercises: BundledExercise[]
  points: PointDeCours[]
  supplements: Supplement[]
  mindmaps: Mindmap[]
}

export const CONTENT_FILE = 'contenu.json'
export const CONTENT_KEY = 'contenu.applied'

export interface AppliedContent {
  exportedAt: number
  checkedAt: number
  added: number
  updated: number
}

export function contentUrl(base = import.meta.env.BASE_URL): string {
  return `${base}${CONTENT_FILE}`
}

/** Shape check: a host that answers every path with index.html must not be mistaken for a content file. */
export function asBundledContent(raw: unknown): BundledContent | null {
  if (!raw || typeof raw !== 'object') return null
  const f = raw as Partial<BundledContent>
  if (f.app !== 'cahiers' || f.kind !== 'contenu' || typeof f.exportedAt !== 'number') return null
  if (typeof f.schemaVersion !== 'number' || f.schemaVersion > SCHEMA_VERSION) return null
  const list = (v: unknown) => (Array.isArray(v) ? v : [])
  return { ...f, cahiers: list(f.cahiers), chapitres: list(f.chapitres), exercises: list(f.exercises), points: list(f.points), supplements: list(f.supplements), mindmaps: list(f.mindmaps) } as BundledContent
}

/**
 * The state to merge into the reader's: the published rows, with everything personal taken from the reader's
 * own copy when it exists (scheduling, status, fading, exams, daily limits). No journal, no settings, no
 * tombstones: nothing the reader did is touched, and a fiche the reader deleted stays deleted (the merge honours
 * the local tombstone unless the published row is newer).
 */
export function contentToState(file: BundledContent, local: SyncState, now = Date.now()): SyncState {
  const mine = new Map(local.exercises.map((e) => [e.id, e]))
  const myCahiers = new Map(local.cahiers.map((c) => [c.id, c]))
  const exercises = file.exercises.map((e): Exercise => {
    const m = mine.get(e.id)
    return {
      ...e,
      status: m?.status ?? e.status ?? 'active',
      fsrs: m?.fsrs ?? newCard(now),
      ...(m?.fading ? { fading: m.fading } : {}),
      ...(m?.forcedDue ? { forcedDue: m.forcedDue } : {}),
    }
  })
  const cahiers = file.cahiers.map((c) => {
    const m = myCahiers.get(c.id)
    return m ? { ...c, ...(m.limits ? { limits: m.limits } : {}), ...(m.examens ? { examens: m.examens } : {}) } : c
  })
  return { cahiers, chapitres: file.chapitres, exercises, points: file.points, supplements: file.supplements, mindmaps: file.mindmaps, reviewLogs: [], tombstones: [], settings: {}, settingsStamps: {} }
}

export async function readApplied(database: CahiersDb = db): Promise<AppliedContent | null> {
  return ((await database.kv.get(CONTENT_KEY))?.value as AppliedContent | undefined) ?? null
}

export interface ContentResult {
  /** 'applied' new content merged; 'current' nothing new; 'absent' no file (or unreadable, or offline). */
  status: 'applied' | 'current' | 'absent'
  summary?: MergeSummary
  exportedAt?: number
}

const total = (c: Record<string, number>) => Object.values(c).reduce((a, b) => a + b, 0)

/**
 * Fetches the published content and merges it when it is newer than what was last applied on this device
 * (`force`: whatever the date). Never throws: offline, a missing file or a damaged one just means « absent ».
 */
export async function syncBundledContent({ force = false, database = db, fetcher = fetch }: { force?: boolean; database?: CahiersDb; fetcher?: typeof fetch } = {}): Promise<ContentResult> {
  let file: BundledContent | null
  try {
    // `no-cache`: revalidated every time (a conditional request, cheap), never served stale.
    const res = await fetcher(contentUrl(), { cache: 'no-cache' })
    if (!res.ok) return { status: 'absent' }
    file = asBundledContent(await res.json())
  } catch {
    return { status: 'absent' }
  }
  if (!file) return { status: 'absent' }
  const applied = await readApplied(database)
  if (!force && applied && applied.exportedAt >= file.exportedAt) {
    await database.kv.put({ key: CONTENT_KEY, value: { ...applied, checkedAt: Date.now() } satisfies AppliedContent })
    return { status: 'current', exportedAt: file.exportedAt }
  }
  // « Recharger » on purpose: what the reader deleted comes back too (a deletion would otherwise win over the published rows).
  if (force) {
    const tables = { cahiers: file.cahiers, chapitres: file.chapitres, exercises: file.exercises, points: file.points, supplements: file.supplements, mindmaps: file.mindmaps }
    const keys = Object.entries(tables).flatMap(([table, rows]) => (rows as { id: string }[]).map((r) => [table, r.id]))
    await database.tombstones.bulkDelete(keys as unknown as string[])
  }
  const summary = await mergeIntoDb(contentToState(file, await readSyncState(database)), database)
  await database.kv.put({ key: CONTENT_KEY, value: { exportedAt: file.exportedAt, checkedAt: Date.now(), added: total(summary.added), updated: total(summary.updated) } satisfies AppliedContent })
  return { status: 'applied', summary, exportedAt: file.exportedAt }
}
