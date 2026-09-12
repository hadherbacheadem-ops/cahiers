// ---------------------------------------------------------------------------
// Exchange format written in the sync folder (OneDrive appfolder, or a plain
// folder / file for the degraded mode).
//
//   manifest.json                 index: current snapshot, change lots, devices
//   snapshot-<n>.json             the whole state (rewritten every 500 changes
//                                 or 7 days, then older lots are dropped)
//   changes-<deviceId>-<seq>.json what one device changed since the snapshot
//
// Every file carries `schemaVersion`; a file from an older build goes through
// migrateBackup() so that the row shapes are current. Files from a newer
// build are refused (never guess at data we do not understand).
// ---------------------------------------------------------------------------

import type { Settings, Tombstone } from '../../types'
import { BackupFormatError, migrateBackup, SCHEMA_VERSION, type BackupFile } from '../migrations'
import { emptyState, type SyncState } from './merge'

export const SNAPSHOT_EVERY_CHANGES = 500
export const SNAPSHOT_EVERY_MS = 7 * 86_400_000
export const MANIFEST_NAME = 'manifest.json'

export interface ManifestDevice {
  name: string
  lastSeen: number
}

export interface ManifestChanges {
  name: string
  deviceId: string
  seq: number
  writtenAt: number
  /** Number of rows in the lot (drives the snapshot rewrite). */
  count: number
}

export interface Manifest {
  app: 'cahiers'
  kind: 'manifest'
  schemaVersion: number
  snapshot: { name: string; seq: number; writtenAt: number } | null
  changes: ManifestChanges[]
  devices: Record<string, ManifestDevice>
}

export interface SnapshotFile extends SyncState {
  app: 'cahiers'
  kind: 'snapshot'
  schemaVersion: number
  seq: number
  writtenAt: number
  deviceId: string
}

export interface ChangesFile extends SyncState {
  app: 'cahiers'
  kind: 'changes'
  schemaVersion: number
  deviceId: string
  seq: number
  /** Changes strictly after this time… */
  since: number
  /** …up to this one (the device's clock). */
  writtenAt: number
}

export class SyncFormatError extends BackupFormatError {}

export function emptyManifest(): Manifest {
  return { app: 'cahiers', kind: 'manifest', schemaVersion: SCHEMA_VERSION, snapshot: null, changes: [], devices: {} }
}

export const snapshotName = (seq: number) => `snapshot-${seq}.json`
export const changesName = (deviceId: string, seq: number) => `changes-${deviceId}-${seq}.json`

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

/** Reads a manifest; a missing or broken one is treated as empty (the snapshot files are the truth). */
export function parseManifest(raw: unknown): Manifest {
  if (!isRecord(raw) || raw.app !== 'cahiers' || raw.kind !== 'manifest') throw new SyncFormatError('Le fichier manifest.json du dossier de synchronisation est illisible.')
  const declared = Number(raw.schemaVersion ?? 0)
  if (declared > SCHEMA_VERSION) throw new SyncFormatError(`Ce dossier est synchronisé par une version plus récente de l’application (schéma ${declared}, attendu ≤ ${SCHEMA_VERSION}).`)
  const changes = Array.isArray(raw.changes) ? (raw.changes as ManifestChanges[]).filter((c) => isRecord(c) && typeof c.name === 'string' && typeof c.deviceId === 'string') : []
  const snapshot = isRecord(raw.snapshot) && typeof raw.snapshot.name === 'string' ? (raw.snapshot as Manifest['snapshot']) : null
  return { app: 'cahiers', kind: 'manifest', schemaVersion: SCHEMA_VERSION, snapshot, changes, devices: isRecord(raw.devices) ? (raw.devices as Manifest['devices']) : {} }
}

/** Turns any backup (any schema version) into a sync state. Older files have neither tombstones nor stamps. */
export function stateFromBackup(file: BackupFile): SyncState {
  const { id: _id, ...settings } = file.settings
  const stamps: Record<string, number> = { ...(file.settingsStamps ?? {}) }
  for (const k of Object.keys(settings)) if (stamps[k] === undefined) stamps[k] = file.exportedAt
  return {
    cahiers: file.cahiers,
    chapitres: file.chapitres,
    exercises: file.exercises,
    points: file.points,
    supplements: file.supplements,
    mindmaps: file.mindmaps,
    reviewLogs: file.reviewLogs,
    tombstones: file.tombstones ?? [],
    settings: settings as Partial<Settings>,
    settingsStamps: stamps,
  }
}

/**
 * Parses a snapshot or a change lot. A corrupted file throws; a file from an
 * older schema is upgraded row by row; a newer one is refused.
 */
export function parseSyncFile(raw: unknown): SnapshotFile | ChangesFile {
  if (!isRecord(raw) || raw.app !== 'cahiers') throw new SyncFormatError('Ce fichier n’est pas un fichier de synchronisation Cahiers.')
  if (raw.kind !== 'snapshot' && raw.kind !== 'changes') throw new SyncFormatError('Type de fichier de synchronisation inconnu.')
  const declared = Number(raw.schemaVersion ?? 0)
  if (!Number.isFinite(declared) || declared < 1) throw new SyncFormatError('Version du fichier de synchronisation illisible.')
  if (declared > SCHEMA_VERSION) throw new SyncFormatError(`Ce fichier vient d’une version plus récente de l’application (schéma ${declared}, attendu ≤ ${SCHEMA_VERSION}).`)
  for (const key of ['cahiers', 'chapitres', 'exercises', 'points', 'supplements', 'mindmaps', 'reviewLogs', 'tombstones'] as const) {
    if (raw[key] !== undefined && !Array.isArray(raw[key])) throw new SyncFormatError(`Fichier de synchronisation corrompu (${key}).`)
  }
  if (typeof raw.deviceId !== 'string' || typeof raw.seq !== 'number') throw new SyncFormatError('Fichier de synchronisation corrompu (en-tête).')
  const settings = isRecord(raw.settings) ? raw.settings : {}
  // migrateBackup upgrades exercises of older schemas (SM-2 → FSRS, missing fields).
  const upgraded = migrateBackup({ ...raw, settings: { ...settings }, exportedAt: raw.writtenAt })
  const base = stateFromBackup({ ...upgraded, settingsStamps: isRecord(raw.settingsStamps) ? (raw.settingsStamps as Record<string, number>) : {} })
  // A partial file (change lot) carries only the changed settings: keep it partial.
  base.settings = settings as Partial<Settings>
  base.settingsStamps = isRecord(raw.settingsStamps) ? (raw.settingsStamps as Record<string, number>) : Object.fromEntries(Object.keys(settings).map((k) => [k, Number(raw.writtenAt) || 0]))
  const tombstones = (raw.tombstones as Tombstone[] | undefined) ?? []
  const header = { app: 'cahiers' as const, schemaVersion: SCHEMA_VERSION, deviceId: raw.deviceId, seq: raw.seq, writtenAt: Number(raw.writtenAt) || 0 }
  if (raw.kind === 'snapshot') return { ...emptyState(), ...base, tombstones, ...header, kind: 'snapshot' }
  return { ...emptyState(), ...base, tombstones, ...header, kind: 'changes', since: Number(raw.since) || 0 }
}

export function makeSnapshot(state: SyncState, deviceId: string, seq: number, writtenAt = Date.now()): SnapshotFile {
  return { app: 'cahiers', kind: 'snapshot', schemaVersion: SCHEMA_VERSION, seq, writtenAt, deviceId, ...state }
}

export function makeChanges(state: SyncState, deviceId: string, seq: number, since: number, writtenAt = Date.now()): ChangesFile {
  return { app: 'cahiers', kind: 'changes', schemaVersion: SCHEMA_VERSION, seq, since, writtenAt, deviceId, ...state }
}

/** Rows in a state (to decide when the snapshot must be rewritten). */
export function countRows(state: SyncState): number {
  return state.cahiers.length + state.chapitres.length + state.exercises.length + state.points.length + state.supplements.length + state.mindmaps.length + state.reviewLogs.length + state.tombstones.length + Object.keys(state.settings).length
}
