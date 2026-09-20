import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, ExternalLink, Eye, GraduationCap, Lightbulb, LockKeyhole, Sparkles } from 'lucide-react'
import { db } from '../db'
import type { PrepExo } from '../types'
import { Badge, Button, EmptyState, PageHeader, Skeleton, cx, plural } from '../components/ui'
import { GeneratePanel } from '../components/GeneratePanel'
import { Markdown } from '../components/Markdown'
import { resetFieldContext, setFieldContext } from '../lib/fieldContext'

type Track = 'kholle' | 'ds'

const TRACKS: { id: Track; label: string; hint: string }[] = [
  { id: 'kholle', label: 'Kholle', hint: 'Exercices d’oral : courts, à chercher au tableau en 15 à 25 minutes.' },
  { id: 'ds', label: 'DS', hint: 'Extraits de problèmes d’écrit : plusieurs questions, une à deux heures.' },
]

interface Progress {
  /** Hints unlocked so far (0–3). */
  hints: number
  correction: boolean
  done: boolean
}

const EMPTY: Progress = { hints: 0, correction: false, done: false }
const KEY = (id: string) => `cahiers.prepa.${id}`

function read(id: string): Progress {
  try {
    const raw = localStorage.getItem(KEY(id))
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<Progress>) } : EMPTY
  } catch {
    return EMPTY
  }
}

/** Per-exercise progress (hints unlocked, correction seen, done): a convenience kept on this device only. */
function useProgress(id: string): [Progress, (patch: Partial<Progress>) => void] {
  const [progress, setProgress] = useState<Progress>(() => read(id))
  useEffect(() => setProgress(read(id)), [id])
  const update = useCallback(
    (patch: Partial<Progress>) => {
      setProgress((prev) => {
        const next = { ...prev, ...patch }
        try {
          localStorage.setItem(KEY(id), JSON.stringify(next))
        } catch {
          /* private mode: the state lives for this visit only */
        }
        return next
      })
    },
    [id],
  )
  return [progress, update]
}

export default function PreparationPage() {
  const { cahierId = '', chapitreId = '' } = useParams()
  const [track, setTrack] = useState<Track>('kholle')
  const [generating, setGenerating] = useState(false)
  const cahier = useLiveQuery(() => db.cahiers.get(cahierId).then((c) => c ?? null), [cahierId])
  const chapitre = useLiveQuery(() => db.chapitres.get(chapitreId).then((c) => c ?? null), [chapitreId])

  useEffect(() => {
    setFieldContext({ cahierId, cahierColor: cahier?.color, calm: true, excludeChapitreIds: [] })
    return () => resetFieldContext()
  }, [cahierId, cahier?.color])

  const prepa = chapitre?.prepa
  // Open on the track that has something in it.
  useEffect(() => {
    if (prepa && !prepa[track].length && prepa[track === 'kholle' ? 'ds' : 'kholle'].length) setTrack(track === 'kholle' ? 'ds' : 'kholle')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prepa?.generatedAt])

  const groups = useMemo(() => {
    const list = prepa?.[track] ?? []
    const byConcours = new Map<string, PrepExo[]>()
    for (const e of list) byConcours.set(e.concours, [...(byConcours.get(e.concours) ?? []), e])
    return [...byConcours.entries()].sort((a, b) => a[1][0].niveau - b[1][0].niveau)
  }, [prepa, track])

  if (chapitre === undefined || cahier === undefined) return <Skeleton className="h-40" />
  if (!chapitre || !cahier) {
    return <EmptyState title="Fiche introuvable" description="Elle a peut-être été supprimée." action={<Link to={`/cahier/${cahierId}`} className="text-sm font-medium text-accent-text">Retour au cahier</Link>} />
  }

  const total = prepa ? prepa.kholle.length + prepa.ds.length : 0
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={
          <span className="flex flex-wrap items-center gap-1.5">
            <Link to="/" className="hover:text-ink">
              Tableau de bord
            </Link>
            <span aria-hidden>/</span>
            <Link to={`/cahier/${cahier.id}`} className="hover:text-ink">
              {cahier.name}
            </Link>
            <span aria-hidden>/</span>
            <Link to={`/cahier/${cahier.id}/fiche/${chapitre.id}`} className="hover:text-ink">
              {chapitre.title}
            </Link>
          </span>
        }
        title="Préparation"
        subtitle="Des exercices d’annales de concours sur cette fiche, en difficulté croissante. Cherche d’abord seul ; les indices se débloquent un par un, la correction en dernier."
        actions={
          <>
            <Link
              to={`/cahier/${cahier.id}/fiche/${chapitre.id}`}
              className="inline-flex h-10 items-center rounded-[var(--radius-md)] border border-line-strong px-4 text-sm font-medium text-ink hover:bg-surface-2 press ring-focus"
            >
              Retour à la fiche
            </Link>
            <Button variant="secondary" onClick={() => setGenerating(true)}>
              <Sparkles size={16} />
              {total ? 'Régénérer avec Claude' : 'Générer avec Claude'}
            </Button>
          </>
        }
      />

      {!prepa || total === 0 ? (
        <EmptyState
          icon={<GraduationCap size={26} />}
          title="Pas encore de préparation pour cette fiche"
          description="Claude cherche dans les annales des exercices de kholle et de DS liés à cette fiche (CCP, Centrale, X…), avec trois indices et une correction pour chacun."
          action={
            <Button onClick={() => setGenerating(true)}>
              <Sparkles size={16} />
              Générer la préparation
            </Button>
          }
        />
      ) : (
        <>
          {prepa.note && <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm">Note de Claude : {prepa.note}</p>}
          <div className="flex flex-col gap-2">
            <div role="tablist" aria-label="Kholle ou DS" className="flex gap-2">
              {TRACKS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={track === t.id}
                  data-action={`prepa-${t.id}`}
                  onClick={() => setTrack(t.id)}
                  className={cx(
                    'inline-flex h-11 items-center gap-2 rounded-[var(--radius-md)] border px-5 text-sm font-medium press ring-focus',
                    track === t.id ? 'border-accent bg-accent-soft text-accent-text' : 'border-line-strong text-muted hover:bg-surface-2 hover:text-ink',
                  )}
                >
                  {t.label}
                  <span className="tabular-nums opacity-70">{prepa[t.id].length}</span>
                </button>
              ))}
            </div>
            <p className="text-sm text-muted">{TRACKS.find((t) => t.id === track)?.hint}</p>
          </div>

          {groups.length === 0 ? (
            <p className="text-sm text-muted">Aucun exercice dans cette catégorie.</p>
          ) : (
            groups.map(([concours, list], gi) => (
              <section key={concours} className="flex flex-col gap-3" aria-label={concours}>
                <div className="flex items-center gap-3">
                  <h2 className="text-xl">{concours}</h2>
                  <span className="flex items-center gap-1" aria-label={`Difficulté ${gi + 1} sur ${groups.length}`} title={`Difficulté ${gi + 1} sur ${groups.length}`}>
                    {groups.map((_, i) => (
                      <span key={i} className={cx('size-2 rounded-full', i <= gi ? 'bg-accent' : 'bg-line-strong')} />
                    ))}
                  </span>
                  <span className="text-sm text-muted">{plural(list.length, 'exercice')}</span>
                </div>
                <ul className="flex flex-col gap-4">
                  {list.map((e) => (
                    <li key={e.id}>
                      <PrepCard exo={e} track={track} />
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </>
      )}

      <GeneratePanel open={generating} onClose={() => setGenerating(false)} chapitre={chapitre} cahierName={cahier.name} prepaOnly />
    </div>
  )
}

function PrepCard({ exo, track }: { exo: PrepExo; track: Track }) {
  const [p, set] = useProgress(exo.id)
  const shown = exo.hints.slice(0, p.hints)
  const next = p.hints < exo.hints.length
  return (
    <article className={cx('flex flex-col gap-4 rounded-[var(--radius-md)] border bg-surface p-5 shadow-elev-2', p.done ? 'border-ok/50' : 'border-line')}>
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="accent">{exo.concours}</Badge>
          {exo.annee && <Badge>{exo.annee}</Badge>}
          {exo.epreuve && <Badge>{exo.epreuve}</Badge>}
          {track === 'kholle' && exo.duree ? <Badge>{exo.duree} min</Badge> : null}
          {!exo.exact && <Badge tone="warn">énoncé adapté : à vérifier</Badge>}
          <Button size="sm" variant={p.done ? 'primary' : 'secondary'} className="ml-auto" aria-pressed={p.done} onClick={() => set({ done: !p.done })}>
            <Check size={14} />
            {p.done ? 'Fait' : 'Marquer comme fait'}
          </Button>
        </div>
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
          <span>Source : {exo.source}</span>
          {exo.sourceUrl && (
            <a href={exo.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent-text underline-offset-2 hover:underline">
              ouvrir <ExternalLink size={12} aria-hidden="true" />
            </a>
          )}
        </p>
      </header>

      <div className="text-[15px]">
        <Markdown text={exo.statement} />
      </div>

      <div className="flex flex-col gap-2 border-t border-line pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <Lightbulb size={16} className="text-accent-text" aria-hidden="true" />
            Indices
          </span>
          <span className="text-xs text-muted tabular-nums">
            {p.hints} / {exo.hints.length}
          </span>
        </div>
        {shown.length > 0 && (
          <ol className="flex flex-col gap-2">
            {shown.map((h, i) => (
              <li key={i} className="rounded-lg bg-accent-soft/50 px-3 py-2 text-sm">
                <span className="mr-2 text-xs font-semibold uppercase tracking-wide text-accent-text">Indice {i + 1}</span>
                <Markdown text={h} />
              </li>
            ))}
          </ol>
        )}
        {next && (
          <div>
            <Button size="sm" variant="secondary" onClick={() => set({ hints: p.hints + 1 })}>
              <LockKeyhole size={14} />
              {p.hints === 0 ? 'Débloquer le premier indice' : `Débloquer l’indice ${p.hints + 1}`}
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-line pt-4">
        {p.correction ? (
          <div className="rounded-lg border border-ok/40 bg-ok-soft px-4 py-3 text-[15px]">
            <p className="mb-1 flex items-center gap-1.5 text-sm font-medium">
              <Check size={16} aria-hidden="true" />
              Correction
            </p>
            <Markdown text={exo.correction} />
            <Button size="sm" variant="ghost" className="mt-2" onClick={() => set({ correction: false })}>
              Masquer
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" variant="secondary" onClick={() => set({ correction: true })}>
              <Eye size={14} />
              Voir la correction
            </Button>
            {p.hints < exo.hints.length && <span className="text-xs text-muted">Essaie d’abord avec les indices.</span>}
          </div>
        )}
      </div>
    </article>
  )
}
