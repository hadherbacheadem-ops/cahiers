// ---------------------------------------------------------------------------
// Domain model. Everything lives in IndexedDB (see db.ts); ids are UUIDs.
// Hierarchy: Cahier (matière) → Chapitre (fiche de cours) → Exercise.
// ---------------------------------------------------------------------------

export type ExerciseType = 'flashcard' | 'cloze' | 'mcq' | 'truefalse' | 'match' | 'order'

export const EXERCISE_TYPES: ExerciseType[] = ['flashcard', 'cloze', 'mcq', 'truefalse', 'match', 'order']

export const EXERCISE_LABELS: Record<ExerciseType, string> = {
  flashcard: 'Flashcards',
  cloze: 'Textes à trous',
  mcq: 'QCM',
  truefalse: 'Vrai / Faux',
  match: 'Associations',
  order: 'Classements',
}

export const EXERCISE_LABELS_SINGULAR: Record<ExerciseType, string> = {
  flashcard: 'Flashcard',
  cloze: 'Texte à trous',
  mcq: 'QCM',
  truefalse: 'Vrai / Faux',
  match: 'Association',
  order: 'Classement',
}

export type ChapitreSource = 'paste' | 'docx' | 'pdf' | 'onenote' | 'claude'

export interface Cahier {
  id: string
  name: string
  /** One of CAHIER_COLORS. Identity colour for the notebook, not the UI accent. */
  color: string
  /** Official programme (BO extract) and/or the teacher's course plan, used to complete fiches. */
  programme?: string
  /** Per-cahier daily limits; undefined fields fall back on the global settings. */
  limits?: { newPerDay?: number; reviewsMaxPerDay?: number }
  createdAt: number
  updatedAt: number
}

// ---- Supplements: additions proposed by Claude, kept or discarded by the user ----

export type SupplementKind = 'manque' | 'precision' | 'correction'

export const SUPPLEMENT_KIND_LABELS: Record<SupplementKind, string> = {
  manque: 'Notion manquante',
  precision: 'À préciser',
  correction: 'Correction',
}

export interface Supplement {
  id: string
  chapitreId: string
  cahierId: string
  title: string
  kind: SupplementKind
  /** Why Claude proposes it, ideally citing the programme. */
  reason: string
  /** Light markdown, ready to be appended to the fiche. */
  content: string
  status: 'pending' | 'kept'
  createdAt: number
}

// ---- Mind maps -------------------------------------------------------------

export interface MindmapNode {
  label: string
  /** Short detail shown under the label (definition, date, formula). */
  note?: string
  children?: MindmapNode[]
}

export interface Mindmap {
  id: string
  cahierId: string
  /** Undefined for a whole-cahier synthesis map. */
  chapitreId?: string
  title: string
  root: MindmapNode
  createdAt: number
  updatedAt: number
}

export interface Chapitre {
  id: string
  cahierId: string
  title: string
  /** Plain text / light markdown extracted from the source. This is what gets sent to Claude. */
  content: string
  source: ChapitreSource
  /** Set when imported through Microsoft Graph, so the fiche can be re-synced. */
  onenotePageId?: string
  createdAt: number
  updatedAt: number
}

/** SM-2 state written by schema versions ≤ 3. Only used by the migration to FSRS. */
export interface LegacySrsState {
  ease: number
  interval: number
  due: number
  reps: number
  lapses: number
}

/** ts-fsrs `State`: 0 = New, 1 = Learning, 2 = Review, 3 = Relearning. */
export type FsrsStateValue = 0 | 1 | 2 | 3

/**
 * ts-fsrs `Card`, with dates as epoch ms so it can live in IndexedDB and JSON.
 * Difficulty 1–10, stability in days, `due` = next review, `last_review` = previous one.
 */
export interface FsrsCard {
  due: number
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  learning_steps: number
  reps: number
  lapses: number
  state: FsrsStateValue
  last_review?: number
}

export type Grade = 'again' | 'hard' | 'good' | 'easy'

export type ExerciseData =
  | { type: 'flashcard'; question: string; answer: string; hint?: string }
  /** Blanks use the syntax `{{réponse}}` or `{{réponse|variante|variante2}}`. */
  | { type: 'cloze'; text: string }
  | { type: 'mcq'; question: string; choices: string[]; correct: number[]; explanation?: string }
  | { type: 'truefalse'; statement: string; answer: boolean; explanation?: string }
  | { type: 'match'; instruction?: string; pairs: { left: string; right: string }[] }
  /** `items` are stored in the correct order; the player shuffles them. */
  | { type: 'order'; instruction: string; items: string[] }

export type Difficulty = 1 | 2 | 3

// ---- Points de cours: the atomic unit of a fiche, anchor of every exercise ----

export type PointNature = 'definition' | 'formule' | 'theoreme' | 'demonstration' | 'methode' | 'ordre_de_grandeur' | 'exemple' | 'date' | 'autre'

export const POINT_NATURES: PointNature[] = ['definition', 'formule', 'theoreme', 'demonstration', 'methode', 'ordre_de_grandeur', 'exemple', 'date', 'autre']

export const POINT_NATURE_LABELS: Record<PointNature, string> = {
  definition: 'Définition',
  formule: 'Formule',
  theoreme: 'Théorème',
  demonstration: 'Démonstration',
  methode: 'Méthode',
  ordre_de_grandeur: 'Ordre de grandeur',
  exemple: 'Exemple',
  date: 'Date',
  autre: 'Autre',
}

export interface PointDeCours {
  id: string
  chapitreId: string
  cahierId: string
  /** Short verbatim quote of the fiche passage (≤ 200 chars): coverage, duplicates, "voir dans la fiche". */
  anchor: string
  title: string
  nature: PointNature
  order: number
  createdAt: number
}

/**
 * pending  = imported, waiting for the user's validation (not scheduled)
 * active   = scheduled
 * suspended = kept but never scheduled
 * leech    = failed too many times, pulled out of scheduling until rewritten
 */
export type ExerciseStatus = 'pending' | 'active' | 'suspended' | 'leech'

export const EXERCISE_STATUS_LABELS: Record<ExerciseStatus, string> = {
  pending: 'À valider',
  active: 'Actif',
  suspended: 'Suspendu',
  leech: 'Leech',
}

export type ExerciseOrigin = 'claude' | 'manual' | 'inverse_auto'

export interface Exercise {
  id: string
  chapitreId: string
  cahierId: string
  /** Point de cours this exercise tests; exercises sharing a pointId are siblings. Null for legacy rows. */
  pointId: string | null
  type: ExerciseType
  data: ExerciseData
  difficulty: Difficulty
  tags: string[]
  status: ExerciseStatus
  origin: ExerciseOrigin
  /** Reverse card (answer → question) generated from a sibling. */
  inverse?: boolean
  fsrs: FsrsCard
  createdAt: number
  updatedAt: number
}

export type TrainMode = 'review' | 'practice' | 'chrono'

/** Every way an answer can be produced; 'exam' and 'cramming' arrive with the exam-preparation mode. */
export type ReviewMode = TrainMode | 'exam' | 'cramming'

/** 1 = Encore, 2 = Difficile, 3 = Bien, 4 = Facile (same scale as FSRS). */
export type Rating = 1 | 2 | 3 | 4

export const GRADE_TO_RATING: Record<Grade, Rating> = { again: 1, hard: 2, good: 3, easy: 4 }
export const RATING_TO_GRADE: Record<Rating, Grade> = { 1: 'again', 2: 'hard', 3: 'good', 4: 'easy' }

/** Confidence asked BEFORE the answer is revealed: 1 = aucune idée, 2 = hésitant, 3 = sûr. */
export type Confidence = 1 | 2 | 3

/**
 * One row per answer. The single source of truth for statistics, undo, and the
 * FSRS migration/replay. Never deleted except with its exercise.
 */
export interface ReviewLog {
  id: string
  exerciseId: string
  chapitreId: string
  cahierId: string
  ts: number
  rating: Rating
  correct: boolean
  confidence?: Confidence
  durationMs: number
  mode: ReviewMode
  /** ts-fsrs review log (state before/after) once FSRS is in place; null for SM-2-era rows. */
  fsrsLog: unknown | null
  /** False for chrono / practice / cramming answers, which must not move the schedule. */
  affectsScheduling: boolean
}

export interface Settings {
  id: 'app'
  theme: 'auto' | 'light' | 'dark'
  /** Microsoft Entra application (client) ID used for the OneNote import. */
  graphClientId?: string
  /** Study level quoted in every prompt, e.g. "Terminale spécialité SVT" or "L2 droit". */
  niveau?: string
  /** Chrono mode defaults. */
  chronoSeconds: number
  chronoCount: number
  /**
   * Exercise types Claude may use when generating. No counts: the prompt asks for
   * exhaustive coverage, one exercise per point of the fiche however small.
   */
  promptTypes: ExerciseType[]

  // ---- Scheduling (FSRS) ----
  /** Probability of recall FSRS aims for at review time, 0.80–0.95. */
  desiredRetention: number
  /** Longest interval FSRS may schedule, in days (the exam mode caps it further). */
  maximumInterval: number
  newPerDay: number
  reviewsMaxPerDay: number
  /** Weekdays (0 = Sunday … 6 = Saturday) where the scheduler avoids placing due dates. */
  lightDays: number[]
  /** Lapses after which an exercise becomes a leech. */
  leechThreshold: number
  /** Ask "Sûr / Hésitant / Aucune idée" before revealing an answer. */
  askConfidence: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'app',
  theme: 'auto',
  chronoSeconds: 120,
  chronoCount: 15,
  promptTypes: ['flashcard', 'cloze', 'mcq', 'truefalse', 'match', 'order'],
  desiredRetention: 0.9,
  maximumInterval: 365,
  newPerDay: 20,
  reviewsMaxPerDay: 200,
  lightDays: [],
  leechThreshold: 8,
  askConfidence: true,
}

export const CAHIER_COLORS: { name: string; value: string }[] = [
  { name: 'Cobalt', value: '#3b6cf6' },
  { name: 'Émeraude', value: '#15a36a' },
  { name: 'Ambre', value: '#e08a1e' },
  { name: 'Framboise', value: '#d9377a' },
  { name: 'Améthyste', value: '#7d4fe0' },
  { name: 'Turquoise', value: '#0e9bb5' },
  { name: 'Brique', value: '#d24b3c' },
  { name: 'Ardoise', value: '#64748b' },
]
