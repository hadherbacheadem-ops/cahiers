import { useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { RefreshCw } from 'lucide-react'
import { db } from '../db'
import { CONTENT_KEY, syncBundledContent, type AppliedContent } from '../lib/bundledContent'
import { Button } from './ui'

const day = (ts: number) => new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

/** Réglages → Contenu du site: the content published with the app, merged on its own at start-up. */
export function BundledContentSection({ Section }: { Section: (p: { title: string; description?: string; children: ReactNode; folded?: boolean; summary?: string }) => ReactNode }) {
  const applied = useLiveQuery(async () => ((await db.kv.get(CONTENT_KEY))?.value as AppliedContent | undefined) ?? null, [])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'bad'; text: string }>()

  async function reload() {
    setBusy(true)
    setMessage(undefined)
    try {
      const r = await syncBundledContent({ force: true })
      if (r.status === 'absent') setMessage({ tone: 'bad', text: 'Aucun contenu publié n’a pu être lu (hors ligne, ou le site n’en publie pas).' })
      else {
        const total = (c: Record<string, number>) => Object.values(c).reduce((a, b) => a + b, 0)
        const added = r.summary ? total(r.summary.added) : 0
        const updated = r.summary ? total(r.summary.updated) : 0
        setMessage({ tone: 'ok', text: added + updated ? `Contenu rechargé : ${added} ajout${added > 1 ? 's' : ''}, ${updated} mise${updated > 1 ? 's' : ''} à jour.` : 'Tu as déjà tout le contenu publié.' })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section
      folded
      title="Contenu du site"
      summary={applied ? `Publié le ${day(applied.exportedAt)}` : 'Cahiers et fiches publiés avec le site'}
      description="Les cahiers, fiches et exercices publiés avec le site se chargent tout seuls à l’ouverture. Ils sont fusionnés avec les tiens : ta progression, tes réglages et ce que tu as supprimé ne changent pas."
    >
      <p className="text-sm">
        {applied ? (
          <>
            Contenu publié le <span className="font-medium">{day(applied.exportedAt)}</span>, vérifié {new Date(applied.checkedAt).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.
          </>
        ) : (
          'Pas encore de contenu chargé sur cet appareil.'
        )}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={reload} disabled={busy}>
          <RefreshCw size={16} className={busy ? 'animate-spin' : undefined} />
          {busy ? 'Chargement…' : 'Recharger le contenu du site'}
        </Button>
        <span className="text-xs text-muted">Ce qui avait été supprimé sur cet appareil et qui est publié revient.</span>
      </div>
      {message && (
        <p role="status" className={message.tone === 'ok' ? 'text-sm text-ok' : 'text-sm text-bad'}>
          {message.text}
        </p>
      )}
    </Section>
  )
}
