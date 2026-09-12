// ---------------------------------------------------------------------------
// Merge engine: pure, deterministic, commutative and idempotent. Combines two
// states of the same data (two devices, or the local base and a file) into
// one. No database, no network — the sync engine and the "fusionner une
// sauvegarde" import both call it.
//
// Rules (see docs/adr/0001-acces-mobile.md):
//   1. reviewLogs: union by id, never a conflict (append-only journal).
//   2. exercises: content → newest updatedAt; FSRS state → newest
//      fsrs.last_review; if BOTH sides reviewed the card since their common
//      base, the merged journal is replayed with the scheduler so neither
//      side's answers are lost.
//   3. other tables: newest updatedAt wins; a tombstone beats an older
//      modification; a modification newer than the tombstone resurrects.
//   4. settings: per key, newest stamp wins; device keys are never merged.
// ---------------------------------------------------------------------------

import type { Cahier, Chapitre, Exercise, FsrsCard, Mindmap, PointDeCours, ReviewLog, Settings, Supplement, SyncTable, Tombstone } from '../../types'
import { replayHistory, type SchedulerOptions } from '../fsrs'

export type { SyncTable, Tombstone }
export const SYNC_TABLES: SyncTable[] = ['cahiers', 'chapitres', 'exercises', 'points', 'supplements', 'mindmaps']

/** Settings that describe the device, never synchronised. */
export const DEVICE_SETTING_KEYS: (keyof Settings)[] = ['background', 'motionParallax', 'swipeToGrade']

export interface SyncState {
  cahiers: Cahier[]
  chapitres: Chapitre[]
  exercises: Exercise[]
  points: PointDeCours[]
  supplements: Supplement[]
  mindmaps: Mindmap[]
  reviewLogs: ReviewLog[]
  tombstones: Tombstone[]
  settings: Partial<Settings>
  /** Per-key modification time of the settings. */
  settingsStamps: Record<string, number>
}

export interface MergeSummary {
  added: Record<SyncTable | 'reviewLogs', number>
  updated: Record<SyncTable, number>
  deleted: Record<SyncTable, number>
  resurrected: Record<SyncTable, number>
  /** Exercises whose FSRS state was rebuilt by replaying both journals. */
  replayed: number
  settingsChanged: string[]
}

export interface MergeOptions {
  /** Scheduler used to replay a journal when both sides reviewed a card. */
  scheduler: Pick<SchedulerOptions, 'desiredRetention' | 'maximumInterval'>
}

export const TOMBSTONE_DAYS = 90
const DAY = 86_400_000

interface Stamped {
  id: string
  updatedAt?: number
  createdAt?: number
}

function stamp(r: Stamped): number {
  return r.updatedAt ?? r.createdAt ?? 0
}

/** Deterministic, symmetric tie-break: the record with the greater JSON text. */
function tieBreak<T>(a: T, b: T): T {
  return JSON.stringify(a) >= JSON.stringify(b) ? a : b
}

function newest<T extends Stamped>(a: T | undefined, b: T | undefined): T {
  if (!a) return b as T
  if (!b) return a
  const sa = stamp(a)
  const sb = stamp(b)
  if (sa !== sb) return sa > sb ? a : b
  return tieBreak(a, b)
}

function emptyCounts(): Record<SyncTable, number> {
  return { cahiers: 0, chapitres: 0, exercises: 0, points: 0, supplements: 0, mindmaps: 0 }
}

/** Latest tombstone per table/id. */
function tombstoneMap(list: Tombstone[]): Map<string, Tombstone> {
  const m = new Map<string, Tombstone>()
  for (const t of list) {
    const k = `${t.table}/${t.id}`
    const prev = m.get(k)
    if (!prev || t.deletedAt > prev.deletedAt || (t.deletedAt === prev.deletedAt && tieBreak(t, prev) === t)) m.set(k, t)
  }
  return m
}

function lastReview(c: FsrsCard): number {
  return c.last_review ?? 0
}

/** Merges the FSRS state of one exercise present on both sides. */
function mergeFsrs(a: Exercise, b: Exercise, logsA: ReviewLog[], logsB: ReviewLog[], opts: MergeOptions): { fsrs: FsrsCard; replayed: boolean } {
  const ta = lastReview(a.fsrs)
  const tb = lastReview(b.fsrs)
  const idsA = new Set(logsA.map((l) => l.id))
  const idsB = new Set(logsB.map((l) => l.id))
  const common = logsA.filter((l) => idsB.has(l.id)).reduce((m, l) => Math.max(m, l.ts), 0)
  const aNew = logsA.some((l) => !idsB.has(l.id) && l.affectsScheduling && l.ts > common)
  const bNew = logsB.some((l) => !idsA.has(l.id) && l.affectsScheduling && l.ts > common)
  if (aNew && bNew) {
    // Both devices reviewed since the base: the newest state alone would drop
    // the other device's answers. Replaying the union of the journals gives a
    // state that saw every answer, in order (ts-fsrs is deterministic).
    const union = new Map<string, ReviewLog>()
    for (const l of [...logsA, ...logsB]) union.set(l.id, l)
    const history = [...union.values()].filter((l) => l.affectsScheduling).map((l) => ({ rating: l.rating, ts: l.ts }))
    const replayed = replayHistory(history, { ...opts.scheduler, fuzz: false })
    if (replayed) return { fsrs: replayed, replayed: true }
  }
  if (ta !== tb) return { fsrs: ta > tb ? a.fsrs : b.fsrs, replayed: false }
  if (a.fsrs.reps !== b.fsrs.reps) return { fsrs: a.fsrs.reps > b.fsrs.reps ? a.fsrs : b.fsrs, replayed: false }
  return { fsrs: tieBreak(a.fsrs, b.fsrs), replayed: false }
}

export function mergeStates(a: SyncState, b: SyncState, opts: MergeOptions): { state: SyncState; summary: MergeSummary } {
  const summary: MergeSummary = { added: { ...emptyCounts(), reviewLogs: 0 }, updated: emptyCounts(), deleted: emptyCounts(), resurrected: emptyCounts(), replayed: 0, settingsChanged: [] }

  // 1. Journal: union by id.
  const logs = new Map<string, ReviewLog>()
  for (const l of a.reviewLogs) logs.set(l.id, l)
  for (const l of b.reviewLogs) {
    if (!logs.has(l.id)) summary.added.reviewLogs++
    logs.set(l.id, l)
  }
  const reviewLogs = [...logs.values()].sort((x, y) => x.ts - y.ts || (x.id < y.id ? -1 : 1))
  const logsByExercise = new Map<string, ReviewLog[]>()
  for (const l of reviewLogs) {
    const list = logsByExercise.get(l.exerciseId) ?? []
    list.push(l)
    logsByExercise.set(l.exerciseId, list)
  }
  const idsA = new Set(a.reviewLogs.map((l) => l.id))
  const idsB = new Set(b.reviewLogs.map((l) => l.id))

  // Tombstones: latest per record.
  const tomb = tombstoneMap([...a.tombstones, ...b.tombstones])

  const mergeTable = <T extends Stamped>(table: SyncTable, la: T[], lb: T[], combine?: (x: T, y: T) => T): T[] => {
    const ma = new Map(la.map((r) => [r.id, r]))
    const mb = new Map(lb.map((r) => [r.id, r]))
    const ids = new Set([...ma.keys(), ...mb.keys()])
    const out: T[] = []
    for (const id of [...ids].sort()) {
      const x = ma.get(id)
      const y = mb.get(id)
      let r: T
      if (x && y) {
        r = combine ? combine(x, y) : newest(x, y)
        if (stamp(r) !== stamp(x) || JSON.stringify(r) !== JSON.stringify(x)) summary.updated[table]++
      } else {
        r = (x ?? y) as T
        if (!x) summary.added[table]++
      }
      const t = tomb.get(`${table}/${id}`)
      if (t) {
        if (t.deletedAt >= stamp(r)) {
          if (x) summary.deleted[table]++
          continue
        }
        // Modified after the deletion on the other side: the record comes back.
        tomb.delete(`${table}/${id}`)
        if (!x) summary.resurrected[table]++
      }
      out.push(r)
    }
    return out
  }

  const combineExercise = (x: Exercise, y: Exercise): Exercise => {
    const content = newest(x, y)
    const la = (logsByExercise.get(x.id) ?? []).filter((l) => idsA.has(l.id))
    const lb = (logsByExercise.get(x.id) ?? []).filter((l) => idsB.has(l.id))
    const { fsrs, replayed } = mergeFsrs(x, y, la, lb, opts)
    if (replayed) summary.replayed++
    const forced = [...new Set([...(x.forcedDue ?? []), ...(y.forcedDue ?? [])])].sort()
    return { ...content, fsrs, ...(forced.length ? { forcedDue: forced } : {}) }
  }

  const cahiers = mergeTable('cahiers', a.cahiers, b.cahiers)
  const chapitres = mergeTable('chapitres', a.chapitres, b.chapitres)
  const exercises = mergeTable('exercises', a.exercises, b.exercises, combineExercise)
  const points = mergeTable('points', a.points, b.points)
  const supplements = mergeTable('supplements', a.supplements, b.supplements)
  const mindmaps = mergeTable('mindmaps', a.mindmaps, b.mindmaps)

  // A deleted exercise takes its journal with it, as a local deletion does.
  const keptLogs = reviewLogs.filter((l) => !tomb.has(`exercises/${l.exerciseId}`))

  // 4. Settings, per key.
  const settings: Partial<Settings> = { ...a.settings }
  const settingsStamps: Record<string, number> = { ...a.settingsStamps }
  for (const key of new Set([...Object.keys(a.settings), ...Object.keys(b.settings)])) {
    if (key === 'id' || (DEVICE_SETTING_KEYS as string[]).includes(key)) continue
    const sa = a.settingsStamps[key] ?? 0
    const sb = b.settingsStamps[key] ?? 0
    const inA = key in a.settings
    const inB = key in b.settings
    const takeB = !inA || (inB && (sb > sa || (sb === sa && JSON.stringify((b.settings as Record<string, unknown>)[key]) > JSON.stringify((a.settings as Record<string, unknown>)[key]))))
    if (takeB) {
      const va = (a.settings as Record<string, unknown>)[key]
      const vb = (b.settings as Record<string, unknown>)[key]
      if (JSON.stringify(va) !== JSON.stringify(vb)) summary.settingsChanged.push(key)
      ;(settings as Record<string, unknown>)[key] = vb
      settingsStamps[key] = Math.max(sa, sb)
    } else settingsStamps[key] = Math.max(sa, sb)
  }
  for (const k of DEVICE_SETTING_KEYS) delete (settings as Record<string, unknown>)[k as string]

  return { state: { cahiers, chapitres, exercises, points, supplements, mindmaps, reviewLogs: keptLogs, tombstones: [...tomb.values()].sort((x, y) => x.deletedAt - y.deletedAt || (x.id < y.id ? -1 : 1)), settings, settingsStamps }, summary }
}

/** Drops tombstones older than 90 days (the other devices had time to see them). */
export function purgeTombstones(list: Tombstone[], now = Date.now(), days = TOMBSTONE_DAYS): Tombstone[] {
  return list.filter((t) => now - t.deletedAt < days * DAY)
}

/** Everything that changed after `since` (for a change lot). */
export function changesSince(state: SyncState, since: number): SyncState {
  const after = <T extends Stamped>(rows: T[]) => rows.filter((r) => stamp(r) > since)
  const stamps: Record<string, number> = {}
  const settings: Partial<Settings> = {}
  for (const [k, t] of Object.entries(state.settingsStamps)) {
    if (t > since && k in state.settings) {
      stamps[k] = t
      ;(settings as Record<string, unknown>)[k] = (state.settings as Record<string, unknown>)[k]
    }
  }
  return {
    cahiers: after(state.cahiers),
    chapitres: after(state.chapitres),
    exercises: after(state.exercises),
    points: after(state.points),
    supplements: after(state.supplements),
    mindmaps: after(state.mindmaps),
    reviewLogs: state.reviewLogs.filter((l) => l.ts > since),
    tombstones: state.tombstones.filter((t) => t.deletedAt > since),
    settings,
    settingsStamps: stamps,
  }
}

export function emptyState(): SyncState {
  return { cahiers: [], chapitres: [], exercises: [], points: [], supplements: [], mindmaps: [], reviewLogs: [], tombstones: [], settings: {}, settingsStamps: {} }
}

export function isEmptyState(s: SyncState): boolean {
  return SYNC_TABLES.every((t) => s[t].length === 0) && s.reviewLogs.length === 0 && s.tombstones.length === 0 && Object.keys(s.settings).length === 0
}
