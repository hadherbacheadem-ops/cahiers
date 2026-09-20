import { useMemo, useState } from 'react'
import { Check } from 'lucide-react'
import { gradeFromCorrect } from '../../lib/srs'
import { offeredTypes, reactionLabel, reactionLong } from '../../lib/reactionTypes'
import type { MechanismStep } from '../../types'
import { Button, cx } from '../ui'
import { Markdown } from '../Markdown'
import { StepScheme } from '../MechanismScheme'
import { Feedback } from './Feedback'
import type { PlayerProps } from './shared'

const isRight = (step: MechanismStep, choice: string | undefined) => !!choice && (choice === step.answer || !!step.alsoAccept?.includes(choice))

/**
 * A mechanism cut into elementary steps: name the type of reaction of every step (SN1, SN2, AdN, redox…).
 * Right only when every step is right; the correction names each step's type and says why.
 */
export function MecanismePlayer({ data, deferFeedback = false, onAnswer }: PlayerProps<'mecanisme'>) {
  const steps = data.steps
  const types = useMemo(() => offeredTypes(steps.flatMap((s) => [s.answer, ...(s.alsoAccept ?? [])])), [steps])
  const [choices, setChoices] = useState<(string | undefined)[]>(() => steps.map(() => undefined))
  const [answered, setAnswered] = useState(false)

  const allChosen = choices.every(Boolean)
  const ok = steps.map((s, i) => isRight(s, choices[i]))
  const allRight = ok.every(Boolean)

  const validate = () => {
    if (answered || !allChosen) return
    setAnswered(true)
    if (deferFeedback) onAnswer({ correct: allRight, grade: gradeFromCorrect(allRight) })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-xl leading-snug font-medium text-ink md:text-2xl">{data.title}</p>
        <div className="text-base">
          <Markdown text={data.statement} />
        </div>
        <p className="text-sm text-muted">Donne le type de réaction de chaque étape.</p>
      </div>

      <ol className="flex flex-col gap-5">
        {steps.map((step, i) => (
          <li key={i} className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-line bg-surface p-4">
            <div className="flex gap-3">
              <span
                className={cx(
                  'flex size-7 shrink-0 items-center justify-center rounded-md text-sm font-semibold',
                  answered ? (ok[i] ? 'bg-ok text-white' : 'bg-bad text-white') : choices[i] ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-muted',
                )}
                aria-hidden
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1 text-base">
                <Markdown text={step.text} />
              </div>
            </div>
            <StepScheme step={step} />
            <div role="radiogroup" aria-label={`Type de réaction de l’étape ${i + 1}`} className="flex flex-wrap gap-2">
              {types.map((t) => {
                const selected = choices[i] === t.id
                const isAnswer = t.id === step.answer || !!step.alsoAccept?.includes(t.id)
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    data-action="type-reaction"
                    disabled={answered}
                    onClick={() => setChoices((prev) => prev.map((c, j) => (j === i ? t.id : c)))}
                    title={t.long}
                    className={cx(
                      'min-h-11 rounded-lg border px-3 text-sm font-medium press ring-focus disabled:pointer-events-none',
                      answered && isAnswer && 'border-ok bg-ok-soft text-ok',
                      answered && selected && !isAnswer && 'border-bad bg-bad-soft text-bad',
                      answered && !isAnswer && !selected && 'border-line text-muted opacity-60',
                      !answered && (selected ? 'border-accent bg-accent-soft text-accent-text ring-2 ring-accent/40' : 'border-line bg-surface-2 hover:border-line-strong hover:bg-surface-3'),
                    )}
                  >
                    {t.label}
                  </button>
                )
              })}
            </div>
            {answered && (
              <p className="text-sm">
                <span className={cx('font-medium', ok[i] ? 'text-ok' : 'text-bad')}>{ok[i] ? 'Juste' : 'Réponse'} : </span>
                {reactionLabel(step.answer)} <span className="text-muted">({reactionLong(step.answer)})</span>
                {step.explanation && <span className="mt-1 block text-muted">{step.explanation}</span>}
              </p>
            )}
          </li>
        ))}
      </ol>

      {!answered ? (
        <div className="flex items-center gap-3">
          <Button size="lg" disabled={!allChosen} onClick={validate}>
            <Check size={18} />
            Valider
          </Button>
          {!allChosen && (
            <span className="text-xs text-muted">
              {choices.filter(Boolean).length} / {steps.length} étapes
            </span>
          )}
        </div>
      ) : deferFeedback ? null : (
        <Feedback correct={allRight} onContinue={() => onAnswer({ correct: allRight, grade: gradeFromCorrect(allRight) })} />
      )}
    </div>
  )
}
