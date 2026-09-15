import { useEffect, useState } from 'react'
import { RefreshCw, TriangleAlert, X } from 'lucide-react'
import { Button, IconButton } from './ui'

declare global {
  interface Window {
    /** Set by main.tsx: applies the waiting service worker and reloads. */
    __cahiersUpdate?: () => Promise<void>
    /** Set by main.tsx when the local database could not be opened. */
    __cahiersStorageError?: string
  }
}

/**
 * Two banners above the bottom bar: « Nouvelle version — Recharger » when a
 * new service worker is waiting (the app otherwise keeps running the old
 * bundle until every tab is closed), and « Stockage indisponible » when the
 * database cannot open (private browsing on old Safari, quota, locked).
 */
export function UpdateBanner() {
  const [update, setUpdate] = useState(false)
  const [storage, setStorage] = useState<string | null>(() => window.__cahiersStorageError ?? null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onUpdate = () => setUpdate(true)
    const onStorage = (e: Event) => setStorage((e as CustomEvent<string>).detail || 'Base de données inaccessible')
    window.addEventListener('cahiers:update', onUpdate)
    window.addEventListener('cahiers:storage-error', onStorage)
    return () => {
      window.removeEventListener('cahiers:update', onUpdate)
      window.removeEventListener('cahiers:storage-error', onStorage)
    }
  }, [])

  if (!update && !storage) return null
  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[60] flex flex-col gap-2 md:inset-x-auto md:right-4 md:bottom-4 md:w-96">
      {update && (
        <div role="status" className="pointer-events-auto flex items-center gap-3 rounded-[var(--radius-md)] border border-accent/50 bg-surface px-4 py-3 shadow-elev-4">
          <span className="min-w-0 flex-1 text-sm">
            <span className="block font-medium">Nouvelle version</span>
            <span className="block text-xs text-muted">Recharge pour l’utiliser ; rien n’est perdu.</span>
          </span>
          <Button
            size="sm"
            data-action="recharger"
            loading={busy}
            onClick={async () => {
              setBusy(true)
              try {
                if (window.__cahiersUpdate) await window.__cahiersUpdate()
                else window.location.reload()
              } catch {
                window.location.reload()
              }
            }}
          >
            <RefreshCw size={14} />
            Recharger
          </Button>
        </div>
      )}
      {storage && (
        <div role="alert" className="pointer-events-auto flex items-start gap-3 rounded-[var(--radius-md)] border border-bad/50 bg-surface px-4 py-3 shadow-elev-4">
          <TriangleAlert size={18} className="mt-0.5 shrink-0 text-bad" aria-hidden="true" />
          <span className="min-w-0 flex-1 text-sm">
            <span className="block font-medium">Stockage indisponible</span>
            <span className="block text-xs text-muted">
              Navigation privée, espace plein ou base verrouillée : ce que tu fais maintenant ne sera pas conservé. Détail : {storage}
            </span>
          </span>
          <IconButton label="Fermer" size="sm" data-action="fermer-alerte-stockage" onClick={() => setStorage(null)}>
            <X size={16} />
          </IconButton>
        </div>
      )}
    </div>
  )
}
