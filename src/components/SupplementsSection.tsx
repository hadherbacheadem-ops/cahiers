import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, ChevronDown, ChevronUp, Sparkles, X } from 'lucide-react'
import type { Supplement, SupplementKind } from '../types'
import { SUPPLEMENT_KIND_LABELS } from '../types'
import { db, discardSupplement, keepSupplement } from '../db'
import { Badge, Button, cx, plural } from './ui'
import { Markdown } from './Markdown'
import type { GenerateFocus } from './GeneratePanel'

const KIND_TONE: Record<SupplementKind, 'accent' | 'warn' | 'bad'> = { manque: 'accent', precision: 'warn', correction: 'bad' }

/**
 * Additions proposed by Claude: pending ones are kept (appended to the fiche)
 * or discarded; kept ones stay listed until their exercises are generated.
 */
export function SupplementsSection({ chapitreId, onGenerate }: { chapitreId: string; onGenerate: (focus: GenerateFocus) => void }) {
  const pending = useLiveQuery(() => db.supplements.where('chapitreId').equals(chapitreId).filter((s) => s.status === 'pending').sortBy('createdAt'), [chapitreId])
  const kept = useLiveQuery(() => db.supplements.where('chapitreId').equals(chapitreId).filter((s) => s.status === 'kept').sortBy('createdAt'), [chapitreId])
  const [showKept, setShowKept] = useState(false)

  if (!pending?.length && !kept?.length) return null

  async function keepAll() {
    for (const s of pending ?? []) await keepSupplement(s.id)
  }
  async function discardAll() {
    if (!window.confirm(`Ignorer les ${plural(pending?.length ?? 0, 'complément')} proposés ?`)) return
    for (const s of pending ?? []) await discardSupplement(s.id)
  }

  const generateFor = (s: Supplement) => onGenerate({ passages: [`## ${s.title}\n${s.content}`], label: s.title })

  return (
    <section className="flex flex-col gap-3">
      {(pending?.length ?? 0) > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-accent/40 bg-accent-soft/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Compléments proposés</h2>
              <p className="text-sm text-muted">{plural(pending!.length, 'proposition')} de Claude en attente. Garde ce qui t’est utile, le reste disparaît.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={keepAll}>
                <Check size={14} />
                Tout garder
              </Button>
              <Button variant="ghost" size="sm" onClick={discardAll}>
                <X size={14} />
                Tout ignorer
              </Button>
            </div>
          </div>
          <ul className="flex flex-col gap-3">
            {pending!.map((s) => (
              <SupplementCard key={s.id} supplement={s} />
            ))}
          </ul>
        </div>
      )}

      {(kept?.length ?? 0) > 0 && (
        <div className="rounded-xl border border-line bg-surface px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">
              <span className="font-medium">{plural(kept!.length, 'complément ajouté', 'compléments ajoutés')} à la fiche.</span>
              <span className="text-muted"> Chacun mérite ses exercices.</span>
            </p>
            <Button variant="ghost" size="sm" onClick={() => setShowKept((v) => !v)} aria-expanded={showKept}>
              {showKept ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {showKept ? 'Masquer' : 'Voir'}
            </Button>
          </div>
          {showKept && (
            <ul className="mt-3 flex flex-col divide-y divide-line">
              {kept!.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span className="flex items-center gap-2">
                    <Badge tone={KIND_TONE[s.kind]}>{SUPPLEMENT_KIND_LABELS[s.kind]}</Badge>
                    <Markdown inline text={s.title} />
                  </span>
                  <Button size="sm" variant="secondary" onClick={() => generateFor(s)}>
                    <Sparkles size={14} />
                    Générer les exercices de ce complément
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}

function SupplementCard({ supplement: s }: { supplement: Supplement }) {
  const [expanded, setExpanded] = useState(false)
  const long = s.content.length > 500

  return (
    <li className="rounded-xl border border-line bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={KIND_TONE[s.kind]}>{SUPPLEMENT_KIND_LABELS[s.kind]}</Badge>
        <h3 className="font-medium">
          <Markdown inline text={s.title} />
        </h3>
      </div>
      {s.reason && (
        <p className="mt-1 text-sm text-muted">
          <Markdown inline text={s.reason} />
        </p>
      )}
      <div className={cx('mt-3 text-sm', !expanded && long && 'max-h-40 overflow-hidden [mask-image:linear-gradient(to_bottom,black_60%,transparent)]')}>
        <Markdown text={s.content} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => keepSupplement(s.id)}>
          <Check size={14} />
          Garder
        </Button>
        <Button size="sm" variant="secondary" onClick={() => discardSupplement(s.id)}>
          <X size={14} />
          Ignorer
        </Button>
        {long && (
          <Button size="sm" variant="ghost" onClick={() => setExpanded((e) => !e)} className="ml-auto">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {expanded ? 'Réduire' : 'Tout lire'}
          </Button>
        )}
      </div>
    </li>
  )
}
