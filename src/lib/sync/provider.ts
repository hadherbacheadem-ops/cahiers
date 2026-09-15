// ---------------------------------------------------------------------------
// Where the sync files live. The engine only needs a flat folder of named
// files with optimistic concurrency (ETag / If-Match); OneDrive appfolder, a
// local folder (File System Access) and an in-memory map (tests) implement it.
// ---------------------------------------------------------------------------

export interface SyncFileInfo {
  name: string
  etag: string
  size?: number
  modifiedAt?: number
}

export interface SyncReadResult {
  text: string
  etag: string
}

/** The file changed under us (or exists when it must not): re-read and retry. */
export class SyncConflictError extends Error {
  constructor(name: string) {
    super(`Conflit d’écriture sur ${name} : le fichier a changé entre-temps.`)
    this.name = 'SyncConflictError'
  }
}

/** Sign-in or permission problem: the user has to act. */
export class SyncAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SyncAuthError'
  }
}

export interface SyncProvider {
  readonly kind: 'memory' | 'file' | 'onedrive' | 'gdrive'
  /** Human-readable location (folder name, account…). */
  describe(): string
  list(): Promise<SyncFileInfo[]>
  /** `null` when the file does not exist. */
  read(name: string): Promise<SyncReadResult | null>
  /**
   * Writes the file. `ifMatch`: the ETag the file must still have (throws
   * SyncConflictError otherwise); `null`: the file must not exist yet;
   * `undefined`: unconditional.
   */
  write(name: string, text: string, ifMatch?: string | null): Promise<{ etag: string }>
  /** Missing files are not an error. */
  delete(name: string): Promise<void>
}

/** In-memory folder shared by simulated devices (tests). */
export class MemoryProvider implements SyncProvider {
  readonly kind = 'memory' as const
  private files = new Map<string, { text: string; etag: string }>()
  private counter = 0
  /** Test hook: runs before each write (to simulate a concurrent writer). */
  onBeforeWrite?: (name: string) => Promise<void> | void
  writes = 0

  describe() {
    return 'mémoire'
  }

  async list(): Promise<SyncFileInfo[]> {
    return [...this.files.entries()].map(([name, f]) => ({ name, etag: f.etag, size: f.text.length }))
  }

  async read(name: string): Promise<SyncReadResult | null> {
    const f = this.files.get(name)
    return f ? { text: f.text, etag: f.etag } : null
  }

  async write(name: string, text: string, ifMatch?: string | null): Promise<{ etag: string }> {
    await this.onBeforeWrite?.(name)
    const current = this.files.get(name)
    if (ifMatch === null && current) throw new SyncConflictError(name)
    if (typeof ifMatch === 'string' && current?.etag !== ifMatch) throw new SyncConflictError(name)
    const etag = `"m${++this.counter}"`
    this.files.set(name, { text, etag })
    this.writes++
    return { etag }
  }

  async delete(name: string): Promise<void> {
    this.files.delete(name)
  }

  /** Raw access for assertions. */
  snapshot(): Record<string, string> {
    return Object.fromEntries([...this.files.entries()].map(([k, v]) => [k, v.text]))
  }
}
