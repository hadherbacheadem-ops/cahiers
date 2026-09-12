import { useMemo, useState, type ReactNode } from 'react'
import { CheckCircle, Circle, Plus, Trash } from '@phosphor-icons/react'
import type { Difficulty, Exercise, ExerciseData, PointDeCours } from '../types'
import { POINT_NATURE_LABELS } from '../types'
import { updateExercise } from '../db'
import { LINT_LABELS, lintExercise, type LintIssue } from '../lib/lint'
import { clozeDisplayText, countBlanks, parseCloze } from '../lib/cloze'
import { Markdown } from './Markdown'
import { Badge, Button, Card, Field, IconButton, Input, Modal, Select, Textarea, cx } from './ui'

// ---------------------------------------------------------------------------
// Shared read-only pieces (also used by the validation queue)
// ---------------------------------------------------------------------------

/** Renders an exercise for reading, answers visible. Every text goes through <Markdown>. */
export function ExerciseReadout({ data }: { data: ExerciseData }) {
  switch (data.type) {
    case 'flashcard':
      return (
        <div className="flex flex-col gap-3">
          <Markdown text={data.question} className="text-base font-medium" />
          <LabeledBlock label="Réponse" tone="ok">
            <Markdown text={data.answer} />
          </LabeledBlock>
          {data.hint?.trim() && (
            <LabeledBlock label="Indice">
              <Markdown text={data.hint} inline className="text-muted" />
            </LabeledBlock>
          )}
        </div>
      )
    case 'cloze': {
      // Rendered as one string so a blank inside a formula keeps its $…$ intact.
      const variants = parseCloze(data.text)
        .filter((s) => s.kind === 'blank')
        .flatMap((s) => (s.kind === 'blank' && s.answers.length > 1 ? [s.answers.join(' / ')] : []))
      return (
        <div className="text-base leading-relaxed">
          <Markdown text={clozeDisplayText(data.text, true)} />
          {variants.length > 0 && <p className="mt-1 text-xs text-muted">Variantes acceptées : {variants.join(' ; ')}</p>}
        </div>
      )
    }
    case 'mcq':
      return (
        <div className="flex flex-col gap-3">
          <Markdown text={data.question} className="text-base font-medium" />
          <ul className="flex flex-col gap-1.5">
            {data.choices.map((choice, i) => {
              const correct = data.correct.includes(i)
              const reason = data.distractorReasons?.[i]?.trim()
              return (
                <li key={i} className="flex gap-2">
                  <span className={cx('mt-0.5 shrink-0', correct ? 'text-ok' : 'text-muted')} aria-label={correct ? 'Bonne réponse' : 'Mauvaise réponse'}>
                    {correct ? <CheckCircle size={18} weight="fill" /> : <Circle size={18} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Markdown text={choice} inline className={cx('text-sm', correct && 'font-medium text-ok')} />
                    {!correct && reason && (
                      <p className="mt-0.5 text-xs text-muted">
                        <Markdown text={reason} inline />
                      </p>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
          {data.explanation?.trim() && (
            <LabeledBlock label="Explication">
              <Markdown text={data.explanation} className="text-sm text-muted" />
            </LabeledBlock>
          )}
        </div>
      )
    case 'truefalse':
      return (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start gap-2">
            <Badge tone={data.answer ? 'ok' : 'bad'} className="mt-0.5 shrink-0">
              {data.answer ? 'Vrai' : 'Faux'}
            </Badge>
            <Markdown text={data.statement} className="min-w-0 flex-1 text-base font-medium" />
          </div>
          {data.correctedStatement?.trim() && (
            <LabeledBlock label="Énoncé corrigé" tone="ok">
              <Markdown text={data.correctedStatement} />
            </LabeledBlock>
          )}
          {data.explanation?.trim() && (
            <LabeledBlock label="Explication">
              <Markdown text={data.explanation} className="text-sm text-muted" />
            </LabeledBlock>
          )}
        </div>
      )
    case 'match':
      return (
        <div className="flex flex-col gap-3">
          {data.instruction?.trim() && <Markdown text={data.instruction} className="text-base font-medium" />}
          <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
            {data.pairs.map((p, i) => (
              <li key={i} className="grid grid-cols-2 gap-3 px-3 py-2 text-sm">
                <Markdown text={p.left} inline className="font-medium" />
                <Markdown text={p.right} inline className="text-muted" />
              </li>
            ))}
          </ul>
        </div>
      )
    case 'order':
      return (
        <div className="flex flex-col gap-3">
          <Markdown text={data.instruction} className="text-base font-medium" />
          <ol className="flex flex-col gap-1.5">
            {data.items.map((item, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span className="w-5 shrink-0 text-right font-mono text-xs text-muted tabular-nums">{i + 1}.</span>
                <Markdown text={item} inline />
              </li>
            ))}
          </ol>
        </div>
      )
  }
}

function LabeledBlock({ label, tone, children }: { label: string; tone?: 'ok'; children: ReactNode }) {
  return (
    <div className={cx('rounded-lg px-3 py-2', tone === 'ok' ? 'bg-ok-soft/60' : 'bg-surface-2')}>
      <p className={cx('mb-1 text-[11px] font-medium uppercase tracking-wide', tone === 'ok' ? 'text-ok' : 'text-muted')}>{label}</p>
      {children}
    </div>
  )
}

/** Lint issues as Badge + message rows, or a discreet "no issue" line. */
export function LintIssueList({ issues }: { issues: LintIssue[] }) {
  if (issues.length === 0) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-ok">
        <CheckCircle size={16} weight="fill" />
        Aucun défaut détecté
      </p>
    )
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {issues.map((issue, i) => (
        <li key={`${issue.code}-${i}`} className="flex items-start gap-2 text-sm">
          <Badge tone={issue.severity === 'warn' ? 'warn' : 'neutral'} className="mt-px shrink-0">
            {LINT_LABELS[issue.code]}
          </Badge>
          <span className="min-w-0 text-muted">{issue.message}</span>
        </li>
      ))}
    </ul>
  )
}

// ---------------------------------------------------------------------------
// Draft model: editable strings, turned back into ExerciseData on save
// ---------------------------------------------------------------------------

type ChoiceDraft = { text: string; correct: boolean; reason: string }

type Draft =
  | { type: 'flashcard'; question: string; answer: string; hint: string }
  | { type: 'cloze'; text: string }
  | { type: 'mcq'; question: string; choices: ChoiceDraft[]; explanation: string }
  | { type: 'truefalse'; statement: string; answer: boolean; correctedStatement: string; explanation: string }
  | { type: 'match'; instruction: string; pairsText: string }
  | { type: 'order'; instruction: string; itemsText: string }

const MIN_CHOICES = 2
const MAX_CHOICES = 6

function toDraft(data: ExerciseData): Draft {
  switch (data.type) {
    case 'flashcard':
      return { type: 'flashcard', question: data.question, answer: data.answer, hint: data.hint ?? '' }
    case 'cloze':
      return { type: 'cloze', text: data.text }
    case 'mcq':
      return {
        type: 'mcq',
        question: data.question,
        choices: data.choices.map((text, i) => ({ text, correct: data.correct.includes(i), reason: data.distractorReasons?.[i] ?? '' })),
        explanation: data.explanation ?? '',
      }
    case 'truefalse':
      return { type: 'truefalse', statement: data.statement, answer: data.answer, correctedStatement: data.correctedStatement ?? '', explanation: data.explanation ?? '' }
    case 'match':
      return { type: 'match', instruction: data.instruction ?? '', pairsText: data.pairs.map((p) => `${p.left} | ${p.right}`).join('\n') }
    case 'order':
      return { type: 'order', instruction: data.instruction, itemsText: data.items.join('\n') }
  }
}

function lines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}

function parsePairs(text: string): { left: string; right: string }[] {
  return lines(text).map((line) => {
    const idx = line.indexOf('|')
    if (idx < 0) return { left: line, right: '' }
    return { left: line.slice(0, idx).trim(), right: line.slice(idx + 1).trim() }
  })
}

/** Lenient conversion for the preview and the live lint: never fails. */
function buildData(draft: Draft): ExerciseData {
  switch (draft.type) {
    case 'flashcard': {
      const hint = draft.hint.trim()
      return { type: 'flashcard', question: draft.question.trim(), answer: draft.answer.trim(), ...(hint ? { hint } : {}) }
    }
    case 'cloze':
      return { type: 'cloze', text: draft.text.trim() }
    case 'mcq': {
      const explanation = draft.explanation.trim()
      const hasReasons = draft.choices.some((c) => !c.correct && c.reason.trim())
      return {
        type: 'mcq',
        question: draft.question.trim(),
        choices: draft.choices.map((c) => c.text.trim()),
        correct: draft.choices.map((c, i) => (c.correct ? i : -1)).filter((i) => i >= 0),
        ...(explanation ? { explanation } : {}),
        ...(hasReasons ? { distractorReasons: draft.choices.map((c) => (c.correct ? '' : c.reason.trim())) } : {}),
      }
    }
    case 'truefalse': {
      const explanation = draft.explanation.trim()
      const correctedStatement = draft.correctedStatement.trim()
      return {
        type: 'truefalse',
        statement: draft.statement.trim(),
        answer: draft.answer,
        ...(explanation ? { explanation } : {}),
        ...(correctedStatement ? { correctedStatement } : {}),
      }
    }
    case 'match': {
      const instruction = draft.instruction.trim()
      return { type: 'match', pairs: parsePairs(draft.pairsText), ...(instruction ? { instruction } : {}) }
    }
    case 'order':
      return { type: 'order', instruction: draft.instruction.trim(), items: lines(draft.itemsText) }
  }
}

type Errors = Partial<Record<string, string>>

const REQUIRED = 'Ce champ est obligatoire.'

function validate(draft: Draft): Errors {
  const errors: Errors = {}
  switch (draft.type) {
    case 'flashcard':
      if (!draft.question.trim()) errors.question = REQUIRED
      if (!draft.answer.trim()) errors.answer = REQUIRED
      break
    case 'cloze':
      if (!draft.text.trim()) errors.text = REQUIRED
      else if (countBlanks(draft.text) === 0) errors.text = 'Il faut au moins un trou : {{réponse}}.'
      break
    case 'mcq':
      if (!draft.question.trim()) errors.question = REQUIRED
      if (draft.choices.some((c) => !c.text.trim())) errors.choices = 'Chaque choix doit avoir un texte.'
      else if (!draft.choices.some((c) => c.correct)) errors.choices = 'Coche au moins une bonne réponse.'
      break
    case 'truefalse':
      if (!draft.statement.trim()) errors.statement = REQUIRED
      break
    case 'match': {
      const pairs = parsePairs(draft.pairsText)
      if (pairs.length < 2) errors.pairsText = 'Il faut au moins deux paires.'
      else if (pairs.some((p) => !p.left || !p.right)) errors.pairsText = 'Chaque ligne doit suivre la forme « terme | définition ».'
      break
    }
    case 'order':
      if (!draft.instruction.trim()) errors.instruction = REQUIRED
      if (lines(draft.itemsText).length < 2) errors.itemsText = 'Il faut au moins deux éléments.'
      break
  }
  return errors
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

interface Props {
  open: boolean
  onClose: () => void
  exercise: Exercise
  points: PointDeCours[]
}

/** Edits an exercise in place. The form is remounted on every open so it always starts from the stored exercise. */
export function ExerciseEditModal(props: Props) {
  const [session, setSession] = useState(0)
  const [prevOpen, setPrevOpen] = useState(props.open)
  if (props.open !== prevOpen) {
    setPrevOpen(props.open)
    if (props.open) setSession((s) => s + 1)
  }
  return <EditInner key={session} {...props} />
}

function EditInner({ open, onClose, exercise, points }: Props) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(exercise.data))
  const [difficulty, setDifficulty] = useState<Difficulty>(exercise.difficulty)
  const [tags, setTags] = useState(exercise.tags.join(', '))
  const [pointId, setPointId] = useState<string>(exercise.pointId ?? '')
  const [errors, setErrors] = useState<Errors>({})
  const [saving, setSaving] = useState(false)

  const previewData = useMemo(() => buildData(draft), [draft])
  const issues = useMemo(() => lintExercise(previewData), [previewData])
  const sortedPoints = useMemo(() => [...points].sort((a, b) => a.order - b.order), [points])

  function patch(next: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...next }) as Draft)
  }

  async function save() {
    const errs = validate(draft)
    setErrors(errs)
    if (Object.keys(errs).length > 0) return
    setSaving(true)
    try {
      await updateExercise(exercise.id, {
        data: buildData(draft),
        difficulty,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        pointId: pointId || null,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Modifier l’exercice"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={save} disabled={saving}>
            Enregistrer
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        {draft.type === 'flashcard' && (
          <>
            <Field label="Question" error={errors.question}>
              {(id) => <Textarea id={id} value={draft.question} onChange={(e) => patch({ question: e.target.value })} aria-invalid={!!errors.question} autoFocus />}
            </Field>
            <Field label="Réponse" error={errors.answer}>
              {(id) => <Textarea id={id} value={draft.answer} onChange={(e) => patch({ answer: e.target.value })} aria-invalid={!!errors.answer} />}
            </Field>
            <Field label="Indice (optionnel)">{(id) => <Input id={id} value={draft.hint} onChange={(e) => patch({ hint: e.target.value })} />}</Field>
          </>
        )}

        {draft.type === 'cloze' && (
          <Field label="Texte" hint="Syntaxe : {{réponse}} ou {{réponse|variante}}" error={errors.text}>
            {(id) => <Textarea id={id} value={draft.text} onChange={(e) => patch({ text: e.target.value })} aria-invalid={!!errors.text} autoFocus />}
          </Field>
        )}

        {draft.type === 'mcq' && (
          <>
            <Field label="Question" error={errors.question}>
              {(id) => <Textarea id={id} value={draft.question} onChange={(e) => patch({ question: e.target.value })} aria-invalid={!!errors.question} autoFocus />}
            </Field>
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-2 text-sm font-medium">Choix</legend>
              {draft.choices.map((choice, i) => (
                <div key={i} className="flex flex-col gap-2 rounded-lg border border-line p-3">
                  <div className="flex items-center gap-2">
                    <Input
                      value={choice.text}
                      aria-label={`Choix ${i + 1}`}
                      placeholder={`Choix ${i + 1}`}
                      onChange={(e) => patch({ choices: draft.choices.map((c, j) => (j === i ? { ...c, text: e.target.value } : c)) })}
                    />
                    <IconButton
                      label="Supprimer ce choix"
                      disabled={draft.choices.length <= MIN_CHOICES}
                      onClick={() => patch({ choices: draft.choices.filter((_, j) => j !== i) })}
                    >
                      <Trash size={16} />
                    </IconButton>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--accent)]"
                      checked={choice.correct}
                      onChange={(e) => patch({ choices: draft.choices.map((c, j) => (j === i ? { ...c, correct: e.target.checked } : c)) })}
                    />
                    Bonne réponse
                  </label>
                  {!choice.correct && (
                    <Input
                      value={choice.reason}
                      aria-label={`Pourquoi le choix ${i + 1} est faux`}
                      placeholder="Pourquoi c’est faux (optionnel)"
                      className="text-sm"
                      onChange={(e) => patch({ choices: draft.choices.map((c, j) => (j === i ? { ...c, reason: e.target.value } : c)) })}
                    />
                  )}
                </div>
              ))}
              {errors.choices && <p className="text-sm text-bad">{errors.choices}</p>}
              <div>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={draft.choices.length >= MAX_CHOICES}
                  onClick={() => patch({ choices: [...draft.choices, { text: '', correct: false, reason: '' }] })}
                >
                  <Plus size={14} weight="bold" />
                  Ajouter un choix
                </Button>
              </div>
            </fieldset>
            <Field label="Explication (optionnel)">{(id) => <Textarea id={id} value={draft.explanation} onChange={(e) => patch({ explanation: e.target.value })} />}</Field>
          </>
        )}

        {draft.type === 'truefalse' && (
          <>
            <Field label="Énoncé" error={errors.statement}>
              {(id) => <Textarea id={id} value={draft.statement} onChange={(e) => patch({ statement: e.target.value })} aria-invalid={!!errors.statement} autoFocus />}
            </Field>
            <Field label="Réponse">
              {(id) => (
                <Select id={id} value={draft.answer ? 'true' : 'false'} onChange={(e) => patch({ answer: e.target.value === 'true' })}>
                  <option value="true">Vrai</option>
                  <option value="false">Faux</option>
                </Select>
              )}
            </Field>
            <Field label="Énoncé corrigé" hint="La version vraie de l’énoncé ; identique à l’énoncé s’il est vrai.">
              {(id) => <Textarea id={id} value={draft.correctedStatement} onChange={(e) => patch({ correctedStatement: e.target.value })} />}
            </Field>
            <Field label="Explication (optionnel)">{(id) => <Textarea id={id} value={draft.explanation} onChange={(e) => patch({ explanation: e.target.value })} />}</Field>
          </>
        )}

        {draft.type === 'match' && (
          <>
            <Field label="Consigne (optionnel)">{(id) => <Input id={id} value={draft.instruction} onChange={(e) => patch({ instruction: e.target.value })} />}</Field>
            <Field label="Paires" hint="Une paire par ligne : terme | définition" error={errors.pairsText}>
              {(id) => <Textarea id={id} value={draft.pairsText} onChange={(e) => patch({ pairsText: e.target.value })} aria-invalid={!!errors.pairsText} className="font-mono text-sm" autoFocus />}
            </Field>
          </>
        )}

        {draft.type === 'order' && (
          <>
            <Field label="Consigne" error={errors.instruction}>
              {(id) => <Input id={id} value={draft.instruction} onChange={(e) => patch({ instruction: e.target.value })} aria-invalid={!!errors.instruction} autoFocus />}
            </Field>
            <Field label="Éléments" hint="Un élément par ligne, dans le bon ordre." error={errors.itemsText}>
              {(id) => <Textarea id={id} value={draft.itemsText} onChange={(e) => patch({ itemsText: e.target.value })} aria-invalid={!!errors.itemsText} className="font-mono text-sm" />}
            </Field>
          </>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Difficulté">
            {(id) => (
              <Select id={id} value={difficulty} onChange={(e) => setDifficulty(Number(e.target.value) as Difficulty)}>
                <option value={1}>Facile</option>
                <option value={2}>Moyen</option>
                <option value={3}>Difficile</option>
              </Select>
            )}
          </Field>
          <Field label="Tags" hint="Séparés par des virgules">
            {(id) => <Input id={id} value={tags} onChange={(e) => setTags(e.target.value)} />}
          </Field>
          <Field label="Point de cours">
            {(id) => (
              <Select id={id} value={pointId} onChange={(e) => setPointId(e.target.value)}>
                <option value="">Aucun</option>
                {sortedPoints.map((p) => (
                  <option key={p.id} value={p.id}>
                    {POINT_NATURE_LABELS[p.nature]} : {p.title}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        <Card className="p-4">
          <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-muted">Aperçu</p>
          <ExerciseReadout data={previewData} />
          <div className="mt-4 border-t border-line pt-3">
            <LintIssueList issues={issues} />
          </div>
        </Card>
      </form>
    </Modal>
  )
}
