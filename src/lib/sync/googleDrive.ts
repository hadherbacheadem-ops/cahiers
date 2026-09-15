// ---------------------------------------------------------------------------
// Google Drive « appDataFolder » as a sync folder (ADR 0002). The folder is
// private to the app, invisible in Drive, inside the user's own quota; the
// token comes from the user's own OAuth client (src/lib/googleAuth.ts).
//
// Drive v3 has no conditional write (If-Match): the engine's optimistic
// concurrency is emulated with the file's `version`, a counter Drive bumps on
// every change. Write = check the version → upload → read the new version; a
// jump of more than one means someone wrote in between → SyncConflictError,
// and the engine re-reads and retries. Change files are per-device and never
// rewritten, so the only contested file is the manifest.
// ---------------------------------------------------------------------------

import { SyncAuthError, SyncConflictError, type SyncFileInfo, type SyncProvider, type SyncReadResult } from './provider'

const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
const FIELDS = 'id,name,version,size,modifiedTime,createdTime'

export interface GoogleDriveOptions {
  getToken: () => Promise<string>
  fetchImpl?: typeof fetch
}

type Meta = { id: string; name: string; version: string; size?: string; modifiedTime?: string; createdTime?: string }

export class GoogleDriveAppDataProvider implements SyncProvider {
  readonly kind = 'gdrive' as const
  private getToken: () => Promise<string>
  private fetchImpl: typeof fetch

  constructor(opts: GoogleDriveOptions) {
    this.getToken = opts.getToken
    this.fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init))
  }

  describe() {
    return 'Google Drive (dossier d’application)'
  }

  private async call(url: string, init: RequestInit = {}, retry = true): Promise<Response> {
    const token = await this.getToken()
    const res = await this.fetchImpl(url, { ...init, headers: { ...((init.headers as Record<string, string>) ?? {}), Authorization: `Bearer ${token}` } })
    if (res.status === 401 || res.status === 403) {
      throw new SyncAuthError(`Google Drive : accès refusé (${res.status}). Reconnecte-toi à Google dans Réglages → Synchronisation.`)
    }
    if ((res.status === 429 || res.status >= 500) && retry) {
      await new Promise((r) => setTimeout(r, 800))
      return this.call(url, init, false)
    }
    return res
  }

  private async metaOf(id: string): Promise<Meta | null> {
    const res = await this.call(`${API}/files/${encodeURIComponent(id)}?fields=${FIELDS}`)
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`Google Drive : lecture impossible (${res.status}).`)
    return (await res.json()) as Meta
  }

  /** The file of that name in the app folder. Two devices creating the same name at once leave duplicates: the oldest wins, the others go. */
  private async find(name: string): Promise<Meta | null> {
    const q = new URLSearchParams({ spaces: 'appDataFolder', q: `name = '${name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`, fields: `files(${FIELDS})`, pageSize: '10' })
    const res = await this.call(`${API}/files?${q}`)
    if (!res.ok) throw new Error(`Google Drive : recherche impossible (${res.status}).`)
    const files = (((await res.json()) as { files?: Meta[] }).files ?? []).filter((f) => f.name === name)
    files.sort((a, b) => (a.createdTime ?? '').localeCompare(b.createdTime ?? '') || a.id.localeCompare(b.id))
    for (const extra of files.slice(1)) await this.call(`${API}/files/${encodeURIComponent(extra.id)}`, { method: 'DELETE' })
    return files[0] ?? null
  }

  async list(): Promise<SyncFileInfo[]> {
    const out: SyncFileInfo[] = []
    let pageToken: string | undefined
    do {
      const q = new URLSearchParams({ spaces: 'appDataFolder', fields: `nextPageToken,files(${FIELDS})`, pageSize: '1000' })
      if (pageToken) q.set('pageToken', pageToken)
      const res = await this.call(`${API}/files?${q}`)
      if (!res.ok) throw new Error(`Google Drive : liste impossible (${res.status}).`)
      const body = (await res.json()) as { files?: Meta[]; nextPageToken?: string }
      for (const f of body.files ?? []) out.push({ name: f.name, etag: f.version, size: f.size ? Number(f.size) : undefined, modifiedAt: f.modifiedTime ? Date.parse(f.modifiedTime) : undefined })
      pageToken = body.nextPageToken
    } while (pageToken)
    return out
  }

  async read(name: string): Promise<SyncReadResult | null> {
    const f = await this.find(name)
    if (!f) return null
    // The content and its version are two requests: re-read when the file moved in between.
    for (let attempt = 0; attempt < 3; attempt++) {
      const before = attempt === 0 ? f : await this.metaOf(f.id)
      if (!before) return null
      const res = await this.call(`${API}/files/${encodeURIComponent(f.id)}?alt=media`)
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`Google Drive : téléchargement impossible (${res.status}).`)
      const text = await res.text()
      const after = await this.metaOf(f.id)
      if (!after) return null
      if (after.version === before.version) return { text, etag: after.version }
    }
    throw new SyncConflictError(name)
  }

  async write(name: string, text: string, ifMatch?: string | null): Promise<{ etag: string }> {
    const current = await this.find(name)
    if (ifMatch === null && current) throw new SyncConflictError(name)
    if (typeof ifMatch === 'string') {
      if (!current || current.version !== ifMatch) throw new SyncConflictError(name)
    }
    if (current) {
      const res = await this.call(`${UPLOAD}/files/${encodeURIComponent(current.id)}?uploadType=media&fields=id,version`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body: text,
      })
      if (!res.ok) throw new Error(`Google Drive : écriture impossible (${res.status}).`)
      const after = (await res.json()) as Meta
      // No If-Match on Drive: a write that landed between our check and ours shows as a version jump > 1.
      if (typeof ifMatch === 'string' && Number(after.version) !== Number(ifMatch) + 1) throw new SyncConflictError(name)
      return { etag: after.version }
    }
    const boundary = `cahiers-${Math.random().toString(36).slice(2)}`
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: ['appDataFolder'] })}\r\n` +
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${text}\r\n--${boundary}--`
    const res = await this.call(`${UPLOAD}/files?uploadType=multipart&fields=id,version`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    })
    if (!res.ok) throw new Error(`Google Drive : création impossible (${res.status}).`)
    const created = (await res.json()) as Meta
    if (ifMatch === null) {
      // « Must not exist »: two devices may have created it at once; find() keeps the oldest, so ours may be gone.
      const survivor = await this.find(name)
      if (!survivor || survivor.id !== created.id) throw new SyncConflictError(name)
    }
    return { etag: created.version }
  }

  async delete(name: string): Promise<void> {
    const f = await this.find(name)
    if (!f) return
    const res = await this.call(`${API}/files/${encodeURIComponent(f.id)}`, { method: 'DELETE' })
    if (!res.ok && res.status !== 404) throw new Error(`Google Drive : suppression impossible (${res.status}).`)
  }
}
