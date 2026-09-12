import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Check, CircleCheck, CircleQuestionMark, CircleX, Layers, RotateCcw, Sparkles, Timer, Trophy, Undo2, X } from 'lucide-react'
import type { Cahier, Chapitre, Exam, Exercise, TrainMode } from '../types'
import { EXERCISE_LABELS_SINGULAR } from '../types'
import { db, markExamSessionDone, setExercisesStatus } from '../db'
import { formatDue } from '../lib/srs'
import {
  buildQueue,
  buryExercise,
  exerciseAnswerText,
  exercisePromptText,
  formatClock,
  intervalCap,
  intervalLabels,
  loadScopeExercises,
  loadSessionContext,
  nextDueInScope,
  parseSessionParams,
  persistAnswer,
  schedulingMode,
  scopeLabel,
  summarize,
  suspendExercise,
  undoAnswer,
  type AnswerRecord,
  type SessionContext,
  type SessionParams,
} from '../lib/session'
import { Badge, Button, Card, EmptyState, IconButton, Kbd, Modal, Skeleton, cx, plural } from '../components/ui'
import { ExercisePlayer } from '../components/train/ExercisePlayer'
import { isEditableTarget, type AnswerResult } from '../components/train/shared'
import { Markdown } from '../components/Markdown'
import { ExerciseEditModal } from '../components/ExerciseEditModal'
import { KeyboardHelp } from '../components/KeyboardHelp'
import { LeechRewritePanel } from '../components/LeechRewritePanel'
import { resetFieldContext, setFieldContext } from '../lib/fieldContext'
import { TiltCard } from '../components/TiltCard'

type Phase = { kind: 'loading' } | { kind: 'empty'; nextDue?: number } | { kind: 'running' } | { kind: 'done'; reason: 'completed' | 'timeout' }

const MODE_LABEL: Record<TrainMode, string> = { review: 'Révision', practice: 'Entraînement', chrono: 'Chrono', exam: 'Séance d’examen', cramming: 'Révision intensive' }
const HELP_MODE: Record<TrainMode, 'review' | 'practice' | 'chrono'> = { review: 'review', practice: 'practice', chrono: 'chrono', exam: 'review', cramming: 'practice' }
const LOW_TIME_MS = 10_000

export default function TrainPage() {
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const reduced = useReducedMotion()
  const from = search.get('from') || '/'
  const searchKey = search.toString()

  const [params, setParams] = useState<SessionParams | null>(null)
  const [ctx, setCtx] = useState<SessionContext | null>(null)
  const [cahier, setCahier] = useState<Cahier | undefined>()
  const [chapitre, setChapitre] = useState<Chapitre | undefined>()
  const [exam, setExam] = useState<Exam | undefined>()
  const [queue, setQueue] = useState<Exercise[]>([])

  // Calm background during a session, and never a formula from the fiches being reviewed.
  useEffect(() => {
    setFieldContext({ calm: true, cahierId: cahier?.id, cahierColor: cahier?.color, excludeChapitreIds: [...new Set(queue.map((e) => e.chapitreId))] })
  }, [queue, cahier?.id, cahier?.color])
  useEffect(() => () => resetFieldContext(), [])
  const [index, setIndex] = useState(0)
  const [records, setRecords] = useState<AnswerRecord[]>([])
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const [deadline, setDeadline] = useState<number | null>(null)
  const [remaining, setRemaining] = useState(0)
  const [buried, setBuried] = useState(0)
  const [reprioritised, setReprioritised] = useState(0)
  const [nextDue, setNextDue] = useState<number | undefined>()
  const [editing, setEditing] = useState(false)
  const [help, setHelp] = useState(false)
  const [leech, setLeech] = useState<Exercise | null>(null)
  const [rewriting, setRewriting] = useState(false)

  const retried = useRef(new Set<string>())
  const shownAt = useRef(0)
  const startedFor = useRef<string | null>(null)

  // ---- Session lifecycle ---------------------------------------------------

  const start = useCallback((p: SessionParams, exercises: Exercise[], context: SessionContext) => {
    const now = Date.now()
    const q = buildQueue(exercises, p, context, now)
    retried.current = new Set()
    setQueue(q)
    setIndex(0)
    setRecords([])
    setBuried(0)
    setReprioritised(0)
    setNextDue(undefined)
    if (q.length === 0) {
      const future = exercises.map((e) => e.fsrs.due).filter((d) => d > now)
      setDeadline(null)
      setPhase({ kind: 'empty', nextDue: future.length ? Math.min(...future) : undefined })
      return
    }
    if (p.mode === 'chrono') {
      const dl = now + (p.seconds ?? 120) * 1000
      setDeadline(dl)
      setRemaining(dl - now)
    } else {
      setDeadline(null)
    }
    shownAt.current = now
    setPhase({ kind: 'running' })
  }, [])

  useEffect(() => {
    // StrictMode runs effects twice in dev: only build the session once per URL.
    if (startedFor.current === searchKey) return
    startedFor.current = searchKey
    setPhase({ kind: 'loading' })
    ;(async () => {
      const context = await loadSessionContext()
      const p = parseSessionParams(new URLSearchParams(searchKey), context.settings)
      const [exercises, ch] = await Promise.all([loadScopeExercises(p, context), p.scope === 'chapitre' && p.id ? db.chapitres.get(p.id) : Promise.resolve(undefined)])
      const examEntry = p.examId ? context.exams.get(p.examId) : undefined
      const c = examEntry?.cahier ?? (p.scope === 'cahier' && p.id ? context.cahiers.get(p.id) : ch ? context.cahiers.get(ch.cahierId) : undefined)
      setParams(p)
      setCtx(context)
      setCahier(c)
      setChapitre(ch)
      setExam(examEntry?.exam)
      start(p, exercises, context)
    })().catch((err: unknown) => {
      console.error('TrainPage: chargement impossible', err)
      setPhase({ kind: 'empty' })
    })
  }, [searchKey, start])

  const restart = useCallback(() => {
    if (!params) return
    setPhase({ kind: 'loading' })
    loadSessionContext()
      .then(async (context) => [await loadScopeExercises(params, context), context] as const)
      .then(([exercises, context]) => {
        setCtx(context)
        start(params, exercises, context)
      })
      .catch((err: unknown) => {
        console.error('TrainPage: rechargement impossible', err)
        setPhase({ kind: 'empty' })
      })
  }, [params, start])

  // The summary needs the next due date once everything is written; a completed
  // exam session is ticked in the plan.
  useEffect(() => {
    if (phase.kind !== 'done' || !params) return
    nextDueInScope(params, ctx ?? undefined)
      .then(setNextDue)
      .catch(() => setNextDue(undefined))
    if (phase.reason === 'completed' && params.mode === 'exam' && params.examId && params.sessionIndex !== undefined && cahier) {
      markExamSessionDone(cahier.id, params.examId, params.sessionIndex).catch((err: unknown) => console.error('markExamSessionDone', err))
    }
  }, [phase, params, ctx, cahier])

  // ---- Chrono ----------------------------------------------------------------

  useEffect(() => {
    if (phase.kind !== 'running' || deadline === null) return
    const tick = () => {
      const r = deadline - Date.now()
      setRemaining(Math.max(0, r))
      if (r <= 0) setPhase({ kind: 'done', reason: 'timeout' })
    }
    tick()
    const id = window.setInterval(tick, 250)
    return () => window.clearInterval(id)
  }, [phase.kind, deadline])

  // ---- Answering ---------------------------------------------------------------

  const current = phase.kind === 'running' ? queue[index] : undefined
  const currentKey = current ? `${index}-${current.id}` : ''

  useEffect(() => {
    shownAt.current = Date.now()
  }, [currentKey])

  const advance = useCallback(
    (nextQueue: Exercise[], nextIndex: number) => {
      if (nextIndex >= nextQueue.length) setPhase({ kind: 'done', reason: 'completed' })
      else setIndex(nextIndex)
    },
    [],
  )

  const handleAnswer = useCallback(
    ({ correct, grade, missedPointIds, confidence }: AnswerResult) => {
      if (!params || !ctx || phase.kind !== 'running') return
      const exercise = queue[index]
      if (!exercise) return
      const now = Date.now()
      const durationMs = now - shownAt.current

      // Exam sessions re-queue every failure until one correct recall (successive relearning);
      // other modes re-queue an "Encore" once; chrono never.
      const requeued = params.mode === 'exam' ? !correct : params.mode !== 'chrono' && grade === 'again' && !retried.current.has(exercise.id)
      if (requeued) retried.current.add(exercise.id)

      // The write is async; the queue advances immediately. The re-queued copy
      // gets the new FSRS state once the write resolves (it is at the end anyway).
      const pending = persistAnswer(exercise, grade, correct, params.mode, durationMs, ctx, now, { missedPointIds, confidence })
      const placeholderLogId = `pending-${exercise.id}-${now}`
      setRecords((prev) => [...prev, { exercise, correct, grade, durationMs, confidence, logId: placeholderLogId, requeued }])
      pending
        .then((res) => {
          setRecords((prev) => prev.map((r) => (r.logId === placeholderLogId ? { ...r, logId: res.log.id } : r)))
          if (requeued && res.card) setQueue((q) => q.map((e, i) => (i >= index + 1 && e.id === exercise.id ? { ...e, fsrs: res.card! } : e)))
          if (res.buriedIds.length) {
            const gone = new Set(res.buriedIds)
            setBuried((n) => n + res.buriedIds.length)
            setQueue((q) => q.filter((e, i) => i <= index || !gone.has(e.id)))
          }
          if (res.reprioritised) setReprioritised((n) => n + res.reprioritised)
          if (res.becameLeech) setLeech(exercise)
        })
        .catch((err: unknown) => console.error('persistAnswer', err))

      let nextQueue = queue
      if (requeued) {
        nextQueue = [...queue, exercise]
        setQueue(nextQueue)
      }
      advance(nextQueue, index + 1)
    },
    [params, ctx, phase.kind, queue, index, advance],
  )

  // ---- Undo, skip, bury, suspend, edit -----------------------------------------

  const canUndo = phase.kind === 'running' && records.length > 0 && !records[records.length - 1].logId.startsWith('pending-')

  const undo = useCallback(() => {
    if (!canUndo) return
    const last = records[records.length - 1]
    undoAnswer(last.logId).catch((err: unknown) => console.error('undoAnswer', err))
    setRecords((prev) => prev.slice(0, -1))
    if (last.requeued) {
      retried.current.delete(last.exercise.id)
      setQueue((q) => q.slice(0, -1))
    }
    setIndex((i) => Math.max(0, i - 1))
    shownAt.current = Date.now()
  }, [canUndo, records])

  /** Removes the current exercise from the queue without recording an answer. */
  const skipCurrent = useCallback(() => {
    if (!current) return
    const nextQueue = queue.filter((_, i) => i !== index)
    setQueue(nextQueue)
    advance(nextQueue, index)
  }, [current, queue, index, advance])

  const bury = useCallback(() => {
    if (!current || !params || !schedulingMode(params.mode)) return
    buryExercise(current).catch((err: unknown) => console.error('buryExercise', err))
    setBuried((n) => n + 1)
    skipCurrent()
  }, [current, params?.mode, skipCurrent])

  const suspend = useCallback(() => {
    if (!current) return
    if (!window.confirm('Suspendre cet exercice ? Il ne sera plus proposé jusqu’à réactivation depuis la fiche.')) return
    suspendExercise(current).catch((err: unknown) => console.error('suspendExercise', err))
    skipCurrent()
  }, [current, skipCurrent])

  /** After an edit, the queue holds the fresh copy of the exercise. */
  const refreshCurrent = useCallback(async () => {
    if (!current) return
    const fresh = await db.exercises.get(current.id)
    if (fresh) setQueue((q) => q.map((e) => (e.id === fresh.id ? fresh : e)))
  }, [current])

  // ---- Quit ------------------------------------------------------------------

  const quit = useCallback(() => {
    if (phase.kind === 'running' && records.length > 0) {
      const ok = window.confirm('Quitter la session ? Les réponses déjà données sont enregistrées.')
      if (!ok) return
    }
    navigate(from)
  }, [phase.kind, records.length, navigate, from])

  const modalOpen = editing || help || leech !== null || rewriting

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (modalOpen) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        undo()
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'Escape') {
        e.preventDefault()
        quit()
        return
      }
      if (isEditableTarget(e.target)) return
      if (e.key === '?') {
        e.preventDefault()
        setHelp(true)
      } else if (phase.kind === 'running' && e.key.toLowerCase() === 'e') {
        e.preventDefault()
        setEditing(true)
      } else if (phase.kind === 'running' && e.key === '-') {
        e.preventDefault()
        bury()
      } else if (phase.kind === 'running' && e.key === '@') {
        e.preventDefault()
        suspend()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [quit, undo, bury, suspend, modalOpen, phase.kind])

  // ---- Derived ---------------------------------------------------------------

  const label = params ? scopeLabel(params, cahier, chapitre, exam) : ''
  const isChrono = params?.mode === 'chrono'
  const lowTime = isChrono && remaining <= LOW_TIME_MS
  const progress = queue.length ? Math.min(100, (records.length / queue.length) * 100) : 0
  const summary = useMemo(() => summarize(records), [records])
  const intervals = useMemo(() => (ctx && current && params && schedulingMode(params.mode) ? intervalLabels(ctx, current, current.fsrs) : undefined), [ctx, current, params])
  const cap = useMemo(() => (ctx && current && params && schedulingMode(params.mode) ? intervalCap(ctx, current, current.fsrs) : undefined), [ctx, current, params])

  // ---- Render ----------------------------------------------------------------

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="glass sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-line px-3 md:px-4">
        <IconButton label="Quitter" onClick={quit}>
          <X size={18} />
        </IconButton>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
          <span className="truncate text-sm font-medium text-ink">{label}</span>
          {params && (
            <Badge tone="accent" className="shrink-0">
              {MODE_LABEL[params.mode]}
            </Badge>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2 text-sm text-muted tabular-nums">
          {phase.kind === 'running' && (
            <>
              <IconButton label="Annuler la dernière réponse (Ctrl+Z)" onClick={undo} disabled={!canUndo} title="Annuler la dernière réponse (Ctrl+Z)">
                <Undo2 size={18} />
              </IconButton>
              <IconButton label="Raccourcis clavier (?)" onClick={() => setHelp(true)} title="Raccourcis clavier (?)">
                <CircleQuestionMark size={18} />
              </IconButton>
              <span aria-label={`Question ${index + 1} sur ${queue.length}`}>
                {index + 1} / {queue.length}
              </span>
            </>
          )}
          {isChrono && (phase.kind === 'running' || phase.kind === 'done') && (
            <motion.span
              role="timer"
              aria-live={lowTime ? 'assertive' : 'off'}
              className={cx('flex items-center gap-1.5 font-mono text-lg', lowTime ? 'text-bad' : 'text-ink')}
              animate={lowTime && !reduced && phase.kind === 'running' ? { scale: [1, 1.08, 1] } : { scale: 1 }}
              transition={lowTime ? { duration: 1, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.15 }}
            >
              <Timer size={18} />
              {formatClock(remaining)}
            </motion.span>
          )}
        </div>
      </header>
      <div className="sticky top-14 z-30 h-0.5 w-full bg-line/60" aria-hidden>
        <motion.div className="h-full bg-accent" initial={false} animate={{ width: `${progress}%` }} transition={{ duration: reduced ? 0 : 0.3, ease: 'easeOut' }} />
      </div>

      <main className="flex flex-1 flex-col items-center px-4 py-8 md:py-12">
        <div className="w-full max-w-[42rem]">
          {phase.kind === 'loading' && (
            <Card className="p-6 md:p-8">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="mt-6 h-8 w-4/5" />
              <Skeleton className="mt-3 h-8 w-3/5" />
              <Skeleton className="mt-8 h-12 w-48" />
            </Card>
          )}

          {phase.kind === 'empty' && (
            <EmptyState
              icon={params?.mode === 'review' ? <Sparkles size={24} /> : <Layers size={24} />}
              title={params?.mode === 'review' ? 'Rien à réviser pour le moment' : params?.scope === 'exam' ? 'Aucun exercice actif dans les fiches de cet examen' : 'Aucun exercice dans cette sélection'}
              description={
                params?.mode === 'review'
                  ? phase.nextDue
                    ? `Prochain exercice à revoir ${formatDue(phase.nextDue)}.`
                    : 'Ajoutez des exercices pour commencer à réviser.'
                  : 'Générez des exercices depuis une fiche pour vous entraîner.'
              }
              action={<Button onClick={() => navigate(from)}>Retour</Button>}
            />
          )}

          {phase.kind === 'running' && current && (
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`${currentKey}-${current.updatedAt}`}
                initial={reduced ? false : { opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduced ? { opacity: 1, transition: { duration: 0 } } : { opacity: 0, x: -16 }}
                transition={{ duration: reduced ? 0 : 0.15, ease: [0.2, 0.8, 0.2, 1] }}
              >
                <TiltCard className="relative">
                  <Card elevation={3} className="relative overflow-hidden p-6 md:p-8">
                    <ExercisePlayer exercise={current} chrono={isChrono} deferFeedback={isChrono} askConfidence={!!ctx?.settings.askConfidence && !isChrono} intervals={intervals} intervalCap={cap} onAnswer={handleAnswer} />
                  </Card>
                </TiltCard>
                <p className="mt-3 hidden text-center text-xs text-muted sm:block">
                  <Kbd>E</Kbd> modifier · {params && schedulingMode(params.mode) && <><Kbd>-</Kbd> demain · </>}<Kbd>@</Kbd> suspendre · <Kbd>?</Kbd> aide
                </p>
              </motion.div>
            </AnimatePresence>
          )}

          {phase.kind === 'done' && params && (
            <Results
              params={params}
              summary={summary}
              records={records}
              answered={records.length}
              queued={queue.length}
              timedOut={phase.reason === 'timeout'}
              buried={buried}
              reprioritised={reprioritised}
              nextDue={nextDue}
              onRestart={restart}
              onFinish={() => navigate(from)}
            />
          )}
        </div>
      </main>

      {current && (
        <ExerciseEditModal
          open={editing}
          onClose={() => {
            setEditing(false)
            refreshCurrent().catch(() => undefined)
          }}
          exercise={current}
          points={[]}
        />
      )}
      {params && <KeyboardHelp open={help} onClose={() => setHelp(false)} mode={HELP_MODE[params.mode]} />}

      <Modal open={leech !== null && !rewriting} onClose={() => setLeech(null)} title="Cet exercice est probablement mal formulé">
        {leech && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted">
              Raté {leech.fsrs.lapses} fois : c’est un « leech ». Il est retiré du planning tant qu’il n’est pas réécrit ou réactivé. Le plus souvent, la question est trop large, ambiguë ou porte sur plusieurs faits : Claude peut la découper en 1 à 3 exercices atomiques.
            </p>
            <div className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm">
              <Markdown inline text={exercisePromptText(leech)} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setRewriting(true)}>
                <Sparkles size={16} />
                Réécrire avec Claude
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setExercisesStatus([leech.id], 'suspended').catch(() => undefined)
                  setLeech(null)
                }}
              >
                Suspendre
              </Button>
              <Button variant="ghost" onClick={() => setLeech(null)}>
                Continuer
              </Button>
            </div>
          </div>
        )}
      </Modal>
      {leech && chapitre && cahier && (
        <LeechRewritePanel
          open={rewriting}
          onClose={() => {
            setRewriting(false)
            setLeech(null)
          }}
          exercise={leech}
          chapitre={chapitre}
          cahierName={cahier.name}
        />
      )}
      {leech && (!chapitre || !cahier) && rewriting && <LeechLoader exercise={leech} onReady={() => undefined} onClose={() => setRewriting(false)} />}
    </div>
  )
}

/** In cahier- or all-scope sessions the chapitre is not preloaded: fetch it for the rewrite panel. */
function LeechLoader({ exercise, onClose }: { exercise: Exercise; onReady: () => void; onClose: () => void }) {
  const [data, setData] = useState<{ chapitre: Chapitre; cahier: Cahier } | null>(null)
  useEffect(() => {
    Promise.all([db.chapitres.get(exercise.chapitreId), db.cahiers.get(exercise.cahierId)]).then(([ch, c]) => {
      if (ch && c) setData({ chapitre: ch, cahier: c })
    })
  }, [exercise.chapitreId, exercise.cahierId])
  if (!data) return null
  return <LeechRewritePanel open onClose={onClose} exercise={exercise} chapitre={data.chapitre} cahierName={data.cahier.name} />
}

// ---- Results -----------------------------------------------------------------

function Results({
  params,
  summary,
  records,
  answered,
  queued,
  timedOut,
  buried,
  reprioritised,
  nextDue,
  onRestart,
  onFinish,
}: {
  params: SessionParams
  summary: ReturnType<typeof summarize>
  records: AnswerRecord[]
  answered: number
  queued: number
  timedOut: boolean
  buried: number
  reprioritised: number
  nextDue?: number
  onRestart: () => void
  onFinish: () => void
}) {
  const reduced = useReducedMotion()
  const isChrono = params.mode === 'chrono'

  // An exercise retried and missed twice appears once.
  const missed = useMemo(() => {
    const seen = new Set<string>()
    return summary.missed.filter((r) => {
      if (seen.has(r.exercise.id)) return false
      seen.add(r.exercise.id)
      return true
    })
  }, [summary.missed])

  const notes: string[] = []
  if (params.mode === 'exam') notes.push(params.sessionIndex !== undefined ? `Séance ${params.sessionIndex + 1} du plan de réapprentissage validée : chaque exercice a été rappelé correctement une fois.` : 'Chaque exercice a été rappelé correctement une fois.')
  if (params.mode === 'cramming') notes.push('Révision intensive : le planning n’a pas été modifié, tes échéances restent celles du planificateur.')
  if (params.mode === 'practice' || params.mode === 'chrono') notes.push('Cette session n’a pas modifié le planning.')
  if (summary.sure.answered > 0) notes.push(`Calibration : « sûr » ${summary.sure.answered} fois, juste ${Math.round((summary.sure.correct / summary.sure.answered) * 100)} % du temps.`)
  if (summary.confidentErrors.length > 0) notes.push(`${plural(summary.confidentErrors.length, 'erreur commise avec confiance', 'erreurs commises avec confiance')} : ces exercices reviendront à J+1 et J+7.`)
  if (buried > 0) notes.push(`${plural(buried, 'exercice reporté', 'exercices reportés')} à demain (frères d’un exercice déjà vu, ou enterrés).`)
  if (reprioritised > 0) notes.push(`${plural(reprioritised, 'exercice relancé', 'exercices relancés')} en priorité après le rappel libre.`)
  if (schedulingMode(params.mode) && nextDue) notes.push(`Prochain rappel : ${formatDue(nextDue)}.`)

  return (
    <motion.div initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : 0.25, ease: 'easeOut' }} className="flex flex-col gap-4">
      <Card className="flex flex-col items-center gap-6 p-6 text-center md:p-8">
        <span className="flex size-12 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <Trophy size={24} />
        </span>
        <div>
          <p className="text-sm text-muted">{isChrono && timedOut ? 'Temps écoulé' : 'Session terminée'}</p>
          <p className="mt-1 text-5xl font-semibold tracking-tight tabular-nums md:text-6xl">{summary.accuracy} %</p>
          <p className="mt-2 text-sm text-muted">
            {summary.correct} / {summary.total} {summary.total === 1 ? 'correcte' : 'correctes'}
          </p>
        </div>

        <dl className="grid w-full grid-cols-2 gap-3 sm:max-w-sm">
          <div className="rounded-lg bg-surface-2 px-4 py-3">
            <dt className="text-xs text-muted">Temps total</dt>
            <dd className="mt-0.5 font-mono text-lg tabular-nums">{formatClock(summary.totalMs)}</dd>
          </div>
          <div className="rounded-lg bg-surface-2 px-4 py-3">
            <dt className="text-xs text-muted">{isChrono ? 'Répondues' : 'Exercices'}</dt>
            <dd className="mt-0.5 text-lg tabular-nums">{isChrono ? `${answered} sur ${queued}` : plural(summary.total, 'réponse')}</dd>
          </div>
        </dl>

        {notes.length > 0 && (
          <ul className="flex flex-col gap-0.5 text-sm text-muted">
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button variant="secondary" size="lg" onClick={onRestart}>
            <RotateCcw size={18} />
            Recommencer
          </Button>
          <Button size="lg" autoFocus onClick={onFinish}>
            <Check size={18} />
            Terminer
          </Button>
        </div>
        <p className="text-xs text-muted">
          <Kbd>Échap</Kbd> pour quitter
        </p>
      </Card>

      {isChrono && records.length > 0 && (
        <Card className="p-6 md:p-8">
          <h2 className="text-base font-semibold">Correction</h2>
          <p className="mt-1 text-sm text-muted">Le feedback différé retient mieux qu’un feedback immédiat (0,70 contre 0,60 à une semaine) : voici la correction de chaque question.</p>
          <ol className="mt-4 flex flex-col divide-y divide-line">
            {records.map((r, i) => {
              const d = r.exercise.data
              const explanation = d.type === 'mcq' || d.type === 'truefalse' ? d.explanation : undefined
              const corrected = d.type === 'truefalse' && !d.answer ? d.correctedStatement : undefined
              return (
                <li key={`${r.exercise.id}-${i}`} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                  <span className={cx('mt-0.5 shrink-0', r.correct ? 'text-ok' : 'text-bad')} aria-label={r.correct ? 'Juste' : 'Faux'}>
                    {r.correct ? <CircleCheck size={20} /> : <CircleX size={20} />}
                  </span>
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="flex items-start gap-2">
                      <Badge tone="neutral" className="mt-0.5 shrink-0">
                        {EXERCISE_LABELS_SINGULAR[r.exercise.type]}
                      </Badge>
                      <p className="min-w-0 flex-1 text-ink">
                        <Markdown inline text={exercisePromptText(r.exercise)} />
                      </p>
                    </div>
                    <p className={cx('mt-1 pl-1', r.correct ? 'text-muted' : 'text-ok')}>
                      <span className="text-muted">Réponse : </span>
                      <Markdown inline text={exerciseAnswerText(r.exercise)} />
                    </p>
                    {corrected && (
                      <p className="mt-0.5 pl-1 text-muted">
                        Énoncé corrigé : <Markdown inline text={corrected} />
                      </p>
                    )}
                    {explanation && (
                      <p className="mt-0.5 pl-1 text-muted">
                        <Markdown inline text={explanation} />
                      </p>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        </Card>
      )}

      {!isChrono && missed.length > 0 && (
        <Card className="p-6 md:p-8">
          <h2 className="text-base font-semibold">À retravailler</h2>
          <p className="mt-1 text-sm text-muted">{plural(missed.length, 'exercice manqué', 'exercices manqués')}</p>
          <ul className="mt-4 flex flex-col divide-y divide-line">
            {missed.map((r) => (
              <li key={r.exercise.id} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
                <div className="flex items-start gap-2">
                  <Badge tone="neutral" className="mt-0.5 shrink-0">
                    {EXERCISE_LABELS_SINGULAR[r.exercise.type]}
                  </Badge>
                  <p className="min-w-0 flex-1 truncate text-sm text-ink" title={exercisePromptText(r.exercise)}>
                    <Markdown inline text={exercisePromptText(r.exercise)} />
                  </p>
                </div>
                <p className="truncate pl-1 text-sm text-ok" title={exerciseAnswerText(r.exercise)}>
                  <Markdown inline text={exerciseAnswerText(r.exercise)} />
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </motion.div>
  )
}
