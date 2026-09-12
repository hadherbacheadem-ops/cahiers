// ---------------------------------------------------------------------------
// Training session helpers: URL params → scope → queue → answers → summary.
// Pure functions except loadScopeExercises / persistAnswer which hit Dexie.
// ---------------------------------------------------------------------------

import type { Cahier, Chapitre, Exercise, ExerciseType, Grade, Settings, TrainMode } from '../types'
import { EXERCISE_TYPES, GRADE_TO_RATING } from '../types'
import { db } from '../db'
import { isDue, schedule } from './srs'
import { shuffle } from './shuffle'
import { clozeToPlain } from './cloze'
import { uid } from './ids'

export interface SessionParams {
  scope: 'all' | 'cahier' | 'chapitre'
  id?: string
  mode: TrainMode
  types?: ExerciseType[]
  count?: number
  seconds?: number
}

const REVIEW_CAP = 50
const PRACTICE_DEFAULT_COUNT = 30

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

export function buildQueue(exercises: Exercise[], params: SessionParams, now = Date.now()): Exercise[] {
  if (params.mode === 'review') {
    return exercises
      .filter((e) => isDue(e.srs, now))
      .sort((a, b) => a.srs.due - b.srs.due)
      .slice(0, params.count ?? REVIEW_CAP)
  }
  const count = params.count ?? (params.mode === 'practice' ? PRACTICE_DEFAULT_COUNT : exercises.length)
  return shuffle(exercises).slice(0, Math.min(count, exercises.length))
}

export interface AnswerRecord {
  exercise: Exercise
  correct: boolean
  grade: Grade
  durationMs: number
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

/**
 * Logs the answer and, in review mode, updates the schedule. Practice and chrono
 * answers are recorded for statistics but must not move due dates
 * (retrieval practice outside the schedule is still practice, not planning).
 */
export async function persistAnswer(exercise: Exercise, grade: Grade, correct: boolean, mode: TrainMode, durationMs: number): Promise<void> {
  const now = Date.now()
  const affectsScheduling = mode === 'review'
  await db.transaction('rw', db.exercises, db.reviewLogs, async () => {
    if (affectsScheduling) await db.exercises.update(exercise.id, { srs: schedule(exercise.srs, grade, now), updatedAt: now })
    await db.reviewLogs.add({
      id: uid(),
      exerciseId: exercise.id,
      cahierId: exercise.cahierId,
      chapitreId: exercise.chapitreId,
      ts: now,
      rating: GRADE_TO_RATING[grade],
      correct,
      durationMs: Math.max(0, Math.round(durationMs)),
      mode,
      fsrsLog: null,
      affectsScheduling,
    })
  })
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
      return d.text.replace(/\{\{[^{}]+\}\}/g, '____')
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
      return clozeToPlain(d.text)
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
