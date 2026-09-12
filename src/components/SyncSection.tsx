import { useEffect, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Cloud, FolderSync, RefreshCw, Smartphone } from 'lucide-react'
import type { AccountInfo } from '@azure/msal-browser'
import { db, getSettings } from '../db'
import { getDeviceId, getDeviceName, setDeviceName } from '../lib/sync/device'
import { getSyncConfig, getSyncStatus, resetSyncCursor, setSyncConfig, SYNC_CONFIG_KEY, SYNC_STATUS_KEY, type SyncConfig, type SyncResult } from '../lib/sync/engine'
import { chooseSyncDirectory, fileProviderSupported, forgetSyncDirectory, getSyncDirectory, resumeSyncDirectory, syncDirectoryPermission } from '../lib/sync/fileProvider'
import { makeProvider, syncNow } from '../lib/sync'
import { getActiveAccount, signIn, signOut } from '../lib/graph'
import { Button, Checkbox, Field, Input, Select, cx } from './ui'

function when(ts?: number): string {
  if (!ts) return 'jamais'
  const d = new Date(ts)
  const today = new Date().toDateString() === d.toDateString()
  return today ? `aujourd’hui à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : d.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function summarize(r: SyncResult): string {
  const parts: string[] = []
  if (r.pulled) {
    const added = Object.values(r.pulled.added).reduce((a, b) => a + b, 0)
    const updated = Object.values(r.pulled.updated).reduce((a, b) => a + b, 0)
    const deleted = Object.values(r.pulled.deleted).reduce((a, b) => a + b, 0)
    if (added + updated + deleted) parts.push(`reçu ${added} ajout${added > 1 ? 's' : ''}, ${updated} modification${updated > 1 ? 's' : ''}, ${deleted} suppression${deleted > 1 ? 's' : ''}`)
    if (r.pulled.replayed) parts.push(`${r.pulled.replayed} historique${r.pulled.replayed > 1 ? 's' : ''} rejoué${r.pulled.replayed > 1 ? 's' : ''}`)
  }
  if (r.snapshotWritten) parts.push('instantané complet envoyé')
  else if (r.pushedRows) parts.push(`envoyé ${r.pushedRows} ligne${r.pushedRows > 1 ? 's' : ''}`)
  if (r.attempts > 1) parts.push(`${r.attempts} tentatives`)
  return parts.length ? parts.join(' · ') : 'rien à échanger'
}

/** Réglages → Synchronisation: provider choice, account / folder, manual round, status. */
export function SyncSection({ Section }: { Section: (p: { title: string; description?: string; children: ReactNode }) => ReactNode }) {
  const config = useLiveQuery(async () => {
    await db.kv.get(SYNC_CONFIG_KEY) // subscribes the query to the key
    return getSyncConfig()
  }, [])
  const status = useLiveQuery(async () => {
    await db.kv.get(SYNC_STATUS_KEY)
    return getSyncStatus()
  }, [])
  const [name, setName] = useState(() => getDeviceName())
  const [message, setMessage] = useState<{ tone: 'ok' | 'bad'; text: string }>()
  const [busy, setBusy] = useState(false)

  if (!config || !status) return null

  const choose = async (provider: SyncConfig['provider']) => {
    await setSyncConfig({ provider })
    await resetSyncCursor()
    setMessage(undefined)
  }

  const run = async () => {
    setBusy(true)
    setMessage(undefined)
    try {
      const r = await syncNow()
      const s = await getSyncStatus()
      if (s.lastError) setMessage({ tone: 'bad', text: s.lastError })
      else if (r) setMessage({ tone: 'ok', text: `Synchronisé : ${summarize(r)}.` })
    } finally {
      setBusy(false)
    }
  }

  const test = async () => {
    setBusy(true)
    setMessage(undefined)
    try {
      const p = await makeProvider(config)
      if (!p) return
      const files = await p.list()
      setMessage({ tone: 'ok', text: `Connexion réussie : ${p.describe()}, ${files.length} fichier${files.length > 1 ? 's' : ''} de synchronisation.` })
    } catch (e) {
      setMessage({ tone: 'bad', text: e instanceof Error ? e.message : 'Connexion impossible.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section title="Synchronisation" description="Retrouve tes cahiers et ton historique sur un autre appareil. Les deux côtés se fusionnent : la version la plus récente gagne, les réponses s’additionnent, les suppressions se propagent.">
      <Field label="Où synchroniser" hint="OneDrive : dossier d’application privé, avec ton inscription Microsoft (section OneNote). Dossier local : un dossier de ce PC que Drive, OneDrive ou Dropbox recopie déjà (Chrome / Edge).">
        {(id) => (
          <Select id={id} value={config.provider} onChange={(e) => choose(e.target.value as SyncConfig['provider'])} className="max-w-md">
            <option value="none">Aucune (cet appareil seulement)</option>
            <option value="onedrive">OneDrive — dossier d’application</option>
            <option value="file" disabled={!fileProviderSupported()}>
              Dossier local partagé{fileProviderSupported() ? '' : ' (Chrome / Edge seulement)'}
            </option>
          </Select>
        )}
      </Field>

      {config.provider === 'onedrive' && <OneDriveBlock onMessage={setMessage} />}
      {config.provider === 'file' && <FolderBlock onMessage={setMessage} />}

      {config.provider !== 'none' && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={run} loading={busy || status.running}>
              <RefreshCw size={16} />
              Synchroniser maintenant
            </Button>
            <Button variant="secondary" onClick={test} disabled={busy}>
              Tester la connexion
            </Button>
          </div>
          <Checkbox label="Synchroniser automatiquement" description="Au lancement, 30 s après la dernière modification (donc après chaque session), toutes les 10 minutes quand l’onglet est visible." checked={config.auto} onChange={(e) => setSyncConfig({ auto: e.target.checked })} />
          <div className="rounded-[var(--radius-sm)] border border-line bg-surface-2 px-3 py-2.5 text-sm">
            <p>
              Dernière synchronisation : <span className="font-medium">{when(status.lastSyncAt)}</span>
              {status.lastResult && <span className="text-muted"> · {summarize(status.lastResult)}</span>}
            </p>
            {status.lastError && !message && <p className="mt-1 text-bad">{status.lastError}</p>}
            {status.lastResult?.devices && Object.keys(status.lastResult.devices).length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-2">
                {Object.entries(status.lastResult.devices).map(([id, d]) => (
                  <li key={id} className={cx('flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs', id === getDeviceId() && 'border-accent/60')}>
                    <Smartphone size={12} aria-hidden="true" />
                    {d.name}
                    {id === getDeviceId() && <span className="text-muted">(cet appareil)</span>}
                    <span className="text-muted">· vu {when(d.lastSeen)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      <Field label="Nom de cet appareil" hint="Affiché dans la liste des appareils vus par la synchronisation.">
        {(id) => (
          <Input
            id={id}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              setDeviceName(name)
              setName(getDeviceName())
            }}
            className="max-w-xs"
          />
        )}
      </Field>

      {message && (
        <p className={message.tone === 'ok' ? 'text-sm text-ok' : 'text-sm text-bad'} role="status">
          {message.text}
        </p>
      )}
    </Section>
  )
}

function OneDriveBlock({ onMessage }: { onMessage: (m: { tone: 'ok' | 'bad'; text: string } | undefined) => void }) {
  const [clientId, setClientId] = useState<string>()
  const [account, setAccount] = useState<AccountInfo | null>()

  useEffect(() => {
    getSettings().then((s) => {
      const id = s.graphClientId?.trim() ?? ''
      setClientId(id)
      if (id) getActiveAccount(id).then(setAccount, () => setAccount(null))
      else setAccount(null)
    })
  }, [])

  if (clientId === undefined) return null
  if (!clientId) return <p className="text-sm text-warn">Renseigne d’abord l’ID d’application Microsoft dans la section OneNote ci-dessus (la même inscription sert aux deux ; ajoute-lui l’autorisation Files.ReadWrite.AppFolder).</p>

  async function connect() {
    onMessage(undefined)
    try {
      setAccount(await signIn(clientId!))
    } catch (e) {
      onMessage({ tone: 'bad', text: e instanceof Error ? e.message : 'Connexion Microsoft impossible.' })
    }
  }

  async function disconnect() {
    await signOut(clientId!)
    setAccount(null)
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-sm)] border border-line bg-surface-2 px-3 py-2.5 text-sm">
      <Cloud size={18} className="shrink-0 text-muted" aria-hidden="true" />
      {account === undefined ? (
        <span className="text-muted">Vérification du compte…</span>
      ) : account ? (
        <>
          <span>
            Connecté : <span className="font-medium">{account.username || account.name}</span>
          </span>
          <Button size="sm" variant="ghost" onClick={disconnect}>
            Se déconnecter
          </Button>
        </>
      ) : (
        <>
          <span className="text-muted">Aucun compte Microsoft connecté.</span>
          <Button size="sm" variant="secondary" onClick={connect}>
            Se connecter
          </Button>
        </>
      )}
    </div>
  )
}

function FolderBlock({ onMessage }: { onMessage: (m: { tone: 'ok' | 'bad'; text: string } | undefined) => void }) {
  const [folder, setFolder] = useState<string | null>()
  const [permission, setPermission] = useState<PermissionState | 'none'>('none')

  const refresh = async () => {
    setFolder((await getSyncDirectory())?.name ?? null)
    setPermission(await syncDirectoryPermission())
  }
  useEffect(() => {
    void refresh()
  }, [])

  async function choose() {
    onMessage(undefined)
    try {
      await chooseSyncDirectory()
      await resetSyncCursor()
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) onMessage({ tone: 'bad', text: e instanceof Error ? e.message : 'Impossible de choisir le dossier.' })
    }
    await refresh()
  }

  if (folder === undefined) return null
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-sm)] border border-line bg-surface-2 px-3 py-2.5 text-sm">
      <FolderSync size={18} className="shrink-0 text-muted" aria-hidden="true" />
      {folder ? (
        <>
          <span>
            Dossier : <span className="font-mono text-xs">{folder}</span>
          </span>
          {permission !== 'granted' && (
            <Button size="sm" variant="secondary" onClick={() => resumeSyncDirectory().then(refresh)}>
              Renouveler l’autorisation
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={choose}>
            Changer
          </Button>
          <Button size="sm" variant="ghost" onClick={() => forgetSyncDirectory().then(refresh)}>
            Oublier
          </Button>
        </>
      ) : (
        <>
          <span className="text-muted">Aucun dossier choisi.</span>
          <Button size="sm" variant="secondary" onClick={choose}>
            Choisir le dossier
          </Button>
        </>
      )}
    </div>
  )
}
