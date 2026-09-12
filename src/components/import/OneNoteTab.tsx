import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ChevronRight, KeyRound, Notebook } from 'lucide-react'
import type { AccountInfo } from '@azure/msal-browser'
import { createChapitre, db, getSettings, updateChapitre } from '../../db'
import { getActiveAccount, getPageText, listNotebooks, listPages, listSections, signIn, signOut, type GraphNotebook, type GraphPage, type GraphSection } from '../../lib/graph'
import { Button, EmptyState, Skeleton, cx, plural } from '../ui'
import type { TabView } from './PasteTab'

type Loaded<T> = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; items: T[] }

type Level = { kind: 'notebooks' } | { kind: 'sections'; notebook: GraphNotebook } | { kind: 'pages'; notebook: GraphNotebook; section: GraphSection }

function message(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback
}

export function useOneNoteTab({ cahierId, active, onDone }: { cahierId: string; active: boolean; onDone: (ids: string[]) => void }): TabView {
  // undefined = settings not read yet, '' = no client id configured
  const [clientId, setClientId] = useState<string>()
  const [account, setAccount] = useState<AccountInfo | null>()
  const [authError, setAuthError] = useState<string>()
  const [level, setLevel] = useState<Level>({ kind: 'notebooks' })
  // The fetched list is tagged with the level it belongs to; any other level reads as loading.
  const levelKey = level.kind === 'notebooks' ? 'notebooks' : level.kind === 'sections' ? `sections:${level.notebook.id}` : `pages:${level.section.id}`
  const [fetched, setFetched] = useState<{ key: string } & Loaded<GraphNotebook | GraphSection | GraphPage>>({ key: '', status: 'loading' })
  const list: Loaded<GraphNotebook | GraphSection | GraphPage> = fetched.key === levelKey ? fetched : { status: 'loading' }
  const latestKey = useRef('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [progress, setProgress] = useState<{ done: number; total: number }>()
  const [importError, setImportError] = useState<string>()

  useEffect(() => {
    getSettings().then((s) => setClientId(s.graphClientId?.trim() ?? ''))
  }, [])

  useEffect(() => {
    if (!active || !clientId || account !== undefined) return
    getActiveAccount(clientId)
      .then(setAccount)
      .catch((err) => {
        setAccount(null)
        setAuthError(message(err, 'Initialisation Microsoft impossible.'))
      })
  }, [active, clientId, account])

  const load = useCallback(async () => {
    if (!clientId) return
    const key = levelKey
    latestKey.current = key
    let result: { key: string } & Loaded<GraphNotebook | GraphSection | GraphPage>
    try {
      const items =
        level.kind === 'notebooks'
          ? await listNotebooks(clientId)
          : level.kind === 'sections'
            ? await listSections(clientId, level.notebook.id)
            : await listPages(clientId, level.section.id)
      result = { key, status: 'ready', items }
    } catch (err) {
      result = { key, status: 'error', message: message(err, 'Chargement impossible.') }
    }
    // Ignore responses from a level the user has already left.
    if (latestKey.current === key) setFetched(result)
  }, [clientId, level, levelKey])

  useEffect(() => {
    if (account) load()
  }, [account, load])

  function retry() {
    setFetched({ key: levelKey, status: 'loading' })
    load()
  }

  async function connect() {
    if (!clientId) return
    setAuthError(undefined)
    try {
      setAccount(await signIn(clientId))
    } catch (err) {
      setAuthError(message(err, 'Connexion Microsoft annulée ou impossible.'))
    }
  }

  async function disconnect() {
    if (!clientId) return
    await signOut(clientId)
    setAccount(null)
    setLevel({ kind: 'notebooks' })
    setSelected(new Set())
  }

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function importPages() {
    if (!clientId || level.kind !== 'pages' || list.status !== 'ready') return
    const pages = (list.items as GraphPage[]).filter((p) => selected.has(p.id))
    setImportError(undefined)
    setProgress({ done: 0, total: pages.length })
    try {
      const ids: string[] = []
      for (const page of pages) {
        const content = await getPageText(clientId, page.id, page.title)
        const existing = await db.chapitres.where('onenotePageId').equals(page.id).and((c) => c.cahierId === cahierId).first()
        if (existing) {
          await updateChapitre(existing.id, { title: page.title, content })
          ids.push(existing.id)
        } else {
          const created = await createChapitre({ cahierId, title: page.title, content, source: 'onenote', onenotePageId: page.id })
          ids.push(created.id)
        }
        setProgress({ done: ids.length, total: pages.length })
      }
      onDone(ids)
    } catch (err) {
      setImportError(message(err, 'Import interrompu.'))
    } finally {
      setProgress(undefined)
    }
  }

  // ---- Rendering -----------------------------------------------------------

  let body: ReactNode
  if (clientId === undefined) {
    body = <Skeleton className="h-40" />
  } else if (!clientId) {
    body = (
      <EmptyState
        icon={<Notebook size={24} />}
        title="Connexion à OneNote non configurée"
        description="L’import OneNote passe par Microsoft Graph et demande une inscription d’application Microsoft, gratuite et faite en quelques minutes."
        action={
          <Link to="/settings" className="inline-flex h-10 items-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg hover:bg-accent-hover press ring-focus">
            Configurer dans les réglages
          </Link>
        }
      />
    )
  } else if (!account) {
    body = (
      <div className="flex flex-col items-center gap-4 rounded-[var(--radius-md)] border border-line bg-surface p-8 text-center">
        <span className="flex size-12 items-center justify-center rounded-xl bg-surface-2 text-muted">
          <KeyRound size={24} />
        </span>
        <div>
          <h3 className="text-base font-semibold">Connecte ton compte Microsoft</h3>
          <p className="mt-1 max-w-[40ch] text-sm text-muted">Une fenêtre Microsoft va s’ouvrir. L’app ne demande qu’un accès en lecture à tes bloc-notes.</p>
        </div>
        <Button onClick={connect} disabled={account === undefined}>
          Se connecter à Microsoft
        </Button>
        {authError && <p className="text-sm text-bad">{authError}</p>}
      </div>
    )
  } else {
    const pageItems = level.kind === 'pages' && list.status === 'ready' ? (list.items as GraphPage[]) : []
    const allSelected = pageItems.length > 0 && pageItems.every((p) => selected.has(p.id))
    body = (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="truncate text-muted">
            Connecté : <span className="text-ink">{account.username}</span>
          </span>
          <Button variant="ghost" size="sm" onClick={disconnect}>
            Se déconnecter
          </Button>
        </div>

        <nav aria-label="Navigation OneNote" className="flex flex-wrap items-center gap-1 text-sm">
          {level.kind !== 'notebooks' && (
            <button
              type="button"
              onClick={() => {
                setSelected(new Set())
                setLevel(level.kind === 'sections' ? { kind: 'notebooks' } : { kind: 'sections', notebook: level.notebook })
              }}
              className="mr-1 flex size-7 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink press ring-focus"
              aria-label="Retour"
            >
              <ArrowLeft size={16} />
            </button>
          )}
          {crumb('Bloc-notes', level.kind === 'notebooks', () => setLevel({ kind: 'notebooks' }))}
          {level.kind !== 'notebooks' && (
            <>
              <ChevronRight size={12} className="text-muted" />
              {crumb(level.notebook.displayName, level.kind === 'sections', () => setLevel({ kind: 'sections', notebook: level.notebook }))}
            </>
          )}
          {level.kind === 'pages' && (
            <>
              <ChevronRight size={12} className="text-muted" />
              {crumb(level.section.displayName, true)}
            </>
          )}
        </nav>

        {list.status === 'loading' && (
          <div className="flex flex-col gap-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-11" />
            ))}
          </div>
        )}
        {list.status === 'error' && (
          <div className="flex flex-col items-start gap-2 rounded-[var(--radius-md)] border border-line bg-surface p-4">
            <p className="text-sm text-bad">{list.message}</p>
            <Button variant="secondary" size="sm" onClick={retry}>
              Réessayer
            </Button>
          </div>
        )}
        {list.status === 'ready' && list.items.length === 0 && <p className="py-6 text-center text-sm text-muted">Rien ici pour l’instant.</p>}
        {list.status === 'ready' && level.kind !== 'pages' && (
          <ul className="flex flex-col gap-1.5">
            {list.items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() =>
                    setLevel(level.kind === 'notebooks' ? { kind: 'sections', notebook: item as GraphNotebook } : { kind: 'pages', notebook: level.notebook, section: item as GraphSection })
                  }
                  className="flex h-11 w-full items-center justify-between gap-3 rounded-lg border border-line bg-surface px-3 text-left text-sm hover:bg-surface-2 press ring-focus"
                >
                  <span className="truncate">{(item as GraphNotebook).displayName}</span>
                  <ChevronRight size={14} className="shrink-0 text-muted" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {list.status === 'ready' && level.kind === 'pages' && pageItems.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <label className="flex h-9 items-center gap-3 px-3 text-sm text-muted">
              <input
                type="checkbox"
                className="size-4 accent-accent"
                checked={allSelected}
                onChange={() => setSelected(allSelected ? new Set() : new Set(pageItems.map((p) => p.id)))}
              />
              Tout sélectionner
            </label>
            {pageItems.map((p) => (
              <label key={p.id} className={cx('flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm', selected.has(p.id) ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:bg-surface-2')}>
                <input type="checkbox" className="size-4 accent-accent" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                <span className="flex-1 truncate">{p.title}</span>
                <span className="shrink-0 text-xs text-muted">{new Date(p.lastModifiedDateTime).toLocaleDateString('fr-FR')}</span>
              </label>
            ))}
          </div>
        )}
        {importError && <p className="text-sm text-bad">{importError}</p>}
      </div>
    )
  }

  const footer =
    account && level.kind === 'pages' ? (
      <div className="flex items-center gap-3">
        {progress && (
          <span className="text-sm text-muted" aria-live="polite">
            {progress.done} / {progress.total}…
          </span>
        )}
        <Button onClick={importPages} disabled={!!progress || selected.size === 0}>
          Importer {plural(selected.size, 'page')}
        </Button>
      </div>
    ) : null

  return { body, footer }
}

// Plain function rather than a component so the file keeps a single hook export (fast refresh).
function crumb(label: string, active: boolean, onClick?: () => void): ReactNode {
  if (active) return <span className="max-w-[16rem] truncate font-medium">{label}</span>
  return (
    <button type="button" onClick={onClick} className="max-w-[16rem] truncate rounded-md px-1 text-muted hover:text-ink ring-focus">
      {label}
    </button>
  )
}
