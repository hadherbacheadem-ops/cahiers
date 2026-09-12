// ---------------------------------------------------------------------------
// Domain model. Everything lives in IndexedDB (see db.ts); ids are UUIDs.
// Hierarchy: Cahier (matière) → Chapitre (fiche de cours) → Exercise.
// ---------------------------------------------------------------------------

export type ExerciseType = 'flashcard' | 'cloze' | 'mcq' | 'truefalse' | 'match' | 'order' | 'rappel_libre' | 'demonstration' | 'carte_trous'

export const EXERCISE_TYPES: ExerciseType[] = ['flashcard', 'cloze', 'mcq', 'truefalse', 'match', 'order', 'demonstration', 'rappel_libre', 'carte_trous']

/** Types Claude can generate (mind-map exercises are derived from a saved map instead). */
export const GENERATABLE_TYPES: ExerciseType[] = ['flashcard', 'cloze', 'mcq', 'truefalse', 'match', 'order', 'demonstration', 'rappel_libre']

export const EXERCISE_LABELS: Record<ExerciseType, string> = {
  flashcard: 'Flashcards',
  cloze: 'Textes à trous',
  mcq: 'QCM',
  truefalse: 'Vrai / Faux',
  match: 'Associations',
  order: 'Classements',
  demonstration: 'Démonstrations / méthodes',
  rappel_libre: 'Rappels libres',
  carte_trous: 'Cartes mentales à trous',
}

export const EXERCISE_LABELS_SINGULAR: Record<ExerciseType, string> = {
  flashcard: 'Flashcard',
  cloze: 'Texte à trous',
  mcq: 'QCM',
  truefalse: 'Vrai / Faux',
  match: 'Association',
  order: 'Classement',
  demonstration: 'Démonstration',
  rappel_libre: 'Rappel libre',
  carte_trous: 'Carte mentale à trous',
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
  /** Vocabulary / lexicon subject: reviews stay blocked by fiche (interleaving hurts vocabulary, g = −0.39). */
  lexical?: boolean
  examens?: Exam[]
  createdAt: number
  updatedAt: number
}

// ---- Exams: successive relearning plan + scheduler overrides -----------------

export interface ExamSession {
  /** Planned day (local midnight). */
  at: number
  /** When the session was completed. */
  done?: number
}

export interface Exam {
  id: string
  name: string
  /** Exam day, local midnight. */
  date: number
  chapitreIds: string[]
  /** Days before the exam from which the desired retention is raised to 0.95. */
  boostFromDays: number
  /** The three successive-relearning sessions. */
  sessions: ExamSession[]
  /** Set once the user acknowledged the exam is over (overrides already stopped applying). */
  archived?: boolean
  createdAt: number
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
  /** `typed`: the answer must be written before the reveal (tolerant comparison, diff shown). */
  | { type: 'flashcard'; question: string; answer: string; hint?: string; typed?: boolean }
  /** Blanks use the syntax `{{réponse}}` or `{{réponse|variante|variante2}}`. */
  | { type: 'cloze'; text: string }
  /** `distractorReasons[i]` says why choice i is wrong (empty for correct choices). */
  | { type: 'mcq'; question: string; choices: string[]; correct: number[]; explanation?: string; distractorReasons?: string[] }
  /** `correctedStatement` is the true version of a false statement (the user must write it). */
  | { type: 'truefalse'; statement: string; answer: boolean; explanation?: string; correctedStatement?: string }
  | { type: 'match'; instruction?: string; pairs: { left: string; right: string }[] }
  /** `items` are stored in the correct order; the player shuffles them. */
  | { type: 'order'; instruction: string; items: string[] }
  /**
   * Guided free recall: "write everything you remember about `topic`", then tick
   * the notions of `checklist` you produced. Items may point at a point de cours.
   */
  | { type: 'rappel_libre'; topic: string; checklist: { text: string; pointId?: string | null }[] }
  /**
   * Worked example with fading: `steps` of a proof, a computation or a method.
   * The level (1 masked step → half → statement only) lives on the exercise.
   */
  | { type: 'demonstration'; title: string; statement: string; steps: { text: string; why?: string }[] }
  /**
   * Derived from a saved mind map (one per variant). 'trous': 30–50 % of the
   * nodes hidden, recalled one by one. 'reconstruction': root and level-1
   * branches shown, the sub-nodes are recalled from memory then compared.
   */
  | { type: 'carte_trous'; mindmapId: string; variant: 'trous' | 'reconstruction' }

/** Fading state of a demonstration exercise (Kalyuga's expertise reversal). */
export interface FadingState {
  level: 1 | 2 | 3
  /** Consecutive successes at the current level; two of them raise the level. */
  streak: number
}

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
  /** Imported after a backslash repair in Claude's JSON: shown first in the validation queue. */
  repaired?: boolean
  fsrs: FsrsCard
  /** Only for `demonstration` exercises. */
  fading?: FadingState
  /**
   * Hypercorrection: after a high-confidence error the card is forced back at
   * J+1 and J+7 on top of its FSRS schedule. Dates already passed are dropped.
   */
  forcedDue?: number[]
  createdAt: number
  updatedAt: number
}

/**
 * review   = due cards, FSRS-scheduled
 * practice = shuffled sample, no scheduling effect
 * chrono   = timed quiz, deferred feedback, no scheduling effect
 * exam     = successive-relearning session: every exercise of the exam's fiches until one correct recall (scheduled)
 * cramming = everything of the exam's fiches by rising retrievability, no scheduling effect
 */
export type TrainMode = 'review' | 'practice' | 'chrono' | 'exam' | 'cramming'

export type ReviewMode = TrainMode

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
  /** Skip the validation queue: imported exercises are active immediately. */
  autoValidate: boolean
  /** After answering an exercise, push its due siblings (same point) to tomorrow. */
  burySiblings: boolean
  /** Answers per day that keep the streak alive (small on purpose). */
  minimalGoal: number
  /** Answers per day the user aims for; informative only. */
  dailyGoal: number
  /** Type every flashcard answer (not only the ones Claude marked `typed`). */
  typedFlashcards: boolean
  /** Generate the reverse card (definition → term) for definition / formula points. */
  autoInverse: boolean
  /** Confidence-weighted MCQ (Sparck, Bjork & Bjork 2016): split 100 % between two choices. Single study, off by default. */
  weightedMcq: boolean
  /** Create the two mind-map exercises of a fiche map as active instead of "à valider". */
  mindmapExercisesActive: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'app',
  /** Marine is the signature theme; light stays available in Réglages. */
  theme: 'dark',
  chronoSeconds: 120,
  chronoCount: 15,
  promptTypes: ['flashcard', 'cloze', 'mcq', 'truefalse', 'match', 'order', 'demonstration', 'rappel_libre'],
  desiredRetention: 0.9,
  maximumInterval: 365,
  newPerDay: 20,
  reviewsMaxPerDay: 200,
  lightDays: [],
  leechThreshold: 8,
  askConfidence: true,
  autoValidate: false,
  burySiblings: true,
  minimalGoal: 10,
  dailyGoal: 50,
  typedFlashcards: false,
  autoInverse: true,
  weightedMcq: false,
  mindmapExercisesActive: false,
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
