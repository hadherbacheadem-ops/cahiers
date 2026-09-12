// ---------------------------------------------------------------------------
// Training session helpers: URL params → scope → queue → answers → summary.
// Pure functions except the load* / persistAnswer / undoAnswer ones, which hit Dexie.
// ---------------------------------------------------------------------------

import type { FSRS } from 'ts-fsrs'
import type { Cahier, Chapitre, Exercise, ExerciseType, FsrsCard, Grade, ReviewLog, Settings, TrainMode } from '../types'
import { EXERCISE_TYPES, GRADE_TO_RATING } from '../types'
import { db, getSettings } from '../db'
import { applyRating, isFsrsLogEntry, makeScheduler, previewAll, formatInterval } from './fsrs'
import { buildReviewQueue, countToday, limitsFor, type DailyCounts } from './queue'
import { shuffle } from './shuffle'
import { clozeDisplayText } from './cloze'
import { uid } from './ids'
import type { IntervalLabels } from '../components/train/shared'

export interface SessionParams {
  scope: 'all' | 'cahier' | 'chapitre'
  id?: string
  mode: TrainMode
  types?: ExerciseType[]
  count?: number
  seconds?: number
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
  const scope: SessionParams['scope'] = rawScope === 'cahier' || rawScope === 'chapitre' ? (id ? rawScope : 'all') : 'all'

  const rawMode = search.get('mode')
  const mode: TrainMode = rawMode === 'review' || rawMode === 'chrono' ? rawMode : 'practice'

  const rawTypes = search.get('types')
  const types = rawTypes
    ? rawTypes
        .split(',')
        .map((t) => t.trim())
        .filter(isExerciseType)
    : undefined

  const params: SessionParams = { scope, mode }
  if (scope !== 'all') params.id = id
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
  scheduler: FSRS
  cahiers: Map<string, Cahier>
  counts: Map<string, DailyCounts>
  now: number
}

export async function loadSessionContext(now = Date.now()): Promise<SessionContext> {
  const [settings, cahiers, logs] = await Promise.all([getSettings(), db.cahiers.toArray(), db.reviewLogs.where('ts').above(now - DAY).toArray()])
  return {
    settings,
    scheduler: makeScheduler({ desiredRetention: settings.desiredRetention, maximumInterval: settings.maximumInterval }),
    cahiers: new Map(cahiers.map((c) => [c.id, c])),
    counts: countToday(logs, now),
    now,
  }
}

export async function loadScopeExercises(params: SessionParams): Promise<Exercise[]> {
  let rows: Exercise[]
  if (params.scope === 'cahier' && params.id) rows = await db.exercises.where('cahierId').equals(params.id).toArray()
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

/** Review: due cards under the daily limits. Practice / chrono: a shuffled sample. */
export function buildQueue(exercises: Exercise[], params: SessionParams, ctx: SessionContext, now = Date.now()): Exercise[] {
  if (params.mode === 'review') {
    return buildReviewQueue({
      exercises,
      limitsByCahier: (cahierId) => limitsFor(ctx.cahiers.get(cahierId), ctx.settings),
      countsByCahier: ctx.counts,
      now,
      cap: params.count,
    })
  }
  const count = params.count ?? (params.mode === 'practice' ? PRACTICE_DEFAULT_COUNT : exercises.length)
  return shuffle(exercises).slice(0, Math.min(count, exercises.length))
}

/** Interval labels for the four ratings of the current card (review mode only). */
export function intervalLabels(ctx: SessionContext, card: FsrsCard, now = Date.now()): IntervalLabels {
  const preview = previewAll(ctx.scheduler, card, now, ctx.settings.lightDays)
  return {
    again: formatInterval(preview[1].due - now),
    hard: formatInterval(preview[2].due - now),
    good: formatInterval(preview[3].due - now),
    easy: formatInterval(preview[4].due - now),
  }
}

// ---- Answers ---------------------------------------------------------------

export interface AnswerRecord {
  exercise: Exercise
  correct: boolean
  grade: Grade
  durationMs: number
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
} {
  const total = records.length
  const correct = records.filter((r) => r.correct).length
  const accuracy = total === 0 ? 0 : Math.round((correct / total) * 100)
  const totalMs = records.reduce((sum, r) => sum + r.durationMs, 0)
  const missed = records.filter((r) => !r.correct)
  return { total, correct, accuracy, totalMs, missed }
}

export interface PersistedAnswer {
  log: ReviewLog
  /** New FSRS state when the answer moved the schedule, otherwise null. */
  card: FsrsCard | null
}

/**
 * Logs the answer and, in review mode, applies FSRS. Practice and chrono
 * answers are recorded for statistics but must not move due dates
 * (retrieval practice outside the schedule is still practice, not planning).
 */
export async function persistAnswer(exercise: Exercise, grade: Grade, correct: boolean, mode: TrainMode, durationMs: number, ctx: SessionContext, now = Date.now()): Promise<PersistedAnswer> {
  const affectsScheduling = mode === 'review'
  const rating = GRADE_TO_RATING[grade]
  const entry = affectsScheduling ? applyRating(ctx.scheduler, exercise.fsrs, rating, now, ctx.settings.lightDays) : null
  const log: ReviewLog = {
    id: uid(),
    exerciseId: exercise.id,
    cahierId: exercise.cahierId,
    chapitreId: exercise.chapitreId,
    ts: now,
    rating,
    correct,
    durationMs: Math.max(0, Math.round(durationMs)),
    mode,
    fsrsLog: entry,
    affectsScheduling,
  }
  await db.transaction('rw', db.exercises, db.reviewLogs, async () => {
    if (entry) await db.exercises.update(exercise.id, { fsrs: entry.next, updatedAt: now })
    await db.reviewLogs.add(log)
  })
  return { log, card: entry?.next ?? null }
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

export function scopeLabel(params: SessionParams, cahier?: Cahier, chapitre?: Chapitre): string {
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
  }
}

export function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
