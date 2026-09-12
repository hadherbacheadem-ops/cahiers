import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowCounterClockwise, ArrowUUpLeft, Check, Sparkle, Stack, Timer, Trophy, X } from '@phosphor-icons/react'
import type { Cahier, Chapitre, Exercise, TrainMode } from '../types'
import { EXERCISE_LABELS_SINGULAR } from '../types'
import { db } from '../db'
import { formatDue } from '../lib/srs'
import {
  buildQueue,
  exerciseAnswerText,
  exercisePromptText,
  formatClock,
  intervalLabels,
  loadScopeExercises,
  loadSessionContext,
  parseSessionParams,
  persistAnswer,
  scopeLabel,
  summarize,
  undoAnswer,
  type AnswerRecord,
  type SessionContext,
  type SessionParams,
} from '../lib/session'
import { Badge, Button, Card, EmptyState, IconButton, Kbd, Skeleton, cx, plural } from '../components/ui'
import { ExercisePlayer } from '../components/train/ExercisePlayer'
import { Markdown } from '../components/Markdown'
import type { AnswerResult } from '../components/train/shared'

type Phase = { kind: 'loading' } | { kind: 'empty'; nextDue?: number } | { kind: 'running' } | { kind: 'done'; reason: 'completed' | 'timeout' }

const MODE_LABEL: Record<TrainMode, string> = { review: 'Révision', practice: 'Entraînement', chrono: 'Chrono' }
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
  const [queue, setQueue] = useState<Exercise[]>([])
  const [index, setIndex] = useState(0)
  const [records, setRecords] = useState<AnswerRecord[]>([])
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const [deadline, setDeadline] = useState<number | null>(null)
  const [remaining, setRemaining] = useState(0)

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
      const [exercises, ch] = await Promise.all([loadScopeExercises(p), p.scope === 'chapitre' && p.id ? db.chapitres.get(p.id) : Promise.resolve(undefined)])
      const c = p.scope === 'cahier' && p.id ? context.cahiers.get(p.id) : ch ? context.cahiers.get(ch.cahierId) : undefined
      setParams(p)
      setCtx(context)
      setCahier(c)
      setChapitre(ch)
      start(p, exercises, context)
    })().catch((err: unknown) => {
      console.error('TrainPage: chargement impossible', err)
      setPhase({ kind: 'empty' })
    })
  }, [searchKey, start])

  const restart = useCallback(() => {
    if (!params) return
    setPhase({ kind: 'loading' })
    Promise.all([loadScopeExercises(params), loadSessionContext()])
      .then(([exercises, context]) => {
        setCtx(context)
        start(params, exercises, context)
      })
      .catch((err: unknown) => {
        console.error('TrainPage: rechargement impossible', err)
        setPhase({ kind: 'empty' })
      })
  }, [params, start])

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

  const handleAnswer = useCallback(
    ({ correct, grade }: AnswerResult) => {
      if (!params || !ctx || phase.kind !== 'running') return
      const exercise = queue[index]
      if (!exercise) return
      const now = Date.now()
      const durationMs = now - shownAt.current

      const requeued = params.mode !== 'chrono' && grade === 'again' && !retried.current.has(exercise.id)
      if (requeued) retried.current.add(exercise.id)

      // The write is async; the queue advances immediately. The re-queued copy
      // gets the new FSRS state once the write resolves (it is at the end anyway).
      const pending = persistAnswer(exercise, grade, correct, params.mode, durationMs, ctx, now)
      const placeholderLogId = `pending-${exercise.id}-${now}`
      setRecords((prev) => [...prev, { exercise, correct, grade, durationMs, logId: placeholderLogId, requeued }])
      pending
        .then(({ log, card }) => {
          setRecords((prev) => prev.map((r) => (r.logId === placeholderLogId ? { ...r, logId: log.id } : r)))
          if (requeued && card) setQueue((q) => q.map((e, i) => (i >= index + 1 && e.id === exercise.id ? { ...e, fsrs: card } : e)))
        })
        .catch((err: unknown) => console.error('persistAnswer', err))

      let nextQueue = queue
      if (requeued) {
        nextQueue = [...queue, exercise]
        setQueue(nextQueue)
      }
      if (index + 1 >= nextQueue.length) setPhase({ kind: 'done', reason: 'completed' })
      else setIndex(index + 1)
    },
    [params, ctx, phase.kind, queue, index],
  )

  // ---- Undo ------------------------------------------------------------------

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo])

  // ---- Quit ------------------------------------------------------------------

  const quit = useCallback(() => {
    if (phase.kind === 'running' && records.length > 0) {
      const ok = window.confirm('Quitter la session ? Les réponses déjà données sont enregistrées.')
      if (!ok) return
    }
    navigate(from)
  }, [phase.kind, records.length, navigate, from])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        quit()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [quit])

  // ---- Derived ---------------------------------------------------------------

  const label = params ? scopeLabel(params, cahier, chapitre) : ''
  const isChrono = params?.mode === 'chrono'
  const lowTime = isChrono && remaining <= LOW_TIME_MS
  const progress = queue.length ? Math.min(100, (records.length / queue.length) * 100) : 0
  const summary = useMemo(() => summarize(records), [records])
  const intervals = useMemo(() => (ctx && current && params?.mode === 'review' ? intervalLabels(ctx, current.fsrs) : undefined), [ctx, current, params?.mode])

  // ---- Render ----------------------------------------------------------------

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-3 md:px-4">
        <IconButton label="Quitter" onClick={quit}>
          <X size={18} weight="bold" />
        </IconButton>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
          <span className="truncate text-sm font-medium text-ink">{label}</span>
          {params && (
            <Badge tone="accent" className="shrink-0">
              {MODE_LABEL[params.mode]}
            </Badge>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3 text-sm text-muted tabular-nums">
          {phase.kind === 'running' && (
            <IconButton label="Annuler la dernière réponse (Ctrl+Z)" onClick={undo} disabled={!canUndo} title="Annuler la dernière réponse (Ctrl+Z)">
              <ArrowUUpLeft size={18} />
            </IconButton>
          )}
          {phase.kind === 'running' && (
            <span aria-label={`Question ${index + 1} sur ${queue.length}`}>
              {index + 1} / {queue.length}
            </span>
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
      <div className="h-0.5 w-full bg-line" aria-hidden>
        <motion.div className="h-full bg-accent" initial={false} animate={{ width: `${progress}%` }} transition={{ duration: reduced ? 0 : 0.3, ease: 'easeOut' }} />
      </div>

      <main className="flex flex-1 flex-col items-center px-4 py-8 md:py-12">
        <div className="w-full max-w-2xl">
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
              icon={params?.mode === 'review' ? <Sparkle size={24} /> : <Stack size={24} />}
              title={params?.mode === 'review' ? 'Rien à réviser pour le moment' : 'Aucun exercice dans cette sélection'}
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
                key={currentKey}
                initial={reduced ? false : { opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduced ? { opacity: 1, transition: { duration: 0 } } : { opacity: 0, x: -24 }}
                transition={{ duration: reduced ? 0 : 0.18, ease: 'easeOut' }}
              >
                <Card className="p-6 md:p-8">
                  <ExercisePlayer exercise={current} chrono={isChrono} intervals={intervals} onAnswer={handleAnswer} />
                </Card>
              </motion.div>
            </AnimatePresence>
          )}

          {phase.kind === 'done' && params && (
            <Results
              params={params}
              summary={summary}
              answered={records.length}
              queued={queue.length}
              timedOut={phase.reason === 'timeout'}
              onRestart={restart}
              onFinish={() => navigate(from)}
            />
          )}
        </div>
      </main>
    </div>
  )
}

// ---- Results -----------------------------------------------------------------

function Results({
  params,
  summary,
  answered,
  queued,
  timedOut,
  onRestart,
  onFinish,
}: {
  params: SessionParams
  summary: ReturnType<typeof summarize>
  answered: number
  queued: number
  timedOut: boolean
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

  return (
    <motion.div initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : 0.25, ease: 'easeOut' }} className="flex flex-col gap-4">
      <Card className="flex flex-col items-center gap-6 p-6 text-center md:p-8">
        <span className="flex size-12 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <Trophy size={24} weight="fill" />
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

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button variant="secondary" size="lg" onClick={onRestart}>
            <ArrowCounterClockwise size={18} weight="bold" />
            Recommencer
          </Button>
          <Button size="lg" autoFocus onClick={onFinish}>
            <Check size={18} weight="bold" />
            Terminer
          </Button>
        </div>
        <p className="text-xs text-muted">
          <Kbd>Échap</Kbd> pour quitter{params.mode !== 'review' ? ' · cette session n’a pas modifié le planning' : ''}
        </p>
      </Card>

      {missed.length > 0 && (
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
