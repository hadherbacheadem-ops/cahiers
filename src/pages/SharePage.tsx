import { useEffect } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Share2 } from 'lucide-react'
import { db } from '../db'
import { Button, ColorDot, EmptyState, PageHeader } from '../components/ui'

/** Where a shared text waits for the fiche panel (session only: never persisted). */
export const SHARE_KEY = 'cahiers.share'

export function takeSharedText(): string | null {
  try {
    const t = sessionStorage.getItem(SHARE_KEY)
    if (t) sessionStorage.removeItem(SHARE_KEY)
    return t
  } catch {
    return null
  }
}

/**
 * Landing page of the manifest's `share_target` (Android): another app shared
 * a text, a URL or a title with Cahiers. The user picks the cahier, and the
 * text lands in « Rédiger avec Claude » as the first source. Without a share
 * (opened by hand), it goes home.
 */
export default function SharePage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const cahiers = useLiveQuery(() => db.cahiers.orderBy('name').toArray(), [])
  const title = params.get('title')?.trim() ?? ''
  const url = params.get('url')?.trim() ?? ''
  const text = params.get('text')?.trim() ?? ''
  const shared = [title, text, url].filter(Boolean).join('\n\n')

  useEffect(() => {
    // One cahier: no choice to make.
    if (shared && cahiers && cahiers.length === 1) {
      sessionStorage.setItem(SHARE_KEY, shared)
      navigate(`/cahier/${cahiers[0].id}?partage=1`, { replace: true })
    }
  }, [shared, cahiers, navigate])

  if (!shared) return <Navigate to="/" replace />
  if (!cahiers) return null

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Reçu par partage" subtitle="Choisis le cahier : le texte devient la première source de « Rédiger avec Claude »." />
      <pre className="max-h-48 overflow-auto rounded-[var(--radius-md)] border border-line bg-surface-2 p-4 text-sm whitespace-pre-wrap" data-wrap-anywhere>
        {shared.slice(0, 1200)}
        {shared.length > 1200 ? '…' : ''}
      </pre>
      {cahiers.length === 0 ? (
        <EmptyState illustration="notebook" title="Aucun cahier" description="Crée d’abord un cahier, puis partage à nouveau." action={<Button onClick={() => navigate('/cahiers')}>Mes cahiers</Button>} />
      ) : (
        <ul className="flex flex-col gap-2">
          {cahiers.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                data-action="partager-vers-le-cahier"
                onClick={() => {
                  sessionStorage.setItem(SHARE_KEY, shared)
                  navigate(`/cahier/${c.id}?partage=1`, { replace: true })
                }}
                className="flex min-h-14 w-full items-center gap-3 rounded-[var(--radius-md)] border border-line bg-surface px-4 text-left text-base press ring-focus hover:bg-surface-2"
              >
                <ColorDot color={c.color} />
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <Share2 size={16} className="shrink-0 text-muted" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
