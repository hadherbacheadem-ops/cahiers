// ---------------------------------------------------------------------------
// Degraded mode without a Microsoft account: a local folder (File System
// Access API, Chrome / Edge) — typically one that Drive, OneDrive or Dropbox
// already mirrors between the devices. ETag = "lastModified:size" of the
// file; the check-then-write is not atomic, which is acceptable for a folder
// used by one person on two devices.
// ---------------------------------------------------------------------------

import { db } from '../../db'
import { SyncAuthError, SyncConflictError, type SyncFileInfo, type SyncProvider, type SyncReadResult } from './provider'

type FileLike = { name: string; lastModified: number; size: number; text: () => Promise<string> }
type FileHandleLike = { kind: 'file'; name: string; getFile: () => Promise<FileLike>; createWritable: () => Promise<{ write: (d: string) => Promise<void>; close: () => Promise<void> }> }
export type DirectoryHandleLike = {
  kind: 'directory'
  name: string
  queryPermission?: (o: { mode: 'readwrite' }) => Promise<PermissionState>
  requestPermission?: (o: { mode: 'readwrite' }) => Promise<PermissionState>
  getFileHandle: (name: string, o?: { create?: boolean }) => Promise<FileHandleLike>
  removeEntry: (name: string) => Promise<void>
  entries: () => AsyncIterable<[string, { kind: string }]>
}

export const SYNC_DIR_KEY = 'syncDirHandle'

export function fileProviderSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

/** Lets the user pick the folder (user gesture required) and remembers it. */
export async function chooseSyncDirectory(): Promise<DirectoryHandleLike> {
  const picker = (window as unknown as { showDirectoryPicker: (o: unknown) => Promise<DirectoryHandleLike> }).showDirectoryPicker
  const handle = await picker({ mode: 'readwrite', id: 'cahiers-sync' })
  await db.kv.put({ key: SYNC_DIR_KEY, value: handle })
  return handle
}

export async function getSyncDirectory(): Promise<DirectoryHandleLike | null> {
  return ((await db.kv.get(SYNC_DIR_KEY))?.value as DirectoryHandleLike | undefined) ?? null
}

export async function forgetSyncDirectory() {
  await db.kv.delete(SYNC_DIR_KEY)
}

export async function syncDirectoryPermission(): Promise<PermissionState | 'none'> {
  const h = await getSyncDirectory()
  if (!h) return 'none'
  return h.queryPermission ? h.queryPermission({ mode: 'readwrite' }) : 'granted'
}

/** Re-asks for access after a reload (user gesture required). */
export async function resumeSyncDirectory(): Promise<boolean> {
  const h = await getSyncDirectory()
  if (!h) return false
  if (!h.requestPermission) return true
  return (await h.requestPermission({ mode: 'readwrite' })) === 'granted'
}

function etagOf(f: FileLike): string {
  return `${f.lastModified}:${f.size}`
}

export class FileProvider implements SyncProvider {
  readonly kind = 'file' as const
  private dir: DirectoryHandleLike
  constructor(dir: DirectoryHandleLike) {
    this.dir = dir
  }

  static async fromStored(): Promise<FileProvider> {
    const h = await getSyncDirectory()
    if (!h) throw new SyncAuthError('Aucun dossier de synchronisation choisi.')
    if (h.queryPermission && (await h.queryPermission({ mode: 'readwrite' })) !== 'granted') throw new SyncAuthError('Autorisation d’accès au dossier à renouveler (Réglages → Synchronisation).')
    return new FileProvider(h)
  }

  describe() {
    return `dossier « ${this.dir.name} »`
  }

  async list(): Promise<SyncFileInfo[]> {
    const out: SyncFileInfo[] = []
    for await (const [name, entry] of this.dir.entries()) {
      if (entry.kind !== 'file' || !name.endsWith('.json')) continue
      const f = await (await this.dir.getFileHandle(name)).getFile()
      out.push({ name, etag: etagOf(f), size: f.size, modifiedAt: f.lastModified })
    }
    return out
  }

  private async current(name: string): Promise<FileLike | null> {
    try {
      return await (await this.dir.getFileHandle(name)).getFile()
    } catch (e) {
      if (e instanceof DOMException && e.name === 'NotFoundError') return null
      throw e
    }
  }

  async read(name: string): Promise<SyncReadResult | null> {
    const f = await this.current(name)
    return f ? { text: await f.text(), etag: etagOf(f) } : null
  }

  async write(name: string, text: string, ifMatch?: string | null): Promise<{ etag: string }> {
    const before = await this.current(name)
    if (ifMatch === null && before) throw new SyncConflictError(name)
    if (typeof ifMatch === 'string' && (!before || etagOf(before) !== ifMatch)) throw new SyncConflictError(name)
    const h = await this.dir.getFileHandle(name, { create: true })
    const w = await h.createWritable()
    await w.write(text)
    await w.close()
    return { etag: etagOf(await h.getFile()) }
  }

  async delete(name: string): Promise<void> {
    try {
      await this.dir.removeEntry(name)
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'NotFoundError')) throw e
    }
  }
}
