import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { createDb, type CahiersDb } from '../../db'
import { newCard } from '../fsrs'
import type { Exercise } from '../../types'
import { setDeviceId } from './device'
import { syncOnce } from './engine'
import { MANIFEST_NAME, parseManifest } from './format'
import { GoogleDriveAppDataProvider } from './googleDrive'
import { SyncAuthError, SyncConflictError } from './provider'

const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'

type Row = { id: string; name: string; text: string; version: number; createdTime: string; revision?: number; props?: Record<string, string> }

/**
 * A tiny in-memory Drive: files in appDataFolder with a `version` counter,
 * search by name, media download, multipart create, media update, delete.
 * No If-Match, like the real one. `beforeUpload` simulates a concurrent
 * writer between the provider's version check and its upload.
 */
function fakeDrive(opts: { token?: string } = {}) {
  const token = opts.token ?? 'tok'
  const rows = new Map<string, Row>()
  let seq = 0
  let clock = 0
  const calls: { method: string; url: string }[] = []
  const hooks: { beforeUpload?: (name: string) => void | Promise<void>; afterUpload?: (name: string) => void | Promise<void> } = {}
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  const meta = (r: Row) => ({ id: r.id, name: r.name, version: String(r.version), size: String(r.text.length), modifiedTime: '2026-09-15T00:00:00Z', createdTime: r.createdTime, headRevisionId: `rev${r.revision ?? r.version}`, appProperties: r.props ?? {} })
  const create = (name: string, text: string): Row => {
    const r: Row = { id: `f${++seq}`, name, text, version: 1, createdTime: new Date(1_700_000_000_000 + clock++).toISOString() }
    rows.set(r.id, r)
    return r
  }

  const fetchImpl: typeof fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const method = (init.method ?? 'GET').toUpperCase()
    const headers = Object.fromEntries(Object.entries((init.headers as Record<string, string>) ?? {}).map(([k, v]) => [k.toLowerCase(), v]))
    calls.push({ method, url })
    if (headers.authorization !== `Bearer ${token}`) return json(401, { error: { code: 401, message: 'Invalid Credentials' } })
    const u = new URL(url)
    if (url.startsWith(`${API}/files?`)) {
      let list = [...rows.values()]
      const q = u.searchParams.get('q')
      if (q) {
        const m = q.match(/^name = '(.*)'$/)
        const name = m ? m[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\') : ''
        list = list.filter((r) => r.name === name)
      }
      return json(200, { files: list.map(meta) })
    }
    if (url.startsWith(`${UPLOAD}/files?`) && method === 'POST') {
      const body = String(init.body)
      const boundary = (headers['content-type'] ?? '').split('boundary=')[1]
      const parts = body.split(`--${boundary}`).filter((p) => p.trim() && p.trim() !== '--')
      const metaPart = JSON.parse(parts[0].split('\r\n\r\n')[1].trim()) as { name: string }
      const text = parts[1].split('\r\n\r\n')[1].replace(/\r\n$/, '')
      await hooks.beforeUpload?.(metaPart.name)
      const r = create(metaPart.name, text)
      return json(200, meta(r))
    }
    const up = url.match(new RegExp(`^${UPLOAD.replace(/[.]/g, '\\.')}/files/([^?]+)\\?`))
    if (up && method === 'PATCH') {
      const r = rows.get(decodeURIComponent(up[1]))
      if (!r) return json(404, { error: { code: 404 } })
      await hooks.beforeUpload?.(r.name)
      const ct = headers['content-type'] ?? ''
      if (ct.startsWith('multipart/related')) {
        const boundary = ct.split('boundary=')[1]
        const parts = String(init.body).split(`--${boundary}`).filter((p) => p.trim() && p.trim() !== '--')
        const metaPart = JSON.parse(parts[0].split('\r\n\r\n')[1].trim()) as { appProperties?: Record<string, string> }
        r.text = parts[1].split('\r\n\r\n')[1].replace(/\r\n$/, '')
        if (metaPart.appProperties) r.props = { ...(r.props ?? {}), ...metaPart.appProperties }
      } else r.text = String(init.body)
      r.version++
      r.revision = (r.revision ?? 1) + 1
      await hooks.afterUpload?.(r.name)
      return json(200, meta(r))
    }
    const one = url.match(new RegExp(`^${API.replace(/[.]/g, '\\.')}/files/([^?]+)(\\?.*)?$`))
    if (one) {
      const r = rows.get(decodeURIComponent(one[1]))
      if (method === 'DELETE') {
        if (!r) return json(404, { error: { code: 404 } })
        rows.delete(r.id)
        return new Response(null, { status: 204 })
      }
      if (!r) return json(404, { error: { code: 404 } })
      if ((one[2] ?? '').includes('alt=media')) return new Response(r.text, { status: 200 })
      return json(200, meta(r))
    }
    return json(400, { error: { code: 400, message: `unsupported ${method} ${url}` } })
  }
  return { fetchImpl, rows, calls, hooks, getToken: async () => token, byName: (name: string) => [...rows.values()].filter((r) => r.name === name) }
}

describe('GoogleDriveAppDataProvider against a fake Drive', () => {
  it('lists, creates, reads, updates and deletes, with the version as ETag', async () => {
    const d = fakeDrive()
    const p = new GoogleDriveAppDataProvider({ getToken: d.getToken, fetchImpl: d.fetchImpl })
    expect(await p.list()).toEqual([])
    const w1 = await p.write('manifest.json', '{"a":1}', null)
    expect(w1.etag).toBe('1')
    expect((await p.list()).map((f) => f.name)).toEqual(['manifest.json'])
    expect(await p.read('manifest.json')).toEqual({ text: '{"a":1}', etag: '1' })
    const w2 = await p.write('manifest.json', '{"a":2}', '1')
    expect(w2.etag).toBe('2')
    expect((await p.read('manifest.json'))?.text).toBe('{"a":2}')
    expect(await p.read('absent.json')).toBeNull()
    await p.delete('manifest.json')
    await p.delete('manifest.json')
    expect(await p.list()).toEqual([])
    expect(d.calls.every((c) => c.url.includes('appDataFolder') || !c.url.startsWith(`${API}/files?`))).toBe(true)
  })

  it('refuses to create over an existing file and to update a moved one', async () => {
    const d = fakeDrive()
    const p = new GoogleDriveAppDataProvider({ getToken: d.getToken, fetchImpl: d.fetchImpl })
    await p.write('m.json', 'v1', null)
    await expect(p.write('m.json', 'v1bis', null)).rejects.toBeInstanceOf(SyncConflictError)
    await expect(p.write('m.json', 'v2', '"stale"')).rejects.toBeInstanceOf(SyncConflictError)
    await expect(p.write('absent.json', 'x', '1')).rejects.toBeInstanceOf(SyncConflictError)
    expect(d.byName('m.json')[0].text).toBe('v1')
  })

  it('detects a writer that slipped in between the version check and the upload (no If-Match on Drive)', async () => {
    const d = fakeDrive()
    const p = new GoogleDriveAppDataProvider({ getToken: d.getToken, fetchImpl: d.fetchImpl })
    await p.write('m.json', 'v1', null)
    let once = true
    d.hooks.beforeUpload = (name) => {
      if (once && name === 'm.json') {
        once = false
        const r = d.byName('m.json')[0]
        r.text = 'someone else'
        r.version++
      }
    }
    await expect(p.write('m.json', 'mine', '1')).rejects.toBeInstanceOf(SyncConflictError)
    // The engine then re-reads and retries with the fresh version.
    const fresh = await p.read('m.json')
    expect(fresh?.etag).toBe('3')
    expect((await p.write('m.json', 'merged', fresh!.etag)).etag).toBe('4')
  })

  it('keeps the oldest of two files created at once under the same name and reports the conflict to the loser', async () => {
    const d = fakeDrive()
    const p = new GoogleDriveAppDataProvider({ getToken: d.getToken, fetchImpl: d.fetchImpl })
    d.hooks.beforeUpload = (name) => {
      // Another device created the same file a moment earlier.
      if (name === 'm.json' && d.byName('m.json').length === 0) {
        const other = { id: 'other', name: 'm.json', text: 'theirs', version: 1, createdTime: '2020-01-01T00:00:00Z' }
        d.rows.set(other.id, other)
      }
    }
    await expect(p.write('m.json', 'mine', null)).rejects.toBeInstanceOf(SyncConflictError)
    expect(d.byName('m.json').map((r) => r.text)).toEqual(['theirs'])
  })

  it('turns 401 into a sign-in error', async () => {
    const d = fakeDrive({ token: 'good' })
    const p = new GoogleDriveAppDataProvider({ getToken: async () => 'bad', fetchImpl: d.fetchImpl })
    await expect(p.list()).rejects.toBeInstanceOf(SyncAuthError)
  })
})

// ---- Two devices through the fake Drive, with the real engine ------------------

let opened: Dexie[] = []
let n = 0
const T0 = 1_700_000_000_000

afterEach(async () => {
  for (const db of opened) {
    db.close()
    await Dexie.delete(db.name)
  }
  opened = []
})

function open(): CahiersDb {
  const db = createDb(`cahiers-gdrive-${Date.now()}-${n++}`)
  opened.push(db)
  return db
}

function exercise(id: string, updatedAt: number): Exercise {
  return { id, chapitreId: 'ch1', cahierId: 'c1', pointId: null, type: 'flashcard', data: { type: 'flashcard', question: 'Q', answer: 'A' }, difficulty: 1, tags: [], status: 'active', fsrs: newCard(T0), createdAt: updatedAt, updatedAt } as unknown as Exercise
}

describe('two devices through Google Drive', () => {
  it('a snapshot written by the PC reaches the phone, and a phone change reaches the PC', async () => {
    const drive = fakeDrive()
    const pcDrive = new GoogleDriveAppDataProvider({ getToken: drive.getToken, fetchImpl: drive.fetchImpl })
    const phoneDrive = new GoogleDriveAppDataProvider({ getToken: drive.getToken, fetchImpl: drive.fetchImpl })
    const pc = open()
    const phone = open()
    setDeviceId('pc')
    await pc.cahiers.add({ id: 'c1', name: 'Physique', color: '#000', createdAt: T0, updatedAt: T0 } as never)
    await pc.exercises.add(exercise('e1', T0))
    const r1 = await syncOnce(pcDrive, { database: pc, deviceId: 'pc', deviceName: 'PC', now: T0 + 1 })
    expect(r1.snapshotWritten).toBe(true)
    setDeviceId('phone')
    const r2 = await syncOnce(phoneDrive, { database: phone, deviceId: 'phone', deviceName: 'Tél', now: T0 + 2 })
    expect(r2.pulled?.added.exercises).toBe(1)
    expect(await phone.exercises.count()).toBe(1)
    await phone.exercises.add(exercise('e2', T0 + 3))
    await syncOnce(phoneDrive, { database: phone, deviceId: 'phone', deviceName: 'Tél', now: T0 + 4 })
    setDeviceId('pc')
    const r4 = await syncOnce(pcDrive, { database: pc, deviceId: 'pc', deviceName: 'PC', now: T0 + 5 })
    expect(r4.pulled?.added.exercises).toBe(1)
    expect(await pc.exercises.count()).toBe(2)
  })
})

describe('manifest writes are guarded (no If-Match on Drive)', () => {
  it('a write that lands right after ours is detected by the writeToken and reported as a conflict', async () => {
    const d = fakeDrive()
    const p = new GoogleDriveAppDataProvider({ getToken: d.getToken, fetchImpl: d.fetchImpl })
    await p.write(MANIFEST_NAME, '{"v":1}', null)
    const read = await p.read(MANIFEST_NAME)
    let once = true
    d.hooks.afterUpload = (name) => {
      if (once && name === MANIFEST_NAME) {
        once = false
        const r = d.byName(MANIFEST_NAME)[0]
        r.text = '{"v":"theirs"}'
        r.version++
        r.revision = (r.revision ?? 1) + 1
        r.props = { writeToken: 'theirs' }
      }
    }
    await expect(p.write(MANIFEST_NAME, '{"v":"mine"}', read!.etag)).rejects.toBeInstanceOf(SyncConflictError)
    expect(d.byName(MANIFEST_NAME)[0].text).toBe('{"v":"theirs"}')
  })

  it('a manifest that moved since the round started is not overwritten (headRevisionId)', async () => {
    const d = fakeDrive()
    const p = new GoogleDriveAppDataProvider({ getToken: d.getToken, fetchImpl: d.fetchImpl })
    await p.write(MANIFEST_NAME, '{"v":1}', null)
    const read = await p.read(MANIFEST_NAME)
    // Another device wrote (version and revision moved) but the caller still holds the old ETag.
    const r = d.byName(MANIFEST_NAME)[0]
    r.text = '{"v":"theirs"}'
    r.version++
    r.revision = (r.revision ?? 1) + 1
    await expect(p.write(MANIFEST_NAME, '{"v":"mine"}', read!.etag)).rejects.toBeInstanceOf(SyncConflictError)
    expect(r.text).toBe('{"v":"theirs"}')
    expect(d.calls.filter((c) => c.method === 'PATCH').length).toBe(0)
  })

  it('two devices syncing at the same moment: one restarts its round, no lot is lost', async () => {
    const drive = fakeDrive()
    const pcDrive = new GoogleDriveAppDataProvider({ getToken: drive.getToken, fetchImpl: drive.fetchImpl })
    const phoneDrive = new GoogleDriveAppDataProvider({ getToken: drive.getToken, fetchImpl: drive.fetchImpl })
    const pc = open()
    const phone = open()
    setDeviceId('pc')
    await pc.cahiers.add({ id: 'c1', name: 'Physique', color: '#000', createdAt: T0, updatedAt: T0 } as never)
    await pc.exercises.add(exercise('e1', T0))
    await syncOnce(pcDrive, { database: pc, deviceId: 'pc', deviceName: 'PC', now: T0 + 1 })
    setDeviceId('phone')
    await syncOnce(phoneDrive, { database: phone, deviceId: 'phone', deviceName: 'Tél', now: T0 + 2 })
    // Both devices change something offline.
    setDeviceId('pc')
    await pc.exercises.add(exercise('e-pc', T0 + 3))
    setDeviceId('phone')
    await phone.exercises.add(exercise('e-phone', T0 + 3))
    // The phone's whole round runs while the PC is between its manifest upload and its re-read.
    let interleaved = false
    drive.hooks.afterUpload = async (name) => {
      if (name !== MANIFEST_NAME || interleaved) return
      interleaved = true
      setDeviceId('phone')
      await syncOnce(phoneDrive, { database: phone, deviceId: 'phone', deviceName: 'Tél', now: T0 + 4 })
      setDeviceId('pc')
    }
    setDeviceId('pc')
    const r = await syncOnce(pcDrive, { database: pc, deviceId: 'pc', deviceName: 'PC', now: T0 + 5 })
    expect(interleaved).toBe(true)
    expect(r.attempts).toBeGreaterThan(1)
    const manifest = parseManifest(JSON.parse((await pcDrive.read(MANIFEST_NAME))!.text))
    const devices = new Set(manifest.changes.map((c) => c.deviceId))
    expect(devices.has('pc')).toBe(true)
    expect(devices.has('phone')).toBe(true)
    // After one more round on each side, both databases hold both exercises.
    setDeviceId('phone')
    await syncOnce(phoneDrive, { database: phone, deviceId: 'phone', deviceName: 'Tél', now: T0 + 6 })
    setDeviceId('pc')
    await syncOnce(pcDrive, { database: pc, deviceId: 'pc', deviceName: 'PC', now: T0 + 7 })
    expect((await pc.exercises.toArray()).map((e) => e.id).sort()).toEqual(['e-pc', 'e-phone', 'e1'])
    expect((await phone.exercises.toArray()).map((e) => e.id).sort()).toEqual(['e-pc', 'e-phone', 'e1'])
  })
})
