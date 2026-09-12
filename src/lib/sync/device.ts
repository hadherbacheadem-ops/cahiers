// ---------------------------------------------------------------------------
// Identity of this browser profile for the sync. Stored in localStorage so the
// Dexie middleware can stamp rows synchronously; generated on first use.
// ---------------------------------------------------------------------------

import { uid } from '../ids'

const ID_KEY = 'cahiers.deviceId'
const NAME_KEY = 'cahiers.deviceName'

let memoryId: string | null = null

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

export function getDeviceId(): string {
  if (memoryId) return memoryId
  const s = storage()
  let id = s?.getItem(ID_KEY) ?? null
  if (!id) {
    id = uid()
    s?.setItem(ID_KEY, id)
  }
  memoryId = id
  return id
}

/** Tests: use a given id for the rows written from now on. */
export function setDeviceId(id: string) {
  memoryId = id
  storage()?.setItem(ID_KEY, id)
}

export function defaultDeviceName(): string {
  if (typeof navigator === 'undefined') return 'Appareil'
  const ua = navigator.userAgent
  const os = /iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Appareil'
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox/.test(ua) ? 'Firefox' : /Chrome/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : ''
  return browser ? `${os} · ${browser}` : os
}

export function getDeviceName(): string {
  return storage()?.getItem(NAME_KEY) || defaultDeviceName()
}

export function setDeviceName(name: string) {
  const s = storage()
  if (!s) return
  if (name.trim()) s.setItem(NAME_KEY, name.trim())
  else s.removeItem(NAME_KEY)
}
