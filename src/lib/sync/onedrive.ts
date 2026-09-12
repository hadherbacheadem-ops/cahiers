// ---------------------------------------------------------------------------
// OneDrive « dossier d'application » (/me/drive/special/approot), reached with
// the user's own Entra app registration through MSAL (scope
// Files.ReadWrite.AppFolder). The folder is private to the app; OneDrive
// gives every item an eTag, sent back as If-Match (412 on mismatch), which
// is all the engine needs.
//
// The token getter and fetch are injected so the provider is testable
// against a fake Graph without MSAL or a network.
// ---------------------------------------------------------------------------

import { SyncAuthError, SyncConflictError, type SyncFileInfo, type SyncProvider, type SyncReadResult } from './provider'

const GRAPH = 'https://graph.microsoft.com/v1.0'
/** Files above this size go through an upload session (simple PUT is capped at 4 MB). */
const SIMPLE_UPLOAD_MAX = 4 * 1024 * 1024
const CHUNK = 5 * 320 * 1024 // multiple of 320 KiB, as Graph requires

export const SYNC_FOLDER = 'sync'

interface DriveItem {
  id: string
  name: string
  eTag?: string
  size?: number
  lastModifiedDateTime?: string
  folder?: unknown
  '@microsoft.graph.downloadUrl'?: string
}

export interface OneDriveOptions {
  getToken: () => Promise<string>
  fetchImpl?: typeof fetch
  /** Subfolder of the app folder (default "sync"). */
  folder?: string
}

async function graphError(res: Response, what: string): Promise<Error> {
  let detail = ''
  try {
    const body = (await res.json()) as { error?: { message?: string; code?: string } }
    detail = body.error?.message ?? body.error?.code ?? ''
  } catch {
    // no JSON body
  }
  const suffix = detail ? ` (${detail})` : ''
  if (res.status === 401 || res.status === 403) return new SyncAuthError(`OneDrive refuse l’accès (HTTP ${res.status}). Vérifie que l’application Entra a l’autorisation déléguée Files.ReadWrite.AppFolder et reconnecte-toi.${suffix}`)
  if (res.status === 429) return new Error(`OneDrive limite les requêtes (HTTP 429), réessai plus tard.${suffix}`)
  return new Error(`OneDrive : ${what} impossible (HTTP ${res.status}).${suffix}`)
}

export class OneDriveAppFolderProvider implements SyncProvider {
  readonly kind = 'onedrive' as const
  private folder: string
  private fetchImpl: typeof fetch
  private getToken: () => Promise<string>
  private folderReady: Promise<void> | null = null
  /** Set once the app folder has been reached (for « Tester la connexion »). */
  approotName: string | null = null

  constructor(opts: OneDriveOptions) {
    this.getToken = opts.getToken
    this.fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init))
    this.folder = opts.folder ?? SYNC_FOLDER
  }

  describe() {
    return `OneDrive › Applications › ${this.approotName ?? 'Cahiers'} › ${this.folder}`
  }

  private async call(path: string, init: RequestInit = {}, what = 'requête'): Promise<Response> {
    const token = await this.getToken()
    const res = await this.fetchImpl(path.startsWith('http') ? path : `${GRAPH}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers as Record<string, string> | undefined) } })
    if (!res.ok) throw await graphError(res, what)
    return res
  }

  private itemPath(name?: string): string {
    return name ? `/me/drive/special/approot:/${encodeURIComponent(this.folder)}/${encodeURIComponent(name)}` : `/me/drive/special/approot:/${encodeURIComponent(this.folder)}`
  }

  /** Reaches the app folder (Graph creates it on first access) and the sync subfolder. */
  async ensureFolder(): Promise<void> {
    if (!this.folderReady) {
      this.folderReady = (async () => {
        const root = (await (await this.call('/me/drive/special/approot?$select=id,name', {}, 'accès au dossier d’application')).json()) as DriveItem
        this.approotName = root.name
        const res = await this.fetchImpl(`${GRAPH}/me/drive/special/approot/children`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${await this.getToken()}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: this.folder, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
        })
        // 409 = already there, which is the normal case after the first sync.
        if (!res.ok && res.status !== 409) throw await graphError(res, 'création du dossier')
      })().catch((e) => {
        this.folderReady = null
        throw e
      })
    }
    return this.folderReady
  }

  async list(): Promise<SyncFileInfo[]> {
    await this.ensureFolder()
    const out: SyncFileInfo[] = []
    let url: string | undefined = `${GRAPH}${this.itemPath()}:/children?$select=name,eTag,size,lastModifiedDateTime,folder&$top=200`
    while (url) {
      const body = (await (await this.call(url, {}, 'liste des fichiers')).json()) as { value?: DriveItem[]; '@odata.nextLink'?: string }
      for (const it of body.value ?? []) if (!it.folder) out.push({ name: it.name, etag: it.eTag ?? '', size: it.size, modifiedAt: it.lastModifiedDateTime ? Date.parse(it.lastModifiedDateTime) : undefined })
      url = body['@odata.nextLink']
    }
    return out
  }

  async read(name: string): Promise<SyncReadResult | null> {
    await this.ensureFolder()
    const token = await this.getToken()
    const meta = await this.fetchImpl(`${GRAPH}${this.itemPath(name)}?$select=eTag,size,content.downloadUrl`, { headers: { Authorization: `Bearer ${token}` } })
    if (meta.status === 404) return null
    if (!meta.ok) throw await graphError(meta, `lecture de ${name}`)
    const item = (await meta.json()) as DriveItem
    // The download URL is pre-authenticated: no Authorization header (Graph would reject it on the CDN).
    const download = item['@microsoft.graph.downloadUrl']
    const content = download ? await this.fetchImpl(download) : await this.call(`${this.itemPath(name)}:/content`, {}, `lecture de ${name}`)
    if (!content.ok) throw await graphError(content, `téléchargement de ${name}`)
    return { text: await content.text(), etag: item.eTag ?? '' }
  }

  async write(name: string, text: string, ifMatch?: string | null): Promise<{ etag: string }> {
    await this.ensureFolder()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (typeof ifMatch === 'string' && ifMatch) headers['If-Match'] = ifMatch
    const conflict = ifMatch === null ? '?@microsoft.graph.conflictBehavior=fail' : ''
    const bytes = new TextEncoder().encode(text)
    const token = await this.getToken()
    let res: Response
    if (bytes.byteLength <= SIMPLE_UPLOAD_MAX) {
      res = await this.fetchImpl(`${GRAPH}${this.itemPath(name)}:/content${conflict}`, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, ...headers }, body: text })
    } else {
      const session = await this.fetchImpl(`${GRAPH}${this.itemPath(name)}:/createUploadSession`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(headers['If-Match'] ? { 'If-Match': headers['If-Match'] } : {}) },
        body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': ifMatch === null ? 'fail' : 'replace' } }),
      })
      if (session.status === 412) throw new SyncConflictError(name)
      if (!session.ok) throw await graphError(session, `envoi de ${name}`)
      const { uploadUrl } = (await session.json()) as { uploadUrl: string }
      res = session
      for (let start = 0; start < bytes.byteLength; start += CHUNK) {
        const end = Math.min(start + CHUNK, bytes.byteLength)
        res = await this.fetchImpl(uploadUrl, { method: 'PUT', headers: { 'Content-Range': `bytes ${start}-${end - 1}/${bytes.byteLength}`, 'Content-Length': String(end - start) }, body: bytes.slice(start, end) })
        if (!res.ok) throw await graphError(res, `envoi de ${name}`)
      }
    }
    if (res.status === 412 || res.status === 409) throw new SyncConflictError(name)
    if (!res.ok) throw await graphError(res, `écriture de ${name}`)
    const item = (await res.json()) as DriveItem
    return { etag: item.eTag ?? '' }
  }

  async delete(name: string): Promise<void> {
    await this.ensureFolder()
    const res = await this.fetchImpl(`${GRAPH}${this.itemPath(name)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${await this.getToken()}` } })
    if (!res.ok && res.status !== 404) throw await graphError(res, `suppression de ${name}`)
  }
}
