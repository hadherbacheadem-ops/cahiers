// App wiring of the sync: which provider the settings point to, and the
// automatic rounds. Pure pieces (merge, format, engine, providers) stay
// importable without this file.

import Dexie from 'dexie'
import { getSettings } from '../../db'
import { acquireToken, getActiveAccount } from '../graph'
import { getSyncStatus, runSync, setOnRoundEnd, startAutoSync, type SyncConfig, type SyncResult } from './engine'
import { FileProvider } from './fileProvider'
import { OneDriveAppFolderProvider } from './onedrive'
import { SyncAuthError, type SyncProvider } from './provider'
import { googleSignedIn, requestGoogleToken } from '../googleAuth'

export async function makeProvider(config: SyncConfig): Promise<SyncProvider | null> {
  if (config.provider === 'onedrive') {
    const clientId = (await getSettings()).graphClientId?.trim()
    if (!clientId) throw new SyncAuthError('Renseigne d’abord l’ID d’application Microsoft (section OneNote).')
    const account = await getActiveAccount(clientId)
    if (!account) throw new SyncAuthError('Connecte-toi à Microsoft (bouton « Se connecter » de la section Synchronisation).')
    return new OneDriveAppFolderProvider({ getToken: () => acquireToken(clientId) })
  }
  if (config.provider === 'gdrive') {
    const clientId = (await getSettings()).googleClientId?.trim()
    if (!clientId) throw new SyncAuthError('Renseigne d’abord l’ID client Google (section Synchronisation).')
    if (!googleSignedIn()) throw new SyncAuthError('Connecte-toi à Google (bouton « Se connecter à Google » de la section Synchronisation).')
    const { GoogleDriveAppDataProvider } = await import('./googleDrive')
    return new GoogleDriveAppDataProvider({ getToken: () => requestGoogleToken(clientId) })
  }
  if (config.provider === 'file') return FileProvider.fromStored()
  return null
}

export function syncNow(): Promise<SyncResult | null> {
  return runSync(makeProvider)
}

let quietUntil = 0

/** Starts the automatic rounds (call once at start-up). */
export function startAppSync(): () => void {
  setOnRoundEnd(() => markSyncQuiet())
  return startAutoSync(makeProvider, (cb) => {
    Dexie.on('storagemutated', (parts) => {
      // Writes to kv (status, cursor) and the rows a round itself just merged must not schedule another round.
      if (Date.now() < quietUntil) return
      if (!Object.keys(parts).some((p) => /idb:\/\/cahiers\//.test(p) && !/\/kv\b/.test(p))) return
      void getSyncStatus().then((s) => {
        if (!s.running) cb()
      })
    })
  })
}

/** Called by the engine runner around a round: mutations during it and shortly after are its own. */
export function markSyncQuiet(ms = 2000) {
  quietUntil = Date.now() + ms
}
