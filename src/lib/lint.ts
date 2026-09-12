// ---------------------------------------------------------------------------
// Deterministic quality linter for generated exercises (Wozniak's minimum
// information principle, atomic questions, competitive distractors…). Every
// rule is a heuristic: it flags, the user decides. Pure functions.
// ---------------------------------------------------------------------------

import type { ExerciseData } from '../types'
import { parseCloze, clozeToPlain } from './cloze'
import { findDuplicates, normalizeText } from './dedupe'
import { hasUnbalancedLatex } from './markdown'

export type LintCode =
  | 'answer_too_long'
  | 'double_question'
  | 'enumeration'
  | 'dangling_pronoun'
  | 'cloze_stopword'
  | 'cloze_visible'
  | 'cloze_multiple'
  | 'mcq_long_choice'
  | 'mcq_same_position'
  | 'mcq_no_reasons'
  | 'truefalse_no_correction'
  | 'latex_unbalanced'
  | 'anchor_missing'
  | 'duplicate'

export interface LintIssue {
  code: LintCode
  message: string
  severity: 'warn' | 'info'
}

export const LINT_LABELS: Record<LintCode, string> = {
  answer_too_long: 'Réponse trop longue',
  double_question: 'Deux questions en une',
  enumeration: 'Demande une liste',
  dangling_pronoun: 'Pronom sans antécédent',
  cloze_stopword: 'Trou sur un mot-outil',
  cloze_visible: 'Réponse visible dans la phrase',
  cloze_multiple: 'Plusieurs trous',
  mcq_long_choice: 'Un choix beaucoup plus long',
  mcq_same_position: 'Bonne réponse toujours à la même place',
  mcq_no_reasons: 'Distracteurs non justifiés',
  truefalse_no_correction: 'Vrai/Faux sans énoncé corrigé',
  latex_unbalanced: 'LaTeX déséquilibré',
  anchor_missing: 'Ancre introuvable dans la fiche',
  duplicate: 'Quasi-doublon',
}

const MAX_ANSWER_WORDS = 25
const ENUMERATION_RE = /\b(cite[sz]?|énum[eé]re[sz]?|énumérez|liste[sz]?|lister|nomme[sz]? les|donne[sz]? les (?:\d+|deux|trois|quatre|cinq)|quel(?:le)?s sont|quels? (?:sont|est) les (?:\d+|différent))/i
const INTERROGATIVE = '(?:quel(?:le)?s?|comment|pourquoi|où|quand|combien|lequel|laquelle|qui|que)'
const DOUBLE_RE = new RegExp(`\\b${INTERROGATIVE}\\b[^?]*\\bet\\b[^?]*\\b${INTERROGATIVE}\\b`, 'i')
const PRONOUN_START_RE = /^(il|elle|ils|elles|ce|ceci|cela|celui-ci|celle-ci|ceux-ci|celles-ci|cette|ces|c'|ça|on|lui|leur)\b/i
const STOPWORDS = new Set(
  'le la les l un une des du de d et ou à a au aux en est sont était été être que qui quoi dont où par pour sur dans sous avec sans ne pas plus ce se sa son ses cet cette ces mon ma mes ton ta tes notre nos votre vos leur leurs il elle ils elles on nous vous je tu me te y'.split(' '),
)

function wordCount(s: string): number {
  return normalizeText(s).split(' ').filter(Boolean).length
}

function questionOf(data: ExerciseData): string {
  switch (data.type) {
    case 'flashcard':
    case 'mcq':
      return data.question
    case 'truefalse':
      return data.statement
    case 'cloze':
      return clozeToPlain(data.text)
    case 'match':
      return data.instruction ?? ''
    case 'order':
      return data.instruction
    case 'demonstration':
      return data.statement
    case 'rappel_libre':
      return ''
  }
}

/** Text used for duplicate detection: the part a student sees plus the answer. */
export function exerciseKeyText(data: ExerciseData): string {
  switch (data.type) {
    case 'flashcard':
      return `${data.question} ${data.answer}`
    case 'cloze':
      return clozeToPlain(data.text)
    case 'mcq':
      return `${data.question} ${data.correct.map((i) => data.choices[i] ?? '').join(' ')}`
    case 'truefalse':
      return data.statement
    case 'match':
      return data.pairs.map((p) => `${p.left} ${p.right}`).join(' ')
    case 'order':
      return `${data.instruction} ${data.items.join(' ')}`
    case 'demonstration':
      return `${data.title} ${data.statement} ${data.steps.map((s) => s.text).join(' ')}`
    case 'rappel_libre':
      return `rappel libre ${data.topic} ${data.checklist.map((c) => c.text).join(' ')}`
  }
}

function allText(data: ExerciseData): string {
  switch (data.type) {
    case 'flashcard':
      return [data.question, data.answer, data.hint ?? ''].join('\n')
    case 'cloze':
      return data.text
    case 'mcq':
      return [data.question, ...data.choices, data.explanation ?? ''].join('\n')
    case 'truefalse':
      return [data.statement, data.explanation ?? '', data.correctedStatement ?? ''].join('\n')
    case 'match':
      return data.pairs.map((p) => `${p.left}\n${p.right}`).join('\n')
    case 'order':
      return [data.instruction, ...data.items].join('\n')
    case 'demonstration':
      return [data.title, data.statement, ...data.steps.flatMap((s) => [s.text, s.why ?? ''])].join('\n')
    case 'rappel_libre':
      return [data.topic, ...data.checklist.map((c) => c.text)].join('\n')
  }
}

/** Rules that look at one exercise only. */
export function lintExercise(data: ExerciseData): LintIssue[] {
  const issues: LintIssue[] = []
  const q = questionOf(data)

  if (data.type === 'flashcard' && wordCount(data.answer) > MAX_ANSWER_WORDS) {
    issues.push({ code: 'answer_too_long', severity: 'warn', message: `Réponse de ${wordCount(data.answer)} mots (max ${MAX_ANSWER_WORDS}) : découper en plusieurs exercices.` })
  }
  if ((data.type === 'flashcard' || data.type === 'mcq') && (DOUBLE_RE.test(q) || (q.match(/\?/g) ?? []).length >= 2)) {
    issues.push({ code: 'double_question', severity: 'warn', message: 'La question en contient deux : un fait par exercice.' })
  }
  if (ENUMERATION_RE.test(q)) {
    issues.push({ code: 'enumeration', severity: 'warn', message: 'Demande un ensemble (« cite les… ») : transformer en N exercices ou en séquence.' })
  }
  if (PRONOUN_START_RE.test(q.trim())) {
    issues.push({ code: 'dangling_pronoun', severity: 'warn', message: 'Commence par un pronom : la question doit être autonome.' })
  }

  if (data.type === 'cloze') {
    const blanks = parseCloze(data.text).filter((s) => s.kind === 'blank')
    const visible = normalizeText(data.text.replace(/\{\{[^{}]+\}\}/g, ' '))
    for (const b of blanks) {
      const answers = b.answers.map(normalizeText)
      if (answers.some((a) => a && a.split(' ').every((w) => STOPWORDS.has(w)))) {
        issues.push({ code: 'cloze_stopword', severity: 'warn', message: `Le trou « ${b.answers[0]} » est un mot-outil : masquer une notion.` })
      }
      if (answers.some((a) => a.length >= 3 && ` ${visible} `.includes(` ${a} `))) {
        issues.push({ code: 'cloze_visible', severity: 'warn', message: `« ${b.answers[0]} » apparaît déjà dans la phrase visible.` })
      }
    }
    if (blanks.length > 1) issues.push({ code: 'cloze_multiple', severity: 'info', message: `${blanks.length} trous : un seul trou par carte évite le remplissage par la grammaire.` })
  }

  if (data.type === 'mcq') {
    const lengths = data.choices.map((c) => c.length).sort((a, b) => a - b)
    const median = lengths[Math.floor(lengths.length / 2)] || 1
    const longest = Math.max(...data.choices.map((c) => c.length))
    if (data.choices.length >= 3 && longest > 2 * median && longest > 20) {
      issues.push({ code: 'mcq_long_choice', severity: 'warn', message: 'Un choix est bien plus long que les autres : il trahit la réponse.' })
    }
    const reasons = (data.distractorReasons ?? []).filter((r, i) => !data.correct.includes(i) && r?.trim())
    if (reasons.length === 0) issues.push({ code: 'mcq_no_reasons', severity: 'info', message: 'Aucun « pourquoi c’est faux » pour les distracteurs.' })
  }

  if (data.type === 'truefalse' && !data.correctedStatement?.trim()) {
    issues.push({ code: 'truefalse_no_correction', severity: 'warn', message: 'Vrai/Faux sans énoncé corrigé : l’élève ne pourra pas corriger.' })
  }

  if (hasUnbalancedLatex(allText(data))) {
    issues.push({ code: 'latex_unbalanced', severity: 'warn', message: 'Délimiteurs $ ou accolades déséquilibrés : la formule ne s’affichera pas.' })
  }
  return issues
}

export interface LintReport {
  index: number
  issues: LintIssue[]
}

export interface LintContext {
  /** Key texts of the exercises already in the fiche. */
  existingKeys: string[]
}

/** Rules that need the whole batch: same-position MCQs and near-duplicates. */
export function lintBatch(items: ExerciseData[], ctx: LintContext): LintReport[] {
  const reports = items.map((data, index) => ({ index, issues: lintExercise(data) }))

  const mcqs = items.map((d, i) => ({ d, i })).filter((x): x is { d: Extract<ExerciseData, { type: 'mcq' }>; i: number } => x.d.type === 'mcq')
  if (mcqs.length >= 3) {
    const positions = new Set(mcqs.map((m) => m.d.correct[0]))
    if (positions.size === 1) {
      for (const m of mcqs) reports[m.i].issues.push({ code: 'mcq_same_position', severity: 'warn', message: `Tous les QCM du lot ont la bonne réponse en position ${(m.d.correct[0] ?? 0) + 1}.` })
    }
  }

  const keys = items.map(exerciseKeyText)
  for (const hit of findDuplicates(keys, ctx.existingKeys)) {
    const where = hit.against.kind === 'existing' ? 'd’un exercice déjà présent' : `de l’élément #${hit.against.index + 1} du lot`
    reports[hit.index].issues.push({ code: 'duplicate', severity: 'warn', message: `Proche à ${Math.round(hit.score * 100)} % ${where}.` })
  }
  return reports
}

/** A point's anchor must be a passage of the fiche (compared without accents, case or punctuation). */
export function anchorFound(anchor: string, ficheText: string): boolean {
  const a = normalizeText(anchor)
  if (!a) return false
  const f = normalizeText(ficheText)
  if (f.includes(a)) return true
  // Tolerate a slightly trimmed quote: the first / last 40 characters must appear.
  const head = a.slice(0, 40)
  const tail = a.slice(-40)
  return a.length > 60 && f.includes(head) && f.includes(tail)
}

export function lintAnchor(anchor: string, ficheText: string): LintIssue | null {
  return anchorFound(anchor, ficheText) ? null : { code: 'anchor_missing', severity: 'warn', message: 'La citation du point ne se trouve pas dans la fiche.' }
}
