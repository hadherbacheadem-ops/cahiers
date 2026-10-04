// Administrator access: a hidden lock in Réglages that, once the code is entered, shows the buttons to load a
// backup (restore / merge). The code is never in the source: only a salted PBKDF2 hash of it.
//
// This is a courtesy lock for the people the app is shared with, not security: the check runs in the browser,
// so anyone with the developer tools can switch it on. What it protects is a friend overwriting their own data
// by loading a backup by mistake. Nothing sensitive sits behind it (the data is local to each device).

import { useSyncExternalStore } from 'react'

export interface CodeCheck {
  saltHex: string
  hashHex: string
  iterations: number
}

/** Hash of the administrator code (PBKDF2-SHA256, see `deriveCode`). */
export const ADMIN_CHECK: CodeCheck = {
  saltHex: 'd62bdd7291a7d822203135514dbe6c74',
  hashHex: '725f65dcdd79bb24ae54d4a846b09768df4a768ce1cf78c67b810a4829df02ab',
  iterations: 210_000,
}

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
const fromHex = (s: string) => Uint8Array.from(s.match(/.{2}/g) ?? [], (b) => parseInt(b, 16))

/** PBKDF2-SHA256 of the code, as hex. */
export async function deriveCode(code: string, saltHex: string, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(code.trim()), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(saltHex), iterations }, key, 256)
  return hex(new Uint8Array(bits))
}

/** Whether `code` is the right one, compared without stopping at the first differing character. */
export async function checkCode(code: string, check: CodeCheck = ADMIN_CHECK): Promise<boolean> {
  if (!code.trim()) return false
  const got = await deriveCode(code, check.saltHex, check.iterations)
  let diff = got.length ^ check.hashHex.length
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ (check.hashHex.charCodeAt(i) || 0)
  return diff === 0
}

// ---- State on this device ----------------------------------------------------

const KEY = 'cahiers.admin'
const EVENT = 'cahiers:admin'
/** Fallback when storage is refused (private mode): the state lives for this visit only. */
let memory = false

export function isAdmin(): boolean {
  try {
    return localStorage.getItem(KEY) === '1' || memory
  } catch {
    return memory
  }
}

export function setAdmin(on: boolean) {
  memory = on
  try {
    if (on) localStorage.setItem(KEY, '1')
    else localStorage.removeItem(KEY)
  } catch {
    /* kept in memory */
  }
  window.dispatchEvent(new Event(EVENT))
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb)
  window.addEventListener('storage', cb)
  return () => {
    window.removeEventListener(EVENT, cb)
    window.removeEventListener('storage', cb)
  }
}

export function useIsAdmin(): boolean {
  return useSyncExternalStore(subscribe, isAdmin, () => false)
}
