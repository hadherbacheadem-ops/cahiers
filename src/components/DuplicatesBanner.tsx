import { useMemo, useState } from 'react'
import { Copy, Sparkles } from 'lucide-react'
import type { Exercise } from '../types'
import { resolveFlashcardDuplicates } from '../db'
import { findFlashcardDuplicates } from '../lib/dedupe'
import { Button, plural } from './ui'

/**
 * « N flashcards posent une question déjà posée » with a one-click clean-up:
 * the copy without history is removed, the survivor becomes a plain flip
 * card. Shown on the validation queue and on the fiche's exercise list.
 */
export function DuplicatesBanner({ chapitreId, exercises, onCleaned }: { chapitreId: string; exercises: Exercise[] | undefined; onCleaned?: (removedPending: number) => void }) {
  const pairs = useMemo(() => (exercises ? findFlashcardDuplicates(exercises) : []), [exercises])
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<number | null>(null)
  if (!pairs.length) return done ? <p className="text-sm text-ok">{plural(done, 'doublon retiré', 'doublons retirés')}.</p> : null
  const typedPairs = pairs.filter((p) => p.removed.data.type === 'flashcard' && (p.removed.data.typed || (p.survivor.data.type === 'flashcard' && p.survivor.data.typed))).length
  const clean = async () => {
    setBusy(true)
    try {
      const r = await resolveFlashcardDuplicates(chapitreId)
      setDone(r.removed)
      onCleaned?.(r.removedPending)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-warn/50 bg-warn-soft px-4 py-3 text-sm" role="status">
      <Copy size={18} className="shrink-0 text-warn" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        <span className="font-medium">{plural(pairs.length, 'question posée deux fois', 'questions posées deux fois')}</span>
        <span className="block text-xs text-muted">
          {typedPairs ? 'Une carte « à saisir » et une carte à retourner sur le même fait : ' : 'Deux flashcards presque identiques : '}
          seule la carte à retourner reste, avec l’historique s’il y en a un.
        </span>
      </p>
      <Button size="sm" onClick={clean} loading={busy}>
        <Sparkles size={14} />
        Nettoyer
      </Button>
    </div>
  )
}
