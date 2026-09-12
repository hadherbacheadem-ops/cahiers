import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronDown, ChevronUp, ListPlus, Network, Pencil, Sparkles, Trash } from 'lucide-react'
import { db, deleteChapitre, updateChapitre } from '../db'
import { isDueExercise } from '../lib/srs'
import { formatChars, formatFullDate } from '../lib/format'
import { EXERCISE_LABELS, EXERCISE_TYPES, type ExerciseType } from '../types'
import { Badge, Button, EmptyState, ExerciseTypeIcon, Field, IconButton, Input, Modal, PageHeader, Skeleton, Textarea, cx, plural } from '../components/ui'
import { GeneratePanel, type GenerateFocus } from '../components/GeneratePanel'
import { SupplementPanel } from '../components/SupplementPanel'
import { MindmapPanel } from '../components/MindmapPanel'
import { resetFieldContext, setFieldContext } from '../lib/fieldContext'
import { SupplementsSection } from '../components/SupplementsSection'
import { CoverageSection } from '../components/CoverageSection'
import { ExerciseCard } from '../components/ExerciseCard'
import { Markdown } from '../components/Markdown'

export default function ChapitrePage() {
  const { cahierId = '', chapitreId = '' } = useParams()
  const navigate = useNavigate()
  const [generating, setGenerating] = useState(false)
  const [focus, setFocus] = useState<GenerateFocus | undefined>()
  const [completing, setCompleting] = useState(false)
  const [mapping, setMapping] = useState(false)
  const [editing, setEditing] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [filter, setFilter] = useState<ExerciseType | 'all'>('all')

  // `?? null` distinguishes "not found" from "still loading" (both would be undefined otherwise).
  const cahier = useLiveQuery(() => db.cahiers.get(cahierId).then((c) => c ?? null), [cahierId])
  const chapitre = useLiveQuery(() => db.chapitres.get(chapitreId).then((c) => c ?? null), [chapitreId])
  useEffect(() => {
    setFieldContext({ cahierId, cahierColor: cahier?.color, calm: false, excludeChapitreIds: [] })
    return () => resetFieldContext()
  }, [cahierId, cahier?.color])
  const exercises = useLiveQuery(() => db.exercises.where('chapitreId').equals(chapitreId).sortBy('createdAt'), [chapitreId])
  const points = useLiveQuery(() => db.points.where('chapitreId').equals(chapitreId).sortBy('order'), [chapitreId])
  const mindmap = useLiveQuery(() => db.mindmaps.where('chapitreId').equals(chapitreId).first(), [chapitreId])
  const pendingCount = useMemo(() => exercises?.filter((e) => e.status === 'pending').length ?? 0, [exercises])

  function generate(f?: GenerateFocus) {
    setFocus(f)
    setGenerating(true)
  }

  const counts = useMemo(() => {
    const m = new Map<ExerciseType, number>()
    exercises?.forEach((e) => m.set(e.type, (m.get(e.type) ?? 0) + 1))
    return m
  }, [exercises])
  const due = useMemo(() => exercises?.filter((e) => isDueExercise(e)).length ?? 0, [exercises])
  const visible = useMemo(() => (filter === 'all' ? exercises : exercises?.filter((e) => e.type === filter)) ?? [], [exercises, filter])

  useEffect(() => {
    if (filter !== 'all' && !counts.get(filter)) setFilter('all')
  }, [counts, filter])

  if (chapitre === undefined || cahier === undefined) return <Skeleton className="h-40" />
  if (!chapitre || !cahier) {
    return <EmptyState title="Fiche introuvable" description="Elle a peut-être été supprimée." action={<Link to={`/cahier/${cahierId}`} className="text-sm font-medium text-accent-text">Retour au cahier</Link>} />
  }

  const from = `/cahier/${cahier.id}/fiche/${chapitre.id}`
  const isLong = chapitre.content.length > 1200

  async function remove() {
    if (!chapitre) return
    if (!window.confirm(`Supprimer la fiche « ${chapitre.title} » et ses ${plural(exercises?.length ?? 0, 'exercice')} ?`)) return
    await deleteChapitre(chapitre.id)
    navigate(`/cahier/${cahierId}`)
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-1.5">
            <Link to="/" className="hover:text-ink">
              Tableau de bord
            </Link>
            <span aria-hidden>/</span>
            <Link to={`/cahier/${cahier.id}`} className="hover:text-ink">
              {cahier.name}
            </Link>
          </span>
        }
        title={chapitre.title}
        subtitle={`Importée le ${formatFullDate(chapitre.createdAt)} · ${formatChars(chapitre.content.length)}${exercises?.length ? ` · ${plural(exercises.length, 'exercice')}` : ''}`}
        actions={
          <>
            <Button onClick={() => generate()}>
              <Sparkles size={16} />
              Générer des exercices
            </Button>
            <Button variant="secondary" onClick={() => setCompleting(true)} title="Comparer la fiche au programme et recevoir des compléments">
              <ListPlus size={16} />
              Compléter
            </Button>
            {mindmap ? (
              <Button variant="secondary" onClick={() => navigate(`/carte/${mindmap.id}`)}>
                <Network size={16} />
                Voir la carte mentale
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => setMapping(true)}>
                <Network size={16} />
                Carte mentale
              </Button>
            )}
            <Button variant="secondary" disabled={!due} onClick={() => navigate(`/train?scope=chapitre&id=${chapitre.id}&mode=review&from=${from}`)}>
              Réviser{due ? ` (${due})` : ''}
            </Button>
            <Button variant="secondary" disabled={!exercises?.length} onClick={() => navigate(`/train?scope=chapitre&id=${chapitre.id}&mode=practice&from=${from}`)}>
              S’entraîner
            </Button>
            <IconButton label="Modifier la fiche" onClick={() => setEditing(true)}>
              <Pencil size={18} />
            </IconButton>
            <IconButton label="Supprimer la fiche" onClick={remove} className="hover:text-bad">
              <Trash size={18} />
            </IconButton>
          </>
        }
      />

      {/* Everything below needs exercises and points: one skeleton until both are here, so nothing appears late above the grid (CLS). */}
      {(!exercises || !points) && (
        <div className="flex flex-col gap-8" aria-busy="true">
          <Skeleton className="h-[76px]" />
          <div className="grid gap-8 lg:grid-cols-[1fr_minmax(280px,38%)]">
            <Skeleton className="h-96" />
            <Skeleton className="h-96" />
          </div>
        </div>
      )}

      {exercises && points && pendingCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-accent/40 bg-accent-soft/50 px-4 py-3">
          <p className="text-sm">
            <span className="font-medium">{plural(pendingCount, 'exercice à valider', 'exercices à valider')}</span>
            <span className="text-muted"> — ils n’entrent dans le planning qu’une fois gardés. Clavier : J garder, K ignorer, E modifier.</span>
          </p>
          <Button size="sm" onClick={() => navigate(`/cahier/${cahier.id}/fiche/${chapitre.id}/valider`)}>
            Valider maintenant
          </Button>
        </div>
      )}

      {points && exercises && <CoverageSection chapitre={chapitre} points={points} exercises={exercises} onGenerate={generate} />}

      {points && exercises && (
      <div className="grid gap-8 lg:grid-cols-[1fr_minmax(280px,38%)]">
        {/* Exercises */}
        <section className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="mr-2 text-xl">Exercices</h2>
            {(exercises?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filtrer par type">
                <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
                  Tous · {exercises?.length}
                </FilterChip>
                {EXERCISE_TYPES.filter((t) => counts.get(t)).map((t) => (
                  <FilterChip key={t} active={filter === t} onClick={() => setFilter(t)}>
                    <ExerciseTypeIcon type={t} /> {EXERCISE_LABELS[t]} · {counts.get(t)}
                  </FilterChip>
                ))}
              </div>
            )}
          </div>

          {!exercises ? (
            <Skeleton className="h-40" />
          ) : exercises.length === 0 ? (
            <EmptyState
              icon={<Sparkles size={24} />}
              title="Aucun exercice pour cette fiche"
              description="Claude peut en générer à partir du contenu de la fiche : flashcards, textes à trous, QCM, associations…"
              action={
                <Button onClick={() => generate()}>
                  <Sparkles size={16} />
                  Générer avec Claude
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-line rounded-[var(--radius-md)] border border-line bg-surface shadow-elev-2">
              {visible.map((e) => (
                <ExerciseCard key={e.id} exercise={e} points={points ?? []} />
              ))}
            </ul>
          )}
        </section>

        {/* Fiche content */}
        <aside className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-8 lg:self-start">
          <div className="flex items-center justify-between">
            <h2 className="text-xl">Fiche</h2>
            <Badge>{{ paste: 'Texte collé', docx: 'Word', pdf: 'PDF', onenote: 'OneNote', claude: 'Rédigée par Claude' }[chapitre.source]}</Badge>
          </div>
          <div className="relative rounded-[var(--radius-md)] border border-line bg-surface p-5 shadow-elev-2">
            <div className={cx('text-[15px]', !expanded && isLong && 'max-h-[60vh] overflow-hidden')}>{chapitre.content ? <Markdown text={chapitre.content} /> : <span className="text-muted">Cette fiche est vide.</span>}</div>
            {isLong && !expanded && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 rounded-b-xl bg-gradient-to-t from-surface to-transparent" />}
            {isLong && (
              <div className={cx('flex justify-center', expanded ? 'mt-3' : 'absolute inset-x-0 bottom-3')}>
                <Button variant="secondary" size="sm" onClick={() => setExpanded((e) => !e)}>
                  {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  {expanded ? 'Réduire' : 'Afficher toute la fiche'}
                </Button>
              </div>
            )}
          </div>
          {/* Proposed additions live under the fiche: appearing here shifts nothing above. */}
          <SupplementsSection chapitreId={chapitre.id} onGenerate={generate} />
        </aside>
      </div>
      )}

      <GeneratePanel open={generating} onClose={() => setGenerating(false)} chapitre={chapitre} cahierName={cahier.name} focus={focus} />
      <SupplementPanel open={completing} onClose={() => setCompleting(false)} cahier={cahier} chapitre={chapitre} />
      <MindmapPanel open={mapping} onClose={() => setMapping(false)} cahier={cahier} chapitre={chapitre} />
      <EditChapitreModal open={editing} onClose={() => setEditing(false)} chapitre={chapitre} />
    </div>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cx('inline-flex h-7 items-center gap-1 rounded-[var(--radius-sm)] border px-2.5 text-xs font-medium press ring-focus', active ? 'border-accent bg-accent-soft text-accent-text' : 'border-line text-muted hover:border-line-strong hover:bg-surface-2 hover:text-ink')}
    >
      {children}
    </button>
  )
}

function EditChapitreModal({ open, onClose, chapitre }: { open: boolean; onClose: () => void; chapitre: { id: string; title: string; content: string } }) {
  const [title, setTitle] = useState(chapitre.title)
  const [content, setContent] = useState(chapitre.content)

  useEffect(() => {
    if (open) {
      setTitle(chapitre.title)
      setContent(chapitre.content)
    }
  }, [open, chapitre])

  async function save() {
    await updateChapitre(chapitre.id, { title: title.trim() || 'Sans titre', content })
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Modifier la fiche"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={save}>Enregistrer</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Titre">{(id) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} />}</Field>
        <Field label="Contenu" hint="Texte brut ou markdown léger. C’est ce texte qui est envoyé à Claude.">
          {(id) => <Textarea id={id} value={content} onChange={(e) => setContent(e.target.value)} className="min-h-[50vh] font-mono text-xs leading-relaxed" />}
        </Field>
      </div>
    </Modal>
  )
}
