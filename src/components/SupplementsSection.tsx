import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CaretDown, CaretUp, Check, X } from '@phosphor-icons/react'
import type { Supplement, SupplementKind } from '../types'
import { SUPPLEMENT_KIND_LABELS } from '../types'
import { db, discardSupplement, keepSupplement } from '../db'
import { Badge, Button, cx, plural } from './ui'

const KIND_TONE: Record<SupplementKind, 'accent' | 'warn' | 'bad'> = { manque: 'accent', precision: 'warn', correction: 'bad' }

/** Pending additions proposed by Claude: each one is kept (appended to the fiche) or discarded. */
export function SupplementsSection({ chapitreId }: { chapitreId: string }) {
  const pending = useLiveQuery(() => db.supplements.where('chapitreId').equals(chapitreId).filter((s) => s.status === 'pending').sortBy('createdAt'), [chapitreId])
  const keptCount = useLiveQuery(() => db.supplements.where('chapitreId').equals(chapitreId).filter((s) => s.status === 'kept').count(), [chapitreId])

  if (!pending?.length) return null

  async function keepAll() {
    for (const s of pending ?? []) await keepSupplement(s.id)
  }
  async function discardAll() {
    if (!window.confirm(`Ignorer les ${plural(pending?.length ?? 0, 'complément')} proposés ?`)) return
    for (const s of pending ?? []) await discardSupplement(s.id)
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-accent/40 bg-accent-soft/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Compléments proposés</h2>
          <p className="text-sm text-muted">
            {plural(pending.length, 'proposition')} de Claude en attente{keptCount ? ` · ${keptCount} déjà ${keptCount === 1 ? 'ajouté' : 'ajoutés'} à la fiche` : ''}. Garde ce qui t’est utile, le reste disparaît.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={keepAll}>
            <Check size={14} weight="bold" />
            Tout garder
          </Button>
          <Button variant="ghost" size="sm" onClick={discardAll}>
            <X size={14} weight="bold" />
            Tout ignorer
          </Button>
        </div>
      </div>
      <ul className="flex flex-col gap-3">
        {pending.map((s) => (
          <SupplementCard key={s.id} supplement={s} />
        ))}
      </ul>
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
        <h3 className="font-medium">{s.title}</h3>
      </div>
      {s.reason && <p className="mt-1 text-sm text-muted">{s.reason}</p>}
      <div className={cx('prose-fiche mt-3 text-sm', !expanded && long && 'max-h-40 overflow-hidden [mask-image:linear-gradient(to_bottom,black_60%,transparent)]')}>{s.content}</div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => keepSupplement(s.id)}>
          <Check size={14} weight="bold" />
          Garder
        </Button>
        <Button size="sm" variant="secondary" onClick={() => discardSupplement(s.id)}>
          <X size={14} weight="bold" />
          Ignorer
        </Button>
        {long && (
          <Button size="sm" variant="ghost" onClick={() => setExpanded((e) => !e)} className="ml-auto">
            {expanded ? <CaretUp size={14} /> : <CaretDown size={14} />}
            {expanded ? 'Réduire' : 'Tout lire'}
          </Button>
        )}
      </div>
    </li>
  )
}
