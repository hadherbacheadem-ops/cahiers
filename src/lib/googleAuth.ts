// Google sign-in for the Drive app folder, with the user's own OAuth client id
// (Settings.googleClientId), like the Entra registration for OneNote. Google
// Identity Services (token client, popup) on a desktop browser; the OAuth
// redirect flow on phones and installed apps, where popups are unreliable.
// Tokens last an hour and are kept for the session only; nothing is stored.

import { isPhone, isStandalone } from './media'
import { SyncAuthError } from './sync/provider'

export const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata'
export const GOOGLE_REDIRECT_URI = () => `${window.location.origin}${import.meta.env.BASE_URL}`
const STATE = 'cahiers-google'
const KEY = 'cahiers.google.token'
const GIS_SRC = 'https://accounts.google.com/gsi/client'

type Token = { token: string; exp: number }

type TokenClient = { requestAccessToken(o?: { prompt?: string }): void }
type Gis = {
  accounts: {
    oauth2: {
      initTokenClient(c: {
        client_id: string
        scope: string
        callback: (r: { access_token?: string; expires_in?: number; error?: string; error_description?: string }) => void
        error_callback?: (e: { type?: string; message?: string }) => void
      }): TokenClient
      revoke?(token: string, done?: () => void): void
    }
  }
}

let cached: Token | null = read()

function read(): Token | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Token) : null
  } catch {
    return null
  }
}

function save(token: string, expiresIn: number) {
  cached = { token, exp: Date.now() + Math.max(60, expiresIn) * 1000 }
  try {
    sessionStorage.setItem(KEY, JSON.stringify(cached))
  } catch {
    /* private mode: memory only */
  }
}

export function googleSignedIn(): boolean {
  return !!cached && cached.exp > Date.now()
}

export function googleSignOut() {
  const t = cached?.token
  cached = null
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
  const gis = (window as Window & { google?: Gis }).google
  if (t && gis?.accounts?.oauth2?.revoke) gis.accounts.oauth2.revoke(t)
}

/** Popups are blocked or lost on phones and in installed apps: sign in by full-page redirect there. */
export function usesGoogleRedirect(): boolean {
  return isPhone() || isStandalone()
}

export function googleAuthUrl(clientId: string): string {
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  u.searchParams.set('client_id', clientId)
  u.searchParams.set('redirect_uri', GOOGLE_REDIRECT_URI())
  u.searchParams.set('response_type', 'token')
  u.searchParams.set('scope', GOOGLE_SCOPE)
  u.searchParams.set('include_granted_scopes', 'true')
  u.searchParams.set('state', STATE)
  return u.href
}

/** At start-up: back from the redirect flow, the token is in the URL fragment. Returns true when one was taken. */
export function handleGoogleRedirect(): boolean {
  const hash = window.location.hash
  if (!hash.includes('access_token=') || !hash.includes(`state=${STATE}`)) return false
  const p = new URLSearchParams(hash.slice(1))
  const token = p.get('access_token')
  if (!token) return false
  save(token, Number(p.get('expires_in') ?? 3600))
  window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
  return true
}

async function loadGis(): Promise<Gis> {
  const w = window as Window & { google?: Gis }
  if (w.google?.accounts?.oauth2) return w.google
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = GIS_SRC
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new SyncAuthError('Google Identity Services injoignable (hors ligne ?).'))
    document.head.appendChild(s)
  })
  if (!w.google?.accounts?.oauth2) throw new SyncAuthError('Google Identity Services indisponible.')
  return w.google
}

/**
 * A valid access token: the cached one, else a silent request, else (when
 * `interactive`) the consent popup / redirect. Throws SyncAuthError when the
 * user has to act.
 */
export async function requestGoogleToken(clientId: string, { interactive = false }: { interactive?: boolean } = {}): Promise<string> {
  if (!clientId) throw new SyncAuthError('Renseigne d’abord l’ID client Google (Réglages → Synchronisation).')
  if (cached && cached.exp > Date.now() + 60_000) return cached.token
  if (usesGoogleRedirect()) {
    if (!interactive) throw new SyncAuthError('Connecte-toi à Google (bouton « Se connecter » de la section Synchronisation).')
    window.location.assign(googleAuthUrl(clientId))
    return new Promise<string>(() => {})
  }
  const gis = await loadGis()
  return new Promise<string>((resolve, reject) => {
    const client = gis.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_SCOPE,
      callback: (r) => {
        if (r.error || !r.access_token) {
          reject(new SyncAuthError(`Connexion Google refusée${r.error_description ? ` : ${r.error_description}` : r.error ? ` (${r.error})` : ''}.`))
          return
        }
        save(r.access_token, r.expires_in ?? 3600)
        resolve(r.access_token)
      },
      error_callback: (e) => reject(new SyncAuthError(e?.type === 'popup_closed' ? 'Fenêtre Google fermée avant la fin.' : `Connexion Google impossible${e?.message ? ` : ${e.message}` : ''}.`)),
    })
    client.requestAccessToken({ prompt: interactive ? 'consent' : '' })
  })
}

export function signInGoogle(clientId: string): Promise<string> {
  return requestGoogleToken(clientId, { interactive: true })
}
