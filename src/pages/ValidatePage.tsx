import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Check, CheckCheck, ListChecks, Pencil, X } from 'lucide-react'
import type { Exercise } from '../types'
import { EXERCISE_LABELS_SINGULAR } from '../types'
import { db, deleteExercises, setExercisesStatus } from '../db'
import { exerciseKeyText, lintBatch } from '../lib/lint'
import { isEditableTarget } from '../components/train/shared'
import { ExerciseEditModal, ExerciseReadout, LintIssueList } from '../components/ExerciseEditModal'
import { Badge, Button, Card, EmptyState, IconButton, Kbd, Skeleton, cx, plural } from '../components/ui'

/**
 * Validation queue: the exercises Claude generated (status 'pending') are
 * reviewed one by one before entering the schedule. The current exercise is
 * always the first pending one; the live query shrinks the list as you go.
 */
export default function ValidatePage() {
  const { cahierId = '', chapitreId = '' } = useParams()
  const navigate = useNavigate()
  const reduced = useReducedMotion()

  // `?? null` distinguishes "not found" from "still loading".
  const chapitre = useLiveQuery(() => db.chapitres.get(chapitreId).then((c) => c ?? null), [chapitreId])
  const pending = useLiveQuery(
    () =>
      db.exercises
        .where('chapitreId')
        .equals(chapitreId)
        .filter((e) => e.status === 'pending')
        .sortBy('createdAt')
        // Exercises whose JSON needed a backslash repair come first: their formulas must be checked.
        .then((rows) => rows.sort((a, b) => Number(!!b.repaired) - Number(!!a.repaired) || a.createdAt - b.createdAt)),
    [chapitreId],
  )
  const active = useLiveQuery(
    () =>
      db.exercises
        .where('chapitreId')
        .equals(chapitreId)
        .filter((e) => e.status === 'active')
        .toArray(),
    [chapitreId],
  )
  const points = useLiveQuery(() => db.points.where('chapitreId').equals(chapitreId).sortBy('order'), [chapitreId])

  const [kept, setKept] = useState(0)
  const [ignored, setIgnored] = useState(0)
  const [editing, setEditing] = useState(false)
  // Id of the exercise whose keep/ignore write is in flight: a second keystroke
  // before the live query catches up must not act on the same exercise twice.
  const inFlight = useRef<string | null>(null)

  const handled = kept + ignored
  const total = handled + (pending?.length ?? 0)
  const progress = total ? (handled / total) * 100 : 0
  const current: Exercise | undefined = pending?.[0]
  const ficheHref = `/cahier/${cahierId}/fiche/${chapitreId}`

  const reports = useMemo(() => {
    if (!pending || !active) return []
    return lintBatch(
      pending.map((e) => e.data),
      { existingKeys: active.map((e) => exerciseKeyText(e.data)) },
    )
  }, [pending, active])
  const issues = useMemo(() => (current ? (reports[0]?.issues ?? []) : []), [reports, current])
  const hasWarn = issues.some((i) => i.severity === 'warn')

  const pointsById = useMemo(() => new Map((points ?? []).map((p) => [p.id, p])), [points])
  const point = current?.pointId ? pointsById.get(current.pointId) : undefined

  // ---- Actions ---------------------------------------------------------------

  const quit = useCallback(() => navigate(ficheHref), [navigate, ficheHref])

  const keep = useCallback(() => {
    if (!current || inFlight.current === current.id) return
    inFlight.current = current.id
    setKept((n) => n + 1)
    setExercisesStatus([current.id], 'active').catch((err: unknown) => console.error('ValidatePage: garder', err))
  }, [current])

  const ignore = useCallback(() => {
    if (!current || inFlight.current === current.id) return
    inFlight.current = current.id
    setIgnored((n) => n + 1)
    deleteExercises([current.id]).catch((err: unknown) => console.error('ValidatePage: ignorer', err))
  }, [current])

  const keepAll = useCallback(() => {
    if (!pending?.length) return
    const n = pending.length
    if (!window.confirm(n === 1 ? 'Garder le dernier exercice ?' : `Garder les ${n} exercices restants ?`)) return
    inFlight.current = pending[0].id
    setKept((k) => k + n)
    setExercisesStatus(
      pending.map((e) => e.id),
      'active',
    ).catch((err: unknown) => console.error('ValidatePage: tout garder', err))
  }, [pending])

  const edit = useCallback(() => {
    if (current) setEditing(true)
  }, [current])

  const closeEdit = useCallback(() => setEditing(false), [])

  // ---- Keyboard ------------------------------------------------------------------

  useEffect(() => {
    if (editing) return
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || isEditableTarget(e.target)) return
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        keepAll()
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return
      switch (e.key) {
        case 'Escape':
          e.preventDefault()
          quit()
          break
        case 'j':
        case 'J':
          e.preventDefault()
          keep()
          break
        case 'k':
        case 'K':
          e.preventDefault()
          ignore()
          break
        case 'e':
        case 'E':
          e.preventDefault()
          edit()
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editing, keep, ignore, keepAll, edit, quit])

  // ---- Render --------------------------------------------------------------------

  const loading = chapitre === undefined || pending === undefined || active === undefined || points === undefined

  if (chapitre === null) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-bg px-4">
        <div className="w-full max-w-md">
          <EmptyState
            title="Fiche introuvable"
            description="Elle a peut-être été supprimée."
            action={
              <Link to="/" className="text-sm font-medium text-accent">
                Retour au tableau de bord
              </Link>
            }
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-3 md:px-4">
        <IconButton label="Quitter" onClick={quit}>
          <X size={18} />
        </IconButton>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
          <span className="truncate text-sm font-medium text-ink">{chapitre?.title ?? ''}</span>
          <Badge tone="warn" className="shrink-0">
            À valider
          </Badge>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-sm text-muted tabular-nums">
          {!loading && total > 0 && (
            <span aria-label={`${handled} traités sur ${total}`}>
              {handled} / {total}
            </span>
          )}
        </div>
      </header>
      <div className="h-0.5 w-full bg-line" aria-hidden>
        <motion.div className="h-full bg-accent" initial={false} animate={{ width: `${progress}%` }} transition={{ duration: reduced ? 0 : 0.3, ease: 'easeOut' }} />
      </div>

      <main className="flex flex-1 flex-col items-center px-4 py-8 md:py-12">
        <div className="w-full max-w-2xl">
          {loading && (
            <Card className="p-6 md:p-8">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="mt-6 h-8 w-4/5" />
              <Skeleton className="mt-3 h-8 w-3/5" />
              <Skeleton className="mt-8 h-10 w-48" />
            </Card>
          )}

          {!loading && !current && (
            <EmptyState
              icon={<ListChecks size={24} />}
              title={handled === 0 ? 'Rien à valider' : 'Tout est validé'}
              description={
                handled === 0
                  ? 'Les exercices générés par Claude passent ici avant d’entrer dans le planning.'
                  : `${plural(kept, 'exercice gardé', 'exercices gardés')}${ignored ? `, ${plural(ignored, 'ignoré')}` : ''}.`
              }
              action={<Button onClick={quit}>Retour à la fiche</Button>}
            />
          )}

          {!loading && current && (
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={current.id}
                initial={reduced ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduced ? { opacity: 1, transition: { duration: 0 } } : { opacity: 0, y: -8 }}
                transition={{ duration: reduced ? 0 : 0.15, ease: 'easeOut' }}
              >
                <Card className={cx('flex flex-col gap-5 border-t-2 p-6 md:p-8', hasWarn ? 'border-t-warn' : 'border-t-line')}>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{EXERCISE_LABELS_SINGULAR[current.type]}</Badge>
                      {current.repaired && <Badge tone="warn">Antislashs réparés — vérifie les formules</Badge>}
                      <DifficultyDots level={current.difficulty} />
                      {current.tags.length > 0 && <span className="text-xs text-muted">{current.tags.join(' · ')}</span>}
                    </div>
                    <p className={cx('text-xs', point ? 'text-muted' : 'text-muted/70 italic')}>{point ? point.title : 'Sans point de cours'}</p>
                  </div>

                  <ExerciseReadout data={current.data} />

                  <div className="border-t border-line pt-4">
                    <LintIssueList issues={issues} />
                  </div>

                  <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
                    <Button onClick={keep}>
                      <Check size={16} />
                      Garder
                      <Kbd>J</Kbd>
                    </Button>
                    <Button variant="secondary" onClick={ignore}>
                      <X size={16} />
                      Ignorer
                      <Kbd>K</Kbd>
                    </Button>
                    <Button variant="secondary" onClick={edit}>
                      <Pencil size={16} />
                      Modifier
                      <Kbd>E</Kbd>
                    </Button>
                    <Button variant="ghost" className="ml-auto text-muted" onClick={keepAll}>
                      <CheckCheck size={16} />
                      Tout garder
                      <Kbd>Ctrl+A</Kbd>
                    </Button>
                  </div>
                </Card>
              </motion.div>
            </AnimatePresence>
          )}
        </div>
        {!loading && current && (
          <p className="mt-6 text-xs text-muted">
            <Kbd>Échap</Kbd> pour quitter, tout est enregistré au fur et à mesure
          </p>
        )}
      </main>

      {current && <ExerciseEditModal open={editing} onClose={closeEdit} exercise={current} points={points ?? []} />}
    </div>
  )
}

function DifficultyDots({ level }: { level: 1 | 2 | 3 }) {
  const label = ['facile', 'moyen', 'difficile'][level - 1]
  return (
    <span role="img" className="flex items-center gap-0.5" title={`Difficulté : ${label}`} aria-label={`Difficulté : ${label}`}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={cx('size-1.5 rounded-full', i <= level ? 'bg-muted' : 'bg-line')} />
      ))}
    </span>
  )
}
