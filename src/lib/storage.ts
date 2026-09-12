// ---------------------------------------------------------------------------
// Persistence and portability: persistent storage request (so the browser does
// not evict IndexedDB under pressure), and an automatic backup to a file the
// user picked once (File System Access API, Chromium only), rewritten after
// every change with a debounce. The handle survives reloads in IndexedDB.
// ---------------------------------------------------------------------------

import Dexie from 'dexie'
import { db, exportBackup } from '../db'

const AUTOSAVE_DEBOUNCE_MS = 2500

export interface PersistenceStatus {
  supported: boolean
  persisted: boolean | null
  /** Safari evicts unused site data after 7 days without a visit. */
  safari: boolean
  usageBytes?: number
  quotaBytes?: number
}

export function isSafari(): boolean {
  const ua = navigator.userAgent
  return /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Firefox/i.test(ua)
}

export async function persistenceStatus(): Promise<PersistenceStatus> {
  const supported = typeof navigator !== 'undefined' && !!navigator.storage?.persisted
  if (!supported) return { supported: false, persisted: null, safari: isSafari() }
  const persisted = await navigator.storage.persisted()
  let usageBytes: number | undefined
  let quotaBytes: number | undefined
  try {
    const est = await navigator.storage.estimate()
    usageBytes = est.usage
    quotaBytes = est.quota
  } catch {
    // estimate() is optional
  }
  return { supported: true, persisted, safari: isSafari(), usageBytes, quotaBytes }
}

/** Asks the browser to keep the site data. Called once the user has something to lose. */
export async function requestPersistence(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false
  try {
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

// ---- Autosave to a file ------------------------------------------------------

type FileHandleLike = {
  name: string
  queryPermission?: (o: { mode: 'readwrite' }) => Promise<PermissionState>
  requestPermission?: (o: { mode: 'readwrite' }) => Promise<PermissionState>
  createWritable: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }>
}

const HANDLE_KEY = 'autosaveHandle'
const STATE_KEY = 'autosaveState'

export interface AutosaveState {
  fileName: string
  lastSavedAt?: number
  lastError?: string
}

export function autosaveSupported(): boolean {
  return typeof window !== 'undefined' && 'showSaveFilePicker' in window
}

export async function getAutosaveHandle(): Promise<FileHandleLike | null> {
  const row = await db.kv.get(HANDLE_KEY)
  return (row?.value as FileHandleLike | undefined) ?? null
}

export async function getAutosaveState(): Promise<AutosaveState | null> {
  const row = await db.kv.get(STATE_KEY)
  return (row?.value as AutosaveState | undefined) ?? null
}

async function setAutosaveState(patch: Partial<AutosaveState>) {
  const current = (await getAutosaveState()) ?? { fileName: '' }
  await db.kv.put({ key: STATE_KEY, value: { ...current, ...patch } })
}

/** Lets the user pick (or create) the backup file; must run from a user gesture. */
export async function chooseAutosaveFile(): Promise<AutosaveState> {
  const picker = (window as unknown as { showSaveFilePicker: (o: unknown) => Promise<FileHandleLike> }).showSaveFilePicker
  const handle = await picker({
    suggestedName: 'cahiers-sauvegarde.json',
    types: [{ description: 'Sauvegarde Cahiers (JSON)', accept: { 'application/json': ['.json'] } }],
  })
  await db.kv.put({ key: HANDLE_KEY, value: handle })
  const state: AutosaveState = { fileName: handle.name }
  await db.kv.put({ key: STATE_KEY, value: state })
  await writeBackupNow()
  return (await getAutosaveState()) ?? state
}

export async function stopAutosave() {
  await db.kv.delete(HANDLE_KEY)
  await db.kv.delete(STATE_KEY)
}

/** 'granted' | 'prompt' | 'denied' | 'none' (no file chosen). */
export async function autosavePermission(): Promise<PermissionState | 'none'> {
  const handle = await getAutosaveHandle()
  if (!handle) return 'none'
  if (!handle.queryPermission) return 'granted'
  return handle.queryPermission({ mode: 'readwrite' })
}

/** Re-asks for write access after a reload (user gesture required). */
export async function resumeAutosave(): Promise<boolean> {
  const handle = await getAutosaveHandle()
  if (!handle?.requestPermission) return !!handle
  const p = await handle.requestPermission({ mode: 'readwrite' })
  if (p === 'granted') {
    await writeBackupNow()
    return true
  }
  return false
}

let writing = false
let pendingAgain = false

export async function writeBackupNow(): Promise<void> {
  const handle = await getAutosaveHandle()
  if (!handle) return
  if (writing) {
    pendingAgain = true
    return
  }
  writing = true
  try {
    if (handle.queryPermission && (await handle.queryPermission({ mode: 'readwrite' })) !== 'granted') {
      await setAutosaveState({ lastError: 'Autorisation d’écriture à renouveler.' })
      return
    }
    const backup = await exportBackup()
    const w = await handle.createWritable()
    await w.write(JSON.stringify(backup))
    await w.close()
    await setAutosaveState({ lastSavedAt: Date.now(), lastError: undefined })
  } catch (e) {
    await setAutosaveState({ lastError: e instanceof Error ? e.message : 'Écriture impossible.' })
  } finally {
    writing = false
    if (pendingAgain) {
      pendingAgain = false
      void writeBackupNow()
    }
  }
}

let timer: number | undefined

/**
 * Rewrites the backup file a moment after any change to the data tables.
 * Dexie emits 'storagemutated' for every write, this tab's or another's.
 */
export function startAutosave() {
  if (typeof window === 'undefined') return
  Dexie.on('storagemutated', (parts) => {
    // Keys look like "idb://cahiers/exercises/…"; writes to the kv table itself
    // (autosave state) must not retrigger a save.
    const dataChanged = Object.keys(parts).some((p) => !/\/kv\b/.test(p))
    if (!dataChanged) return
    window.clearTimeout(timer)
    timer = window.setTimeout(() => void writeBackupNow(), AUTOSAVE_DEBOUNCE_MS)
  })
}

/** Newest modification in the database, to detect an older backup being restored over newer data. */
export async function latestChangeAt(): Promise<number> {
  const [c, ch, e, l] = await Promise.all([
    db.cahiers.orderBy('createdAt').last(),
    db.chapitres.orderBy('createdAt').last(),
    db.exercises.toCollection().last(),
    db.reviewLogs.orderBy('ts').last(),
  ])
  return Math.max(c?.updatedAt ?? 0, ch?.updatedAt ?? 0, e?.updatedAt ?? 0, l?.ts ?? 0)
}
