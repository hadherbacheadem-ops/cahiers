import { useMemo, useState } from 'react'
import { VIEW_TRANSITIONS } from '../lib/media'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowRight, Plus } from 'lucide-react'
import { db } from '../db'
import { isDueExercise } from '../lib/srs'
import { Button, ColorDot, EmptyState, PageHeader, Skeleton, cx, plural } from '../components/ui'
import { NewCahierModal } from '../components/NewCahierModal'

/** The list of cahiers, mainly for the mobile bottom bar (the dashboard shows the same cards further down). */
export default function CahiersPage() {
  const [creating, setCreating] = useState(false)
  const cahiers = useLiveQuery(() => db.cahiers.orderBy('name').toArray(), [])
  const chapitres = useLiveQuery(() => db.chapitres.toArray(), [])
  const exercises = useLiveQuery(() => db.exercises.toArray(), [])
  const stats = useMemo(() => {
    const now = Date.now()
    const m = new Map<string, { fiches: number; exos: number; due: number }>()
    chapitres?.forEach((c) => {
      const s = m.get(c.cahierId) ?? { fiches: 0, exos: 0, due: 0 }
      s.fiches++
      m.set(c.cahierId, s)
    })
    exercises?.forEach((e) => {
      const s = m.get(e.cahierId) ?? { fiches: 0, exos: 0, due: 0 }
      s.exos++
      if (isDueExercise(e, now)) s.due++
      m.set(e.cahierId, s)
    })
    return m
  }, [chapitres, exercises])
  const loading = !cahiers || !chapitres || !exercises

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Mes cahiers"
        subtitle="Un cahier par matière : ses fiches, ses exercices, ses examens."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus size={16} />
            Nouveau cahier
          </Button>
        }
      />
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[112px]" />
          ))}
        </div>
      ) : cahiers.length === 0 ? (
        <EmptyState illustration="notebook" title="Aucun cahier pour l’instant" description="Crée un cahier par matière pour y ranger tes fiches." action={<Button onClick={() => setCreating(true)}>Créer mon premier cahier</Button>} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {cahiers.map((c) => {
            const s = stats.get(c.id) ?? { fiches: 0, exos: 0, due: 0 }
            return (
              <li key={c.id}>
                <Link
                  to={`/cahier/${c.id}`}
                  data-action="ouvrir-le-cahier"
                  viewTransition={VIEW_TRANSITIONS}
                  style={{ '--cahier': c.color } as React.CSSProperties}
                  className="relative flex min-h-[112px] flex-col justify-between overflow-hidden rounded-[var(--radius-md)] border border-line bg-surface p-5 shadow-elev-2 ring-focus"
                >
                  <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-cahier" />
                  <span className="flex items-center gap-2.5">
                    <ColorDot color={c.color} className="size-3" />
                    <span className="truncate font-display text-lg">{c.name}</span>
                  </span>
                  <span className="mt-3 flex items-center justify-between text-sm">
                    <span className="text-muted">
                      {plural(s.fiches, 'fiche')} · {plural(s.exos, 'exercice')}
                    </span>
                    <span className={cx('flex items-center gap-1 font-medium', s.due ? 'text-cahier-text' : 'text-muted')}>
                      {s.due ? `${s.due} à revoir` : 'À jour'}
                      <ArrowRight size={16} />
                    </span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
      <NewCahierModal open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}
