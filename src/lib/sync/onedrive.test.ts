import { describe, expect, it } from 'vitest'
import { OneDriveAppFolderProvider } from './onedrive'
import { SyncAuthError, SyncConflictError } from './provider'

const GRAPH = 'https://graph.microsoft.com/v1.0'

/** A tiny in-memory Graph: app folder, one subfolder, files with eTags. */
function fakeGraph(opts: { token?: string; folderExists?: boolean } = {}) {
  const token = opts.token ?? 'tok'
  const files = new Map<string, { text: string; eTag: string }>()
  let etagCounter = 0
  let folderExists = opts.folderExists ?? false
  const calls: { method: string; url: string; headers: Record<string, string> }[] = []
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

  const fetchImpl: typeof fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const method = (init.method ?? 'GET').toUpperCase()
    const headers = Object.fromEntries(Object.entries((init.headers as Record<string, string>) ?? {}).map(([k, v]) => [k.toLowerCase(), v]))
    calls.push({ method, url, headers })
    if (url.startsWith('https://download.example/')) {
      const name = decodeURIComponent(url.split('/').pop()!)
      const f = files.get(name)
      return f ? new Response(f.text, { status: 200 }) : new Response('', { status: 404 })
    }
    if (headers.authorization !== `Bearer ${token}`) return json(401, { error: { code: 'InvalidAuthenticationToken', message: 'Access token is empty.' } })
    if (url === `${GRAPH}/me/drive/special/approot?$select=id,name`) return json(200, { id: 'root', name: 'Cahiers' })
    if (url === `${GRAPH}/me/drive/special/approot/children` && method === 'POST') {
      if (folderExists) return json(409, { error: { code: 'nameAlreadyExists' } })
      folderExists = true
      return json(201, { id: 'sync', name: 'sync', folder: {} })
    }
    const prefix = `${GRAPH}/me/drive/special/approot:/sync`
    if (!url.startsWith(prefix)) return json(404, { error: { code: 'itemNotFound' } })
    const rest = url.slice(prefix.length)
    if (rest.startsWith(':/children')) {
      return json(200, { value: [...files.entries()].map(([name, f]) => ({ name, eTag: f.eTag, size: f.text.length, lastModifiedDateTime: '2026-09-13T00:00:00Z' })) })
    }
    const m = rest.match(/^\/([^:?]+)(?::\/(content|createUploadSession))?(\?.*)?$/)
    if (!m) return json(400, { error: { code: 'invalidRequest' } })
    const name = decodeURIComponent(m[1])
    const action = m[2]
    const query = m[3] ?? ''
    const current = files.get(name)
    if (method === 'GET' && !action) {
      if (!current) return json(404, { error: { code: 'itemNotFound' } })
      return json(200, { name, eTag: current.eTag, size: current.text.length, '@microsoft.graph.downloadUrl': `https://download.example/${encodeURIComponent(name)}` })
    }
    if (method === 'PUT' && action === 'content') {
      if (query.includes('conflictBehavior=fail') && current) return json(409, { error: { code: 'nameAlreadyExists' } })
      if (headers['if-match'] && (!current || current.eTag !== headers['if-match'])) return json(412, { error: { code: 'resourceModified', message: 'ETag does not match current item value.' } })
      const eTag = `"e${++etagCounter}"`
      files.set(name, { text: String(init.body), eTag })
      return json(current ? 200 : 201, { name, eTag })
    }
    if (method === 'DELETE' && !action) {
      if (!current) return json(404, { error: { code: 'itemNotFound' } })
      files.delete(name)
      return new Response(null, { status: 204 })
    }
    return json(400, { error: { code: 'unsupported' } })
  }
  return { fetchImpl, files, calls, getToken: async () => token }
}

describe('OneDriveAppFolderProvider against a fake Graph', () => {
  it('reaches the app folder, creates the sync subfolder once, then lists, writes, reads and deletes', async () => {
    const g = fakeGraph()
    const p = new OneDriveAppFolderProvider({ getToken: g.getToken, fetchImpl: g.fetchImpl })
    expect(await p.list()).toEqual([])
    expect(g.calls.map((c) => `${c.method} ${c.url}`).slice(0, 2)).toEqual([`GET ${GRAPH}/me/drive/special/approot?$select=id,name`, `POST ${GRAPH}/me/drive/special/approot/children`])
    expect(p.approotName).toBe('Cahiers')
    expect(p.describe()).toContain('Cahiers')

    const w = await p.write('manifest.json', '{"a":1}', null)
    expect(w.etag).toBe('"e1"')
    const put = g.calls.find((c) => c.method === 'PUT')!
    expect(put.url).toContain('@microsoft.graph.conflictBehavior=fail')
    expect(put.headers['if-match']).toBeUndefined()

    expect(await p.read('manifest.json')).toEqual({ text: '{"a":1}', etag: '"e1"' })
    // The pre-authenticated download URL is fetched without the bearer token.
    const dl = g.calls.find((c) => c.url.startsWith('https://download.example/'))!
    expect(dl.headers.authorization).toBeUndefined()
    expect(await p.read('missing.json')).toBeNull()
    expect((await p.list()).map((f) => f.name)).toEqual(['manifest.json'])

    await p.delete('manifest.json')
    await p.delete('manifest.json') // missing: not an error
    expect(g.files.size).toBe(0)
    // The folder was created exactly once for the provider's lifetime.
    expect(g.calls.filter((c) => c.method === 'POST').length).toBe(1)
  })

  it('an existing subfolder (409) is fine', async () => {
    const g = fakeGraph({ folderExists: true })
    const p = new OneDriveAppFolderProvider({ getToken: g.getToken, fetchImpl: g.fetchImpl })
    await p.write('a.json', '1')
    expect(g.files.has('a.json')).toBe(true)
  })

  it('sends If-Match and turns a 412 into SyncConflictError; create-only on an existing file conflicts too', async () => {
    const g = fakeGraph()
    const p = new OneDriveAppFolderProvider({ getToken: g.getToken, fetchImpl: g.fetchImpl })
    const { etag } = await p.write('manifest.json', 'v1', null)
    await expect(p.write('manifest.json', 'v2', null)).rejects.toBeInstanceOf(SyncConflictError)
    const ok = await p.write('manifest.json', 'v2', etag)
    expect(g.calls.filter((c) => c.method === 'PUT').at(-1)!.headers['if-match']).toBe(etag)
    await expect(p.write('manifest.json', 'v3', etag)).rejects.toBeInstanceOf(SyncConflictError)
    expect((await p.read('manifest.json'))?.etag).toBe(ok.etag)
    expect(g.files.get('manifest.json')?.text).toBe('v2')
  })

  it('reports an auth problem as SyncAuthError', async () => {
    const g = fakeGraph({ token: 'good' })
    const p = new OneDriveAppFolderProvider({ getToken: async () => 'bad', fetchImpl: g.fetchImpl })
    await expect(p.list()).rejects.toBeInstanceOf(SyncAuthError)
    await expect(p.list()).rejects.toThrow(/Files.ReadWrite.AppFolder/)
  })
})
