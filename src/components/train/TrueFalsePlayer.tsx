import { useCallback, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Check, X } from 'lucide-react'
import type { Grade } from '../../types'
import { trueFalseOutcome, type TrueFalseOutcome } from '../../lib/truefalse'
import { Button, Kbd, cx } from '../ui'
import { Markdown } from '../Markdown'
import { Feedback } from './Feedback'
import { useKeys, type PlayerProps } from './shared'

const GRADES: { grade: Grade; label: string; key: string; correct: boolean }[] = [
  { grade: 'again', label: 'Encore', key: '1', correct: false },
  { grade: 'hard', label: 'Difficile', key: '2', correct: false },
  { grade: 'good', label: 'Bien', key: '3', correct: true },
  { grade: 'easy', label: 'Facile', key: '4', correct: true },
]

/**
 * Vrai/Faux only makes sense as "vrai/faux + corrige l'énoncé" (plain V/F is a
 * coin flip): choosing "Faux" requires writing the corrected statement before
 * the answer is revealed. The verdict is auto-graded; the written correction
 * is compared side by side with the expected one and the grade stays the
 * student's call (a right correction phrased differently is still right).
 */
export function TrueFalsePlayer({ data, deferFeedback = false, onAnswer }: PlayerProps<'truefalse'>) {
  const reduced = useReducedMotion()
  const [picked, setPicked] = useState<boolean | null>(null)
  const [correction, setCorrection] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [outcome, setOutcome] = useState<TrueFalseOutcome | null>(null)
  const needsCorrection = picked === false && !!data.correctedStatement?.trim()
  const answered = picked !== null && (!needsCorrection || submitted)
  const isCorrect = answered && picked === data.answer

  const settle = useCallback(
    (value: boolean, written: string) => {
      const o = trueFalseOutcome(value, data.answer, written, data.correctedStatement)
      setOutcome(o)
      if (deferFeedback) onAnswer({ correct: o.correct, grade: o.suggested })
    },
    [data.answer, data.correctedStatement, deferFeedback, onAnswer],
  )

  const choose = useCallback(
    (v: boolean) => {
      if (picked !== null) return
      setPicked(v)
      const requires = v === false && !!data.correctedStatement?.trim()
      if (!requires) settle(v, '')
    },
    [picked, data.correctedStatement, settle],
  )

  const submitCorrection = useCallback(() => {
    if (picked !== false || submitted) return
    setSubmitted(true)
    settle(false, correction)
  }, [picked, submitted, settle, correction])

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

  const gradeOpen = !!outcome?.open && !deferFeedback
  useKeys(
    gradeOpen,
    useCallback(
      (e: KeyboardEvent) => {
        const hit = GRADES.find((g) => g.key === e.key)
        if (hit && outcome) {
          e.preventDefault()
          onAnswer({ correct: outcome.correct, grade: hit.grade })
        }
      },
      [onAnswer, outcome],
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
                <Icon size={20} />
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
              <Check size={18} />
              Valider
            </Button>
            <span className="hidden text-xs text-muted sm:inline">
              <Kbd>Entrée</Kbd>
            </span>
          </div>
        </form>
      )}

      {/* Right verdict with a written correction: side by side, grade left to the student. */}
      {gradeOpen && outcome && (
        <motion.div initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : 0.2, ease: 'easeOut' }} className="mt-2 flex flex-col gap-4 border-t border-line pt-5">
          <div className="flex items-start gap-3 rounded-lg bg-ok-soft px-4 py-3 text-ok">
            <Check size={22} className="mt-0.5 shrink-0" />
            <p className="font-semibold">Verdict juste : c’est bien faux.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm">
              <p className="mb-1 text-xs text-muted">Ta correction</p>
              <p className="whitespace-pre-wrap text-ink">{correction}</p>
            </div>
            <div className="rounded-lg border border-ok/50 bg-ok-soft/50 px-3 py-2 text-sm">
              <p className="mb-1 text-xs text-muted">Énoncé attendu</p>
              <Markdown text={data.correctedStatement ?? ''} />
            </div>
          </div>
          {data.explanation && (
            <div className="text-sm leading-relaxed text-muted">
              <Markdown text={data.explanation} />
            </div>
          )}
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted">
              Ta correction dit-elle la même chose ? {outcome.suggested === 'hard' ? 'Elle s’éloigne de la formulation attendue : « Difficile » est proposé, mais si le sens est le même, choisis « Bien ».' : '« Bien » est proposé.'}
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {GRADES.map((g) => (
                <button
                  key={g.grade}
                  type="button"
                  autoFocus={g.grade === outcome.suggested}
                  onClick={() => onAnswer({ correct: outcome.correct, grade: g.grade })}
                  className={cx(
                    'flex h-14 items-center justify-center gap-1.5 rounded-lg border text-sm font-medium press ring-focus',
                    g.correct ? 'border-ok bg-ok-soft text-ok hover:opacity-90' : 'border-bad bg-bad-soft text-bad hover:opacity-90',
                    outcome.suggested === g.grade && 'ring-2 ring-accent ring-offset-2 ring-offset-surface',
                  )}
                >
                  {g.label}
                  <Kbd>{g.key}</Kbd>
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* Wrong verdict, or right "Vrai": auto-graded, one button to continue. */}
      {answered && !deferFeedback && outcome && !outcome.open && (
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
          explanation={data.explanation}
          continueLabel={isCorrect ? 'Continuer' : 'Continuer (Encore)'}
          onContinue={() => onAnswer({ correct: outcome.correct, grade: outcome.suggested })}
        />
      )}
    </div>
  )
}
