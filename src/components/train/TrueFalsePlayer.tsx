import { useCallback, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Check, X } from '@phosphor-icons/react'
import { similarity } from '../../lib/dedupe'
import type { Grade } from '../../types'
import { Button, Kbd, cx } from '../ui'
import { Markdown } from '../Markdown'
import { Feedback } from './Feedback'
import { useKeys, type PlayerProps } from './shared'

/** Below this similarity the written correction is judged weak: right verdict, "Difficile". */
const CORRECTION_THRESHOLD = 0.45

/**
 * Vrai/Faux only makes sense as "vrai/faux + corrige l'énoncé" (plain V/F is a
 * coin flip): choosing "Faux" requires writing the corrected statement before
 * the answer is revealed.
 */
export function TrueFalsePlayer({ data, deferFeedback = false, onAnswer }: PlayerProps<'truefalse'>) {
  const reduced = useReducedMotion()
  const [picked, setPicked] = useState<boolean | null>(null)
  const [correction, setCorrection] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const needsCorrection = picked === false && !!data.correctedStatement?.trim()
  const answered = picked !== null && (!needsCorrection || submitted)
  const isCorrect = answered && picked === data.answer

  const finish = useCallback(
    (value: boolean, written: string) => {
      const right = value === data.answer
      let grade: Grade = right ? 'good' : 'again'
      let weak = false
      if (right && value === false && data.correctedStatement?.trim()) {
        weak = similarity(written, data.correctedStatement) < CORRECTION_THRESHOLD
        if (weak) grade = 'hard'
      }
      return { correct: right, grade, weak }
    },
    [data.answer, data.correctedStatement],
  )

  const [outcome, setOutcome] = useState<{ correct: boolean; grade: Grade; weak: boolean } | null>(null)

  const choose = useCallback(
    (v: boolean) => {
      if (picked !== null) return
      setPicked(v)
      const requires = v === false && !!data.correctedStatement?.trim()
      if (!requires) {
        const o = finish(v, '')
        setOutcome(o)
        if (deferFeedback) onAnswer({ correct: o.correct, grade: o.grade })
      }
    },
    [picked, data.correctedStatement, finish, deferFeedback, onAnswer],
  )

  const submitCorrection = useCallback(() => {
    if (picked !== false || submitted) return
    setSubmitted(true)
    const o = finish(false, correction)
    setOutcome(o)
    if (deferFeedback) onAnswer({ correct: o.correct, grade: o.grade })
  }, [picked, submitted, finish, correction, deferFeedback, onAnswer])

  useKeys(
    picked === null,
    useCallback(
      (e: KeyboardEvent) => {
        const k = e.key.toLowerCase()
        if (k === 'v' || e.key === 'ArrowLeft') {
          e.preventDefault()
          choose(true)
        } else if (k === 'f' || e.key === 'ArrowRight') {
          e.preventDefault()
          choose(false)
        }
      },
      [choose],
    ),
  )

  const options: { value: boolean; label: string; keys: string; icon: typeof Check }[] = [
    { value: true, label: 'Vrai', keys: 'V', icon: Check },
    { value: false, label: 'Faux', keys: 'F', icon: X },
  ]

  return (
    <div className="flex flex-col gap-6">
      <p className="text-xl leading-snug font-medium text-ink md:text-2xl">
        <Markdown inline text={data.statement} />
      </p>

      <div className="grid grid-cols-2 gap-3">
        {options.map((o) => {
          const selected = picked === o.value
          const showOk = answered && !deferFeedback && o.value === data.answer
          const showBad = answered && !deferFeedback && selected && !showOk
          const Icon = o.icon
          return (
            <motion.button
              key={o.label}
              type="button"
              autoFocus={o.value}
              disabled={picked !== null}
              aria-pressed={selected}
              onClick={() => choose(o.value)}
              animate={selected && !reduced ? { scale: [1, 1.02, 1] } : undefined}
              transition={{ duration: 0.25 }}
              className={cx(
                'flex h-20 flex-col items-center justify-center gap-1 rounded-lg border text-lg font-semibold press ring-focus disabled:pointer-events-none',
                picked === null && 'border-line-strong bg-surface hover:bg-surface-2',
                picked !== null && !answered && selected && 'border-accent bg-accent-soft',
                showOk && 'border-ok bg-ok-soft text-ok',
                showBad && 'border-bad bg-bad-soft text-bad',
                answered && !showOk && !showBad && 'border-line text-muted',
              )}
            >
              <span className="flex items-center gap-2">
                <Icon size={20} weight="bold" />
                {o.label}
              </span>
              {picked === null && (
                <span className="text-xs font-normal text-muted">
                  <Kbd>{o.keys}</Kbd>
                </span>
              )}
            </motion.button>
          )
        })}
      </div>

      {needsCorrection && !submitted && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            submitCorrection()
          }}
        >
          <label className="text-sm font-medium" htmlFor="tf-correction">
            Écris l’énoncé corrigé avant de voir la réponse
          </label>
          <textarea
            id="tf-correction"
            autoFocus
            value={correction}
            onChange={(e) => setCorrection(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submitCorrection()
              }
            }}
            placeholder="La version vraie de l’affirmation…"
            className="min-h-20 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-base leading-relaxed text-ink ring-focus"
          />
          <div className="flex items-center gap-3">
            <Button type="submit" size="lg" disabled={!correction.trim()}>
              <Check size={18} weight="bold" />
              Valider
            </Button>
            <span className="hidden text-xs text-muted sm:inline">
              <Kbd>Entrée</Kbd>
            </span>
          </div>
        </form>
      )}

      {answered && !deferFeedback && outcome && (
        <Feedback
          correct={isCorrect}
          expected={
            <>
              {data.answer ? 'Vrai' : 'Faux'}
              {!data.answer && data.correctedStatement?.trim() && (
                <span className="mt-1 block font-normal">
                  <span className="text-muted">Énoncé corrigé : </span>
                  <Markdown inline text={data.correctedStatement} />
                </span>
              )}
            </>
          }
          explanation={[isCorrect && outcome.weak ? 'Verdict juste, mais ta correction s’éloigne de l’énoncé attendu : noté « Difficile ».' : '', isCorrect && !outcome.weak && picked === false && data.correctedStatement?.trim() ? `Énoncé attendu : ${data.correctedStatement}` : '', data.explanation ?? ''].filter(Boolean).join('\n\n') || undefined}
          onContinue={() => onAnswer({ correct: outcome.correct, grade: outcome.grade })}
        />
      )}
    </div>
  )
}
