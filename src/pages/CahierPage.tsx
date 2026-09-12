import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowRight, BookOpenText, DotsThree, FileText, Lightning, Pencil, Plus, Sparkle, Trash, TreeStructure } from '@phosphor-icons/react'
import { db, deleteCahier } from '../db'
import { isDueExercise } from '../lib/srs'
import { formatDate } from '../lib/format'
import type { ChapitreSource } from '../types'
import { Badge, Button, ColorDot, EmptyState, IconButton, PageHeader, Skeleton, plural } from '../components/ui'
import { NewCahierModal } from '../components/NewCahierModal'
import { ImportFicheDialog } from '../components/import/ImportFicheDialog'
import { ProgrammeModal } from '../components/ProgrammeModal'
import { MindmapPanel } from '../components/MindmapPanel'
import { CreateFichePanel } from '../components/CreateFichePanel'
import { WorkloadModal, type WorkloadKind } from '../components/WorkloadModal'
import { ExamsSection } from '../components/ExamsSection'

const SOURCE_LABEL: Record<ChapitreSource, string> = { paste: 'Texte', docx: 'Word', pdf: 'PDF', onenote: 'OneNote', claude: 'Rédigée par Claude' }

export default function CahierPage() {
  const { cahierId = '' } = useParams()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [programmeOpen, setProgrammeOpen] = useState(false)
  const [writing, setWriting] = useState(false)
  const [workload, setWorkload] = useState<WorkloadKind | null>(null)
  const [mapping, setMapping] = useState(false)
  const [menu, setMenu] = useState(false)

  // `?? null` distinguishes "not found" from "still loading" (both would be undefined otherwise).
  const cahier = useLiveQuery(() => db.cahiers.get(cahierId).then((c) => c ?? null), [cahierId])
  const chapitres = useLiveQuery(() => db.chapitres.where('cahierId').equals(cahierId).reverse().sortBy('updatedAt'), [cahierId])
  const exercises = useLiveQuery(() => db.exercises.where('cahierId').equals(cahierId).toArray(), [cahierId])
  const mindmap = useLiveQuery(() => db.mindmaps.where('cahierId').equals(cahierId).filter((m) => !m.chapitreId).first(), [cahierId])

  const stats = useMemo(() => {
    const now = Date.now()
    const perChapitre = new Map<string, { total: number; due: number }>()
    let due = 0
    exercises?.forEach((e) => {
      const s = perChapitre.get(e.chapitreId) ?? { total: 0, due: 0 }
      s.total++
      if (isDueExercise(e, now)) {
        s.due++
        due++
      }
      perChapitre.set(e.chapitreId, s)
    })
    return { perChapitre, due, total: exercises?.length ?? 0 }
  }, [exercises])

  if (cahier === undefined) return <Skeleton className="h-40" />
  if (cahier === null) {
    return <EmptyState title="Cahier introuvable" description="Il a peut-être été supprimé." action={<Link to="/" className="text-sm font-medium text-accent">Retour au tableau de bord</Link>} />
  }

  const from = `/cahier/${cahier.id}`

  async function remove() {
    if (!cahier) return
    if (!window.confirm(`Supprimer le cahier « ${cahier.name} », ses fiches et tous ses exercices ?`)) return
    await deleteCahier(cahier.id)
    navigate('/')
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={
          <Link to="/" className="hover:text-ink">
            Tableau de bord
          </Link>
        }
        title={
          <span className="flex items-center gap-3">
            <ColorDot color={cahier.color} className="size-3.5" />
            {cahier.name}
          </span>
        }
        subtitle={`${plural(chapitres?.length ?? 0, 'fiche')} · ${plural(stats.total, 'exercice')}${stats.due ? ` · ${stats.due} à revoir` : ''}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setImporting(true)}>
              <Plus size={16} weight="bold" />
              Ajouter des fiches
            </Button>
            <Button variant="secondary" onClick={() => setWriting(true)} title="Claude rédige une fiche à partir de ton cours et de tes notes">
              <Sparkle size={16} weight="fill" />
              Rédiger avec Claude
            </Button>
            <Button disabled={!stats.due} onClick={() => navigate(`/train?scope=cahier&id=${cahier.id}&mode=review&from=${from}`)}>
              Réviser{stats.due ? ` (${stats.due})` : ''}
            </Button>
            <Button variant="secondary" disabled={!stats.total} onClick={() => navigate(`/train?scope=cahier&id=${cahier.id}&mode=practice&from=${from}`)}>
              S’entraîner
            </Button>
            <Button variant="secondary" disabled={!stats.total} onClick={() => navigate(`/train?scope=cahier&id=${cahier.id}&mode=chrono&from=${from}`)} title="Mode chrono">
              <Lightning size={16} weight="fill" />
              Chrono
            </Button>
            <div className="relative">
              <IconButton label="Plus d’actions" onClick={() => setMenu((m) => !m)}>
                <DotsThree size={20} weight="bold" />
              </IconButton>
              {menu && (
                <div className="absolute right-0 z-10 mt-1 w-56 rounded-lg border border-line bg-surface p-1 shadow-pop" onMouseLeave={() => setMenu(false)}>
                  <button type="button" className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm hover:bg-surface-2" onClick={() => { setMenu(false); setEditing(true) }}>
                    <Pencil size={16} /> Modifier
                  </button>
                  <button type="button" className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm hover:bg-surface-2" onClick={() => { setMenu(false); setWorkload('postpone') }}>
                    <ArrowRight size={16} /> Reporter des révisions…
                  </button>
                  <button type="button" className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm hover:bg-surface-2" onClick={() => { setMenu(false); setWorkload('advance') }}>
                    <ArrowRight size={16} className="rotate-180" /> Avancer des révisions…
                  </button>
                  <button type="button" className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm text-bad hover:bg-bad-soft" onClick={() => { setMenu(false); remove() }}>
                    <Trash size={16} /> Supprimer
                  </button>
                </div>
              )}
            </div>
          </>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-start gap-3 rounded-xl border border-line bg-surface p-4 shadow-card">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">
            <BookOpenText size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-medium">Programme de l’année</h3>
            <p className="mt-0.5 text-sm text-muted">
              {cahier.programme?.trim() ? `${cahier.programme.length.toLocaleString('fr-FR')} caractères (BO, plan de cours). Sert à compléter les fiches.` : 'Colle l’extrait du BO et ton plan de cours : Claude s’en sert pour repérer ce qui manque dans tes fiches.'}
            </p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => setProgrammeOpen(true)}>
              {cahier.programme?.trim() ? 'Modifier le programme' : 'Renseigner le programme'}
            </Button>
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-xl border border-line bg-surface p-4 shadow-card">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">
            <TreeStructure size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-medium">Carte mentale du cahier</h3>
            <p className="mt-0.5 text-sm text-muted">{mindmap ? `Synthèse de la matière, mise à jour ${formatDate(mindmap.updatedAt)}.` : 'Une vue d’ensemble de toute la matière, une branche par fiche.'}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {mindmap && (
                <Button size="sm" onClick={() => navigate(`/carte/${mindmap.id}`)}>
                  Voir la carte
                </Button>
              )}
              <Button variant="secondary" size="sm" disabled={!chapitres?.length} onClick={() => setMapping(true)}>
                {mindmap ? 'Régénérer' : 'Générer avec Claude'}
              </Button>
            </div>
          </div>
        </div>
      </section>

      <ExamsSection cahier={cahier} chapitreCount={chapitres?.length ?? 0} />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Fiches</h2>
        {!chapitres ? (
          <Skeleton className="h-32" />
        ) : chapitres.length === 0 ? (
          <EmptyState
            icon={<FileText size={24} />}
            title="Aucune fiche dans ce cahier"
            description="Colle le texte d’une page OneNote, importe un export Word / PDF, connecte ton compte Microsoft — ou laisse Claude rédiger une fiche à partir de ton cours et de tes notes."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => setImporting(true)}>
                  <Plus size={16} weight="bold" />
                  Ajouter des fiches
                </Button>
                <Button variant="secondary" onClick={() => setWriting(true)}>
                  <Sparkle size={16} weight="fill" />
                  Rédiger avec Claude
                </Button>
              </div>
            }
          />
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface shadow-card">
            {chapitres.map((ch) => {
              const s = stats.perChapitre.get(ch.id) ?? { total: 0, due: 0 }
              return (
                <li key={ch.id}>
                  <Link to={`/cahier/${cahier.id}/fiche/${ch.id}`} className="group flex items-center gap-4 px-4 py-3.5 hover:bg-surface-2 ring-focus">
                    <FileText size={20} className="shrink-0 text-muted" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{ch.title}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                        <span>{SOURCE_LABEL[ch.source]}</span>
                        <span aria-hidden>·</span>
                        <span>modifiée {formatDate(ch.updatedAt)}</span>
                        <span aria-hidden>·</span>
                        <span>{s.total ? plural(s.total, 'exercice') : 'pas d’exercice'}</span>
                      </div>
                    </div>
                    {s.due > 0 && <Badge tone="accent">{s.due} à revoir</Badge>}
                    <ArrowRight size={16} className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <NewCahierModal open={editing} onClose={() => setEditing(false)} cahier={cahier} />
      <ProgrammeModal open={programmeOpen} onClose={() => setProgrammeOpen(false)} cahier={cahier} />
      <MindmapPanel open={mapping} onClose={() => setMapping(false)} cahier={cahier} />
      <CreateFichePanel open={writing} onClose={() => setWriting(false)} cahier={cahier} />
      <WorkloadModal open={workload !== null} onClose={() => setWorkload(null)} cahier={cahier} kind={workload ?? 'postpone'} />
      <ImportFicheDialog cahierId={cahier.id} open={importing} onClose={() => setImporting(false)} onImported={(ids) => ids.length === 1 && navigate(`/cahier/${cahier.id}/fiche/${ids[0]}`)} />
    </div>
  )
}
