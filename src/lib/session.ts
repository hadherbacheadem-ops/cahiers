// ---------------------------------------------------------------------------
// Training session helpers: URL params → scope → queue → answers → summary.
// Pure functions except the load* / persistAnswer / undoAnswer ones, which hit Dexie.
// ---------------------------------------------------------------------------

import type { FSRS } from 'ts-fsrs'
import type { Cahier, Chapitre, Confidence, Exam, Exercise, ExerciseType, FsrsCard, Grade, ReviewLog, Settings, TrainMode } from '../types'
import { EXERCISE_TYPES, GRADE_TO_RATING } from '../types'
import { db, getSettings } from '../db'
import { applyRating, isFsrsLogEntry, makeScheduler, previewAll, formatInterval, retrievability } from './fsrs'
import { buildReviewQueue, countToday, limitsFor, type DailyCounts } from './queue'
import { interleave, isLeechAfter, nextFading, startOfTomorrow } from './interleave'
import { overridesFor, type SchedulerOverride } from './exam'
import { shuffle } from './shuffle'
import { clozeDisplayText } from './cloze'
import { uid } from './ids'
import type { IntervalLabels } from '../components/train/shared'

export interface SessionParams {
  scope: 'all' | 'cahier' | 'chapitre' | 'exam'
  id?: string
  mode: TrainMode
  types?: ExerciseType[]
  count?: number
  seconds?: number
  /** Exam modes: the exam id and, for successive relearning, the planned session index. */
  examId?: string
  sessionIndex?: number
}

const PRACTICE_DEFAULT_COUNT = 30
const LOG_WINDOW_DAYS = 60
const DAY = 86_400_000

function isExerciseType(v: string): v is ExerciseType {
  return (EXERCISE_TYPES as string[]).includes(v)
}

function positiveInt(v: string | null): number | undefined {
  if (v == null) return undefined
  const n = Number.parseInt(v, 10)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

export function parseSessionParams(search: URLSearchParams, settings: Settings): SessionParams {
  const rawScope = search.get('scope')
  const id = search.get('id') ?? undefined
  const examId = search.get('exam') ?? undefined

  const rawMode = search.get('mode')
  let mode: TrainMode = rawMode === 'review' || rawMode === 'chrono' || rawMode === 'exam' || rawMode === 'cramming' ? rawMode : 'practice'
  if ((mode === 'exam' || mode === 'cramming') && !examId) mode = 'practice'
  const scope: SessionParams['scope'] = mode === 'exam' || mode === 'cramming' ? 'exam' : rawScope === 'cahier' || rawScope === 'chapitre' ? (id ? rawScope : 'all') : 'all'

  const rawTypes = search.get('types')
  const types = rawTypes
    ? rawTypes
        .split(',')
        .map((t) => t.trim())
        .filter(isExerciseType)
    : undefined

  const params: SessionParams = { scope, mode }
  if (scope === 'cahier' || scope === 'chapitre') params.id = id
  if (scope === 'exam') {
    params.examId = examId
    const s = search.get('session')
    if (s !== null && /^\d+$/.test(s)) params.sessionIndex = Number(s)
  }
  if (types && types.length) params.types = types

  if (mode === 'chrono') {
    params.count = positiveInt(search.get('count')) ?? settings.chronoCount
    params.seconds = positiveInt(search.get('seconds')) ?? settings.chronoSeconds
  } else if (mode === 'practice') {
    params.count = positiveInt(search.get('count')) ?? PRACTICE_DEFAULT_COUNT
  } else {
    const count = positiveInt(search.get('count'))
    if (count) params.count = count
  }
  return params
}

// ---- Context: settings, scheduler, daily counts ----------------------------

export interface SessionContext {
  settings: Settings
  /** Scheduler with the global parameters. */
  scheduler: FSRS
  /** Scheduler for a given exercise: exam overrides (interval cap, retention boost) apply per fiche. */
  schedulerFor: (exercise: Pick<Exercise, 'chapitreId'>) => FSRS
  overrides: Map<string, SchedulerOverride>
  cahiers: Map<string, Cahier>
  exams: Map<string, { cahier: Cahier; exam: Exam }>
  counts: Map<string, DailyCounts>
  now: number
}

export async function loadSessionContext(now = Date.now()): Promise<SessionContext> {
  const [settings, cahiers, logs] = await Promise.all([getSettings(), db.cahiers.toArray(), db.reviewLogs.where('ts').above(now - DAY).toArray()])
  const exams = new Map<string, { cahier: Cahier; exam: Exam }>()
  for (const cahier of cahiers) for (const exam of cahier.examens ?? []) exams.set(exam.id, { cahier, exam })
  const overrides = overridesFor([...exams.values()].map((x) => x.exam), settings.maximumInterval, now)
  const scheduler = makeScheduler({ desiredRetention: settings.desiredRetention, maximumInterval: settings.maximumInterval })
  const cache = new Map<string, FSRS>()
  const schedulerFor = (exercise: Pick<Exercise, 'chapitreId'>) => {
    const o = overrides.get(exercise.chapitreId)
    if (!o) return scheduler
    const retention = o.desiredRetention ?? settings.desiredRetention
    const key = `${retention}|${o.maximumInterval}`
    let s = cache.get(key)
    if (!s) {
      s = makeScheduler({ desiredRetention: retention, maximumInterval: o.maximumInterval })
      cache.set(key, s)
    }
    return s
  }
  return {
    settings,
    scheduler,
    schedulerFor,
    overrides,
    cahiers: new Map(cahiers.map((c) => [c.id, c])),
    exams,
    counts: countToday(logs, now),
    now,
  }
}

export async function loadScopeExercises(params: SessionParams, ctx?: SessionContext): Promise<Exercise[]> {
  let rows: Exercise[]
  if (params.scope === 'exam' && params.examId) {
    const entry = ctx?.exams.get(params.examId) ?? (await findExam(params.examId))
    rows = entry ? await db.exercises.where('chapitreId').anyOf(entry.exam.chapitreIds).toArray() : []
  } else if (params.scope === 'cahier' && params.id) rows = await db.exercises.where('cahierId').equals(params.id).toArray()
  else if (params.scope === 'chapitre' && params.id) rows = await db.exercises.where('chapitreId').equals(params.id).toArray()
  else rows = await db.exercises.toArray()

  // Pending, suspended and leech exercises never enter a session.
  rows = rows.filter((e) => e.status === 'active')
  if (params.types && params.types.length) {
    const wanted = new Set(params.types)
    rows = rows.filter((e) => wanted.has(e.type))
  }
  return rows
}

async function findExam(examId: string): Promise<{ cahier: Cahier; exam: Exam } | undefined> {
  const cahiers = await db.cahiers.toArray()
  for (const cahier of cahiers) {
    const exam = cahier.examens?.find((e) => e.id === examId)
    if (exam) return { cahier, exam }
  }
  return undefined
}

/**
 * Review: due cards under the daily limits, interleaved. Exam session: every
 * exercise of the exam's fiches, interleaved (each must be recalled once).
 * Cramming: everything by rising retrievability. Practice / chrono: a shuffled sample.
 */
export function buildQueue(exercises: Exercise[], params: SessionParams, ctx: SessionContext, now = Date.now()): Exercise[] {
  const lexicalCahiers = new Set([...ctx.cahiers.values()].filter((c) => c.lexical).map((c) => c.id))
  if (params.mode === 'review') {
    const queue = buildReviewQueue({
      exercises,
      limitsByCahier: (cahierId) => limitsFor(ctx.cahiers.get(cahierId), ctx.settings),
      countsByCahier: ctx.counts,
      now,
      cap: params.count,
    })
    return interleave(queue, { lexicalCahiers })
  }
  if (params.mode === 'exam') return interleave(exercises.filter((e) => e.status === 'active'), { lexicalCahiers })
  if (params.mode === 'cramming') {
    return exercises
      .filter((e) => e.status === 'active')
      .map((e) => ({ e, r: retrievability(ctx.schedulerFor(e), e.fsrs, now) }))
      .sort((a, b) => a.r - b.r)
      .map((x) => x.e)
  }
  const count = params.count ?? (params.mode === 'practice' ? PRACTICE_DEFAULT_COUNT : exercises.length)
  return shuffle(exercises).slice(0, Math.min(count, exercises.length))
}

/** Interval labels for the four ratings of the current card (scheduling modes only). */
export function intervalLabels(ctx: SessionContext, exercise: Pick<Exercise, 'chapitreId'>, card: FsrsCard, now = Date.now()): IntervalLabels {
  const preview = previewAll(ctx.schedulerFor(exercise), card, now, ctx.settings.lightDays)
  return {
    again: formatInterval(preview[1].due - now),
    hard: formatInterval(preview[2].due - now),
    good: formatInterval(preview[3].due - now),
    easy: formatInterval(preview[4].due - now),
  }
}

export interface ExamCap {
  /** Maximum interval imposed by the exam, in days. */
  days: number
  examName: string
  /** Ratings whose interval is shorter than what the general scheduler would give. */
  grades: Grade[]
}

const GRADE_OF_RATING: Record<1 | 2 | 3 | 4, Grade> = { 1: 'again', 2: 'hard', 3: 'good', 4: 'easy' }

/**
 * When an exam caps the fiche's intervals, which of the four buttons are
 * actually constrained: compared against the general scheduler, so a cap that
 * changes nothing (short intervals) is not reported.
 */
export function intervalCap(ctx: SessionContext, exercise: Pick<Exercise, 'chapitreId'>, card: FsrsCard, now = Date.now()): ExamCap | undefined {
  const override = ctx.overrides.get(exercise.chapitreId)
  if (!override || override.maximumInterval >= ctx.settings.maximumInterval) return undefined
  const capped = previewAll(ctx.schedulerFor(exercise), card, now, ctx.settings.lightDays)
  const free = previewAll(ctx.scheduler, card, now, ctx.settings.lightDays)
  const grades = ([1, 2, 3, 4] as const).filter((r) => capped[r].due < free[r].due).map((r) => GRADE_OF_RATING[r])
  if (!grades.length) return undefined
  return { days: override.maximumInterval, examName: override.examName ?? 'examen', grades }
}

// ---- Answers ---------------------------------------------------------------

export interface AnswerRecord {
  exercise: Exercise
  correct: boolean
  grade: Grade
  durationMs: number
  confidence?: Confidence
  /** Id of the review log written for this answer (undo). */
  logId: string
  /** True when the exercise was re-queued at the end after this answer. */
  requeued: boolean
}

export function summarize(records: AnswerRecord[]): {
  total: number
  correct: number
  accuracy: number
  totalMs: number
  missed: AnswerRecord[]
  /** Answers given with "sûr", and how many of them were right. */
  sure: { answered: number; correct: number }
  /** Wrong answers given with "sûr": retested at J+1 and J+7. */
  confidentErrors: AnswerRecord[]
} {
  const total = records.length
  const correct = records.filter((r) => r.correct).length
  const accuracy = total === 0 ? 0 : Math.round((correct / total) * 100)
  const totalMs = records.reduce((sum, r) => sum + r.durationMs, 0)
  const missed = records.filter((r) => !r.correct)
  const sureRecords = records.filter((r) => r.confidence === 3)
  const sure = { answered: sureRecords.length, correct: sureRecords.filter((r) => r.correct).length }
  const confidentErrors = sureRecords.filter((r) => !r.correct)
  return { total, correct, accuracy, totalMs, missed, sure, confidentErrors }
}

const HYPERCORRECTION_DAYS = [1, 7]

/**
 * Hypercorrection (Butler, Fazio & Marsh 2011): a high-confidence error is
 * corrected well at first but the correction fades, so the card is forced
 * back at J+1 and J+7 whatever FSRS says. Dates already passed are dropped.
 */
export function applyForcedDue(card: FsrsCard, forced: number[] | undefined, confidentError: boolean, now: number): { card: FsrsCard; forcedDue: number[] | undefined } {
  let dates = (forced ?? []).filter((d) => d > now)
  if (confidentError) {
    const tomorrow = startOfTomorrow(now)
    dates = [...new Set([...dates, ...HYPERCORRECTION_DAYS.map((d) => tomorrow + (d - 1) * DAY)])].sort((a, b) => a - b)
  }
  if (!dates.length) return { card, forcedDue: undefined }
  return { card: { ...card, due: Math.min(card.due, dates[0]) }, forcedDue: dates }
}

/** Review and exam sessions move the schedule; practice, chrono and cramming never do. */
export function schedulingMode(mode: TrainMode): boolean {
  return mode === 'review' || mode === 'exam'
}

export interface PersistedAnswer {
  log: ReviewLog
  /** New FSRS state when the answer moved the schedule, otherwise null. */
  card: FsrsCard | null
  /** The exercise crossed the leech threshold with this answer. */
  becameLeech: boolean
  /** Siblings (same point) pushed to tomorrow. */
  buriedIds: string[]
  /** Exercises of the notions missed in a free recall, made due now. */
  reprioritised: number
}

/**
 * Logs the answer and, in review mode, applies FSRS plus the session rules:
 * leech detection, worked-example fading, sibling burying, free-recall
 * re-prioritisation. Practice and chrono answers are recorded for statistics
 * but must not move due dates.
 */
export async function persistAnswer(
  exercise: Exercise,
  grade: Grade,
  correct: boolean,
  mode: TrainMode,
  durationMs: number,
  ctx: SessionContext,
  now = Date.now(),
  extra: { missedPointIds?: string[]; confidence?: Confidence } = {},
): Promise<PersistedAnswer> {
  const affectsScheduling = schedulingMode(mode)
  const rating = GRADE_TO_RATING[grade]
  const entry = affectsScheduling ? applyRating(ctx.schedulerFor(exercise), exercise.fsrs, rating, now, ctx.settings.lightDays) : null
  // Hypercorrection retests, kept on the exercise across answers.
  const confidentError = !!entry && !correct && extra.confidence === 3
  const forced = entry ? applyForcedDue(entry.next, exercise.forcedDue, confidentError, now) : null
  if (entry && forced) entry.next = forced.card
  const log: ReviewLog = {
    id: uid(),
    exerciseId: exercise.id,
    cahierId: exercise.cahierId,
    chapitreId: exercise.chapitreId,
    ts: now,
    rating,
    correct,
    confidence: extra.confidence,
    durationMs: Math.max(0, Math.round(durationMs)),
    mode,
    fsrsLog: entry,
    affectsScheduling,
  }
  const becameLeech = !!entry && exercise.status === 'active' && isLeechAfter(entry.next.lapses, rating, ctx.settings.leechThreshold)
  const fading = exercise.type === 'demonstration' && affectsScheduling ? nextFading(exercise.fading, grade) : undefined
  const buriedIds: string[] = []
  let reprioritised = 0

  await db.transaction('rw', db.exercises, db.reviewLogs, async () => {
    const patch: Partial<Exercise> = { updatedAt: now }
    if (entry) patch.fsrs = entry.next
    if (forced) patch.forcedDue = forced.forcedDue
    if (becameLeech) patch.status = 'leech'
    if (fading) patch.fading = fading
    await db.exercises.update(exercise.id, patch)
    await db.reviewLogs.add(log)

    if (affectsScheduling && ctx.settings.burySiblings && exercise.pointId) {
      const siblings = await db.exercises.where('pointId').equals(exercise.pointId).filter((e) => e.id !== exercise.id && e.status === 'active' && e.fsrs.due <= now && e.fsrs.state !== 1 && e.fsrs.state !== 3).toArray()
      const tomorrow = startOfTomorrow(now)
      for (const s of siblings) {
        await db.exercises.update(s.id, { fsrs: { ...s.fsrs, due: tomorrow }, updatedAt: now })
        buriedIds.push(s.id)
      }
    }

    if (extra.missedPointIds?.length) {
      const linked = await db.exercises.where('pointId').anyOf(extra.missedPointIds).filter((e) => e.status === 'active' && e.id !== exercise.id && e.fsrs.due > now).toArray()
      for (const e of linked) await db.exercises.update(e.id, { fsrs: { ...e.fsrs, due: now }, updatedAt: now })
      reprioritised = linked.length
    }
  })
  return { log, card: entry?.next ?? null, becameLeech, buriedIds, reprioritised }
}

/** "-" in a session: revisit tomorrow without answering. */
export async function buryExercise(exercise: Exercise, now = Date.now()): Promise<void> {
  await db.exercises.update(exercise.id, { fsrs: { ...exercise.fsrs, due: startOfTomorrow(now) }, updatedAt: now })
}

/** "@" in a session: take the exercise out of the schedule until reactivated. */
export async function suspendExercise(exercise: Exercise): Promise<void> {
  await db.exercises.update(exercise.id, { status: 'suspended', updatedAt: Date.now() })
}

/** Next due date among the scope's active exercises (for the session summary). */
export async function nextDueInScope(params: SessionParams, ctx?: SessionContext, now = Date.now()): Promise<number | undefined> {
  const rows = await loadScopeExercises(params, ctx)
  const future = rows.map((e) => e.fsrs.due).filter((d) => d > now)
  return future.length ? Math.min(...future) : undefined
}

/** Undo: restores the card exactly as it was before the answer and removes the log. */
export async function undoAnswer(logId: string): Promise<void> {
  await db.transaction('rw', db.exercises, db.reviewLogs, async () => {
    const log = await db.reviewLogs.get(logId)
    if (!log) return
    if (log.affectsScheduling && isFsrsLogEntry(log.fsrsLog)) {
      await db.exercises.update(log.exerciseId, { fsrs: log.fsrsLog.prev, updatedAt: Date.now() })
    }
    await db.reviewLogs.delete(logId)
  })
}

/** Median answer duration over the recent log, for the "~12 min" estimates. */
export async function loadRecentLogs(now = Date.now()): Promise<ReviewLog[]> {
  return db.reviewLogs.where('ts').above(now - LOG_WINDOW_DAYS * DAY).toArray()
}

export function scopeLabel(params: SessionParams, cahier?: Cahier, chapitre?: Chapitre, exam?: Exam): string {
  if (params.scope === 'exam') return exam ? `${cahier ? `${cahier.name} · ` : ''}${exam.name}` : 'Examen'
  if (params.scope === 'chapitre') {
    if (chapitre && cahier) return `${cahier.name} · ${chapitre.title}`
    if (chapitre) return chapitre.title
    return 'Fiche'
  }
  if (params.scope === 'cahier') return cahier?.name ?? 'Cahier'
  return 'Tous les cahiers'
}

// ---- One-line renderings for the results screen ----------------------------

export function exercisePromptText(exercise: Exercise): string {
  const d = exercise.data
  switch (d.type) {
    case 'flashcard':
      return d.question
    case 'cloze':
      return clozeDisplayText(d.text)
    case 'mcq':
      return d.question
    case 'truefalse':
      return d.statement
    case 'match':
      return d.instruction?.trim() || `${d.pairs.length} paire${d.pairs.length > 1 ? 's' : ''}`
    case 'order':
      return d.instruction
    case 'demonstration':
      return `${d.title} — ${d.statement}`
    case 'rappel_libre':
      return `Rappel libre : ${d.topic}`
    case 'carte_trous':
      return d.variant === 'trous' ? 'Carte mentale à trous' : 'Reconstruction de la carte mentale'
  }
}

export function exerciseAnswerText(exercise: Exercise): string {
  const d = exercise.data
  switch (d.type) {
    case 'flashcard':
      return d.answer
    case 'cloze':
      return clozeDisplayText(d.text, true)
    case 'mcq':
      return d.correct.map((i) => d.choices[i]).filter(Boolean).join(', ')
    case 'truefalse':
      return d.answer ? 'Vrai' : 'Faux'
    case 'match':
      return d.pairs.map((p) => `${p.left} → ${p.right}`).join(', ')
    case 'order':
      return d.items.join(' → ')
    case 'demonstration':
      return d.steps.map((s, i) => `${i + 1}. ${s.text}`).join(' ')
    case 'rappel_libre':
      return d.checklist.map((c) => c.text).join(' · ')
    case 'carte_trous':
      return 'Les nœuds de la carte, retrouvés de mémoire'
  }
}

export function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
