// ---------------------------------------------------------------------------
// One synchronisation round against a provider:
//
//   1. read manifest.json (ETag kept)
//   2. pull: the snapshot if newer than the one applied, then every change
//      lot of the other devices not applied yet → merged into the database
//   3. push: what this device changed since its last push, as a change lot
//      (or a whole new snapshot when the folder has none, every 500 changes,
//      or after 7 days) — files are created, never overwritten
//   4. write manifest.json with If-Match; a 412 means someone else synced
//      in between: the files written in this round are removed and the round
//      starts again (3 attempts)
//
// Nothing here talks to the UI; the cursor (what was applied / pushed) lives
// in the kv table so a reload continues where it stopped.
// ---------------------------------------------------------------------------

import { applySyncState, db, mergeIntoDb, readSyncState, type CahiersDb } from '../../db'
import { DEFAULT_SETTINGS } from '../../types'
import { getDeviceId, getDeviceName } from './device'
import { changesName, countRows, emptyManifest, makeChanges, makeSnapshot, MANIFEST_NAME, parseManifest, parseSyncFile, SNAPSHOT_EVERY_CHANGES, SNAPSHOT_EVERY_MS, snapshotName, type Manifest, type ManifestDevice } from './format'
import { emptyState, mergeStates, type MergeSummary, type SyncState } from './merge'
import { SyncConflictError, type SyncProvider } from './provider'

export const SYNC_CURSOR_KEY = 'syncCursor'
export const SYNC_STATUS_KEY = 'syncStatus'
export const SYNC_CONFIG_KEY = 'syncConfig'
export const MAX_ATTEMPTS = 3

export interface SyncCursor {
  /** Provider the cursor belongs to; another provider starts from scratch. */
  provider: string
  appliedSnapshotSeq: number
  /** Highest change-lot seq applied, per device. */
  applied: Record<string, number>
  mySeq: number
  /** Local changes up to this time have been pushed. */
  mark: number
}

export interface SyncConfig {
  provider: 'none' | 'onedrive' | 'file'
  /** Sync at start-up, after changes and every 10 minutes. */
  auto: boolean
}

export interface SyncResult {
  pulled: MergeSummary | null
  pushedRows: number
  snapshotWritten: boolean
  attempts: number
  devices: Record<string, ManifestDevice>
}

export interface SyncStatus {
  lastSyncAt?: number
  lastError?: string
  lastResult?: SyncResult
  running?: boolean
}

export const DEFAULT_SYNC_CONFIG: SyncConfig = { provider: 'none', auto: true }

class RetryRound extends Error {}

function freshCursor(provider: string): SyncCursor {
  return { provider, appliedSnapshotSeq: 0, applied: {}, mySeq: 0, mark: 0 }
}

export async function getSyncCursor(provider: string, database: CahiersDb = db): Promise<SyncCursor> {
  const c = (await database.kv.get(SYNC_CURSOR_KEY))?.value as SyncCursor | undefined
  return c && c.provider === provider ? c : freshCursor(provider)
}

export async function resetSyncCursor(database: CahiersDb = db) {
  await database.kv.delete(SYNC_CURSOR_KEY)
}

export async function getSyncConfig(database: CahiersDb = db): Promise<SyncConfig> {
  return { ...DEFAULT_SYNC_CONFIG, ...((await database.kv.get(SYNC_CONFIG_KEY))?.value as Partial<SyncConfig> | undefined) }
}

export async function setSyncConfig(patch: Partial<SyncConfig>, database: CahiersDb = db) {
  await database.kv.put({ key: SYNC_CONFIG_KEY, value: { ...(await getSyncConfig(database)), ...patch } })
}

export async function getSyncStatus(database: CahiersDb = db): Promise<SyncStatus> {
  return ((await database.kv.get(SYNC_STATUS_KEY))?.value as SyncStatus | undefined) ?? {}
}

async function patchStatus(patch: Partial<SyncStatus>, database: CahiersDb) {
  await database.kv.put({ key: SYNC_STATUS_KEY, value: { ...(await getSyncStatus(database)), ...patch } })
}

/** What this device changed after `since` (its own rows only: the others' rows came from the folder). */
export function localChanges(state: SyncState, since: number, me: string): SyncState {
  const mine = <T extends { deviceId?: string; updatedAt?: number; createdAt?: number }>(rows: T[]) => rows.filter((r) => (r.deviceId ?? me) === me && (r.updatedAt ?? r.createdAt ?? 0) > since)
  const settings: SyncState['settings'] = {}
  const settingsStamps: Record<string, number> = {}
  for (const [k, t] of Object.entries(state.settingsStamps)) {
    if (t > since && k in state.settings) {
      settingsStamps[k] = t
      ;(settings as Record<string, unknown>)[k] = (state.settings as Record<string, unknown>)[k]
    }
  }
  return {
    cahiers: mine(state.cahiers),
    chapitres: mine(state.chapitres),
    exercises: mine(state.exercises),
    points: mine(state.points),
    supplements: mine(state.supplements),
    mindmaps: mine(state.mindmaps),
    reviewLogs: state.reviewLogs.filter((l) => (l.deviceId ?? me) === me && l.ts > since),
    tombstones: state.tombstones.filter((t) => t.deviceId === me && t.deletedAt > since),
    settings,
    settingsStamps,
  }
}

export interface SyncOptions {
  database?: CahiersDb
  deviceId?: string
  deviceName?: string
  now?: number
}

/**
 * One full round. Throws on network / auth errors and after MAX_ATTEMPTS
 * consecutive manifest conflicts; the database is never left half-merged
 * (each merge is one transaction).
 */
export async function syncOnce(provider: SyncProvider, opts: SyncOptions = {}): Promise<SyncResult> {
  const database = opts.database ?? db
  const me = opts.deviceId ?? getDeviceId()
  const name = opts.deviceName ?? getDeviceName()
  let lastConflict: Error | null = null
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const now = opts.now ?? Date.now()
    const written: string[] = []
    try {
      const result = await round(provider, { database, me, name, now, written })
      return { ...result, attempts: attempt }
    } catch (e) {
      if (!(e instanceof SyncConflictError || e instanceof RetryRound)) throw e
      lastConflict = e
      // Files created this round would be orphans: remove them before starting over.
      for (const f of written) await provider.delete(f).catch(() => undefined)
    }
  }
  throw new Error(`Synchronisation abandonnée après ${MAX_ATTEMPTS} tentatives : un autre appareil écrit en même temps. ${lastConflict?.message ?? ''}`.trim())
}

async function round(provider: SyncProvider, ctx: { database: CahiersDb; me: string; name: string; now: number; written: string[] }): Promise<Omit<SyncResult, 'attempts'>> {
  const { database, me, name, now, written } = ctx
  const cursor = await getSyncCursor(provider.kind, database)
  const manifestRead = await provider.read(MANIFEST_NAME)
  const manifest: Manifest = manifestRead ? parseManifest(JSON.parse(manifestRead.text)) : emptyManifest()
  const manifestEtag = manifestRead?.etag ?? null

  // ---- pull ----------------------------------------------------------------
  let remote: SyncState = emptyState()
  let pulledAny = false
  const applied: Record<string, number> = { ...cursor.applied }
  let appliedSnapshotSeq = cursor.appliedSnapshotSeq
  const options = await schedulerOptions(database)
  if (manifest.snapshot && manifest.snapshot.seq > appliedSnapshotSeq) {
    const file = await provider.read(manifest.snapshot.name)
    // Folded away by a newer snapshot we have not seen: the manifest we hold is stale.
    if (!file) throw new RetryRound(`snapshot ${manifest.snapshot.name} introuvable`)
    remote = mergeStates(remote, parseSyncFile(JSON.parse(file.text)), options).state
    pulledAny = true
    appliedSnapshotSeq = manifest.snapshot.seq
  }
  for (const lot of manifest.changes) {
    if (lot.deviceId === me || lot.seq <= (applied[lot.deviceId] ?? 0)) continue
    const file = await provider.read(lot.name)
    if (!file) throw new RetryRound(`lot ${lot.name} introuvable`)
    remote = mergeStates(remote, parseSyncFile(JSON.parse(file.text)), options).state
    applied[lot.deviceId] = Math.max(applied[lot.deviceId] ?? 0, lot.seq)
    pulledAny = true
  }
  const pulled = pulledAny ? await mergeIntoDb(remote, database) : null

  // ---- push ----------------------------------------------------------------
  const local = await readSyncState(database)
  const delta = localChanges(local, cursor.mark, me)
  const pushedRows = countRows(delta)
  const next: Manifest = { ...manifest, changes: [...manifest.changes], devices: { ...manifest.devices, [me]: { name, lastSeen: now } } }
  const lotRows = manifest.changes.reduce((n, c) => n + (c.count || 0), 0)
  const needSnapshot = !manifest.snapshot || lotRows + pushedRows >= SNAPSHOT_EVERY_CHANGES || now - manifest.snapshot.writtenAt >= SNAPSHOT_EVERY_MS
  let snapshotWritten = false
  let mySeq = Math.max(cursor.mySeq, ...manifest.changes.filter((c) => c.deviceId === me).map((c) => c.seq))
  const toDelete: string[] = []

  if (needSnapshot && (pushedRows > 0 || pulledAny || !manifest.snapshot || lotRows > 0)) {
    const seq = (manifest.snapshot?.seq ?? 0) + 1
    const fileName = snapshotName(seq)
    await provider.write(fileName, JSON.stringify(makeSnapshot(local, me, seq, now)), null)
    written.push(fileName)
    next.snapshot = { name: fileName, seq, writtenAt: now }
    toDelete.push(...manifest.changes.map((c) => c.name))
    // Keep the previous snapshot one generation (a device holding the old manifest can still read it).
    if (manifest.snapshot && manifest.snapshot.seq >= 2) toDelete.push(snapshotName(manifest.snapshot.seq - 1))
    next.changes = []
    appliedSnapshotSeq = seq
    snapshotWritten = true
  } else if (pushedRows > 0) {
    mySeq += 1
    const fileName = changesName(me, mySeq)
    await provider.write(fileName, JSON.stringify(makeChanges(delta, me, mySeq, cursor.mark, now)), null)
    written.push(fileName)
    next.changes.push({ name: fileName, deviceId: me, seq: mySeq, writtenAt: now, count: pushedRows })
  }

  // ---- manifest (the only contended write) -----------------------------------
  await provider.write(MANIFEST_NAME, JSON.stringify(next), manifestEtag)
  for (const f of toDelete) await provider.delete(f).catch(() => undefined)

  await database.kv.put({ key: SYNC_CURSOR_KEY, value: { provider: provider.kind, appliedSnapshotSeq, applied, mySeq, mark: now } satisfies SyncCursor })
  return { pulled, pushedRows, snapshotWritten, devices: next.devices }
}

async function schedulerOptions(database: CahiersDb) {
  const s = { ...DEFAULT_SETTINGS, ...(await database.settings.get('app')) }
  return { scheduler: { desiredRetention: s.desiredRetention, maximumInterval: s.maximumInterval } }
}

/** Replaces the local data by the folder's content (rarely needed; the merge is the normal path). */
export async function pullSnapshotOnly(provider: SyncProvider, database: CahiersDb = db): Promise<boolean> {
  const manifestRead = await provider.read(MANIFEST_NAME)
  if (!manifestRead) return false
  const manifest = parseManifest(JSON.parse(manifestRead.text))
  if (!manifest.snapshot) return false
  const file = await provider.read(manifest.snapshot.name)
  if (!file) return false
  await applySyncState(parseSyncFile(JSON.parse(file.text)), database)
  return true
}

// ---- Runner used by the app (status in kv, automatic rounds) -----------------

export type ProviderFactory = (config: SyncConfig) => Promise<SyncProvider | null>

let running: Promise<SyncResult | null> | null = null
let onRoundEnd: (() => void) | undefined

/** Hook for the app wiring (ignore the mutations a round itself caused). */
export function setOnRoundEnd(cb: () => void) {
  onRoundEnd = cb
}

/** Runs one round, records the status; never throws (the status carries the error). */
export async function runSync(makeProvider: ProviderFactory, database: CahiersDb = db): Promise<SyncResult | null> {
  if (running) return running
  running = (async () => {
    const config = await getSyncConfig(database)
    if (config.provider === 'none') return null
    let provider: SyncProvider | null
    try {
      provider = await makeProvider(config)
    } catch (e) {
      await patchStatus({ lastError: e instanceof Error ? e.message : String(e), running: false }, database)
      return null
    }
    if (!provider) return null
    await patchStatus({ running: true, lastError: undefined }, database)
    try {
      const result = await syncOnce(provider, { database })
      await patchStatus({ running: false, lastSyncAt: Date.now(), lastError: undefined, lastResult: result }, database)
      return result
    } catch (e) {
      await patchStatus({ running: false, lastError: e instanceof Error ? e.message : String(e) }, database)
      return null
    }
  })().finally(() => {
    running = null
    onRoundEnd?.()
  })
  return running
}

export const AUTO_SYNC_INTERVAL_MS = 10 * 60_000
export const AUTO_SYNC_AFTER_CHANGE_MS = 30_000

/**
 * Automatic rounds: at start-up, 30 s after the last local change (so a
 * session syncs once it ends), every 10 minutes while the tab is visible,
 * and when the tab becomes visible again. Offline: skipped.
 */
export function startAutoSync(makeProvider: ProviderFactory, subscribeChanges: (cb: () => void) => void): () => void {
  if (typeof window === 'undefined') return () => undefined
  let lastRun = 0
  const run = async () => {
    if (navigator.onLine === false || document.visibilityState === 'hidden') return
    const config = await getSyncConfig()
    if (config.provider === 'none' || !config.auto) return
    lastRun = Date.now()
    await runSync(makeProvider)
  }
  const startTimer = window.setTimeout(run, 3000)
  const interval = window.setInterval(run, AUTO_SYNC_INTERVAL_MS)
  let changeTimer: number | undefined
  subscribeChanges(() => {
    window.clearTimeout(changeTimer)
    changeTimer = window.setTimeout(run, AUTO_SYNC_AFTER_CHANGE_MS)
  })
  const onVisible = () => {
    if (document.visibilityState === 'visible' && Date.now() - lastRun > 60_000) void run()
  }
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('online', onVisible)
  return () => {
    window.clearTimeout(startTimer)
    window.clearInterval(interval)
    window.clearTimeout(changeTimer)
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('online', onVisible)
  }
}
