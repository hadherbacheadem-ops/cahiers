import { useCallback, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Check, CheckSquare, Square } from '@phosphor-icons/react'
import { gradeFromCorrect } from '../../lib/srs'
import { Button, Kbd, cx } from '../ui'
import { Markdown } from '../Markdown'
import { Feedback } from './Feedback'
import { letterFor, useKeys, type PlayerProps } from './shared'

export function McqPlayer({ data, deferFeedback = false, onAnswer }: PlayerProps<'mcq'>) {
  const reduced = useReducedMotion()
  const multi = data.correct.length > 1
  const correctSet = new Set(data.correct)
  const [picked, setPicked] = useState<number[]>([])
  const [answered, setAnswered] = useState(false)

  const isCorrect = answered && picked.length === correctSet.size && picked.every((i) => correctSet.has(i))

  const validate = useCallback(
    (selection: number[]) => {
      if (selection.length === 0) return
      setPicked(selection)
      setAnswered(true)
      if (deferFeedback) {
        const ok = selection.length === correctSet.size && selection.every((i) => correctSet.has(i))
        onAnswer({ correct: ok, grade: gradeFromCorrect(ok) })
      }
    },
    [deferFeedback, correctSet, onAnswer],
  )

  const choose = useCallback(
    (i: number) => {
      if (answered) return
      if (!multi) {
        validate([i])
        return
      }
      setPicked((prev) => (prev.includes(i) ? prev.filter((p) => p !== i) : [...prev, i].sort((a, b) => a - b)))
    },
    [answered, multi, validate],
  )

  useKeys(
    !answered,
    useCallback(
      (e: KeyboardEvent) => {
        const k = e.key
        let idx = -1
        if (/^[1-9]$/.test(k)) idx = Number(k) - 1
        else if (/^[a-zA-Z]$/.test(k)) idx = k.toUpperCase().charCodeAt(0) - 65
        if (idx >= 0 && idx < data.choices.length) {
          e.preventDefault()
          choose(idx)
          return
        }
        if (multi && k === 'Enter' && picked.length > 0) {
          e.preventDefault()
          validate(picked)
        }
      },
      [choose, data.choices.length, multi, picked, validate],
    ),
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-xl leading-snug font-medium text-ink md:text-2xl">
          <Markdown inline text={data.question} />
        </p>
        {multi && <p className="text-sm text-muted">Plusieurs réponses possibles.</p>}
      </div>

      <div role={multi ? 'group' : 'radiogroup'} className="flex flex-col gap-2">
        {data.choices.map((choice, i) => {
          const selected = picked.includes(i)
          const isRight = correctSet.has(i)
          const showOk = answered && isRight
          const showBad = answered && selected && !isRight
          return (
            <motion.button
              key={i}
              type="button"
              role={multi ? 'checkbox' : 'radio'}
              aria-checked={selected}
              disabled={answered}
              onClick={() => choose(i)}
              animate={answered && selected && !reduced ? { scale: [1, 1.015, 1] } : undefined}
              transition={{ duration: 0.25 }}
              className={cx(
                'flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left text-base press ring-focus disabled:pointer-events-none',
                !answered && !selected && 'border-line-strong bg-surface hover:bg-surface-2',
                !answered && selected && 'border-accent bg-accent-soft',
                showOk && 'border-ok bg-ok-soft text-ok',
                showBad && 'border-bad bg-bad-soft text-bad',
                answered && !showOk && !showBad && 'border-line text-muted',
              )}
            >
              <span
                className={cx(
                  'flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold',
                  showOk ? 'bg-ok text-white' : showBad ? 'bg-bad text-white' : selected ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-muted',
                )}
              >
                {letterFor(i)}
              </span>
              <span className="flex-1 leading-snug">
                <Markdown inline text={choice} />
                {answered && !isRight && data.distractorReasons?.[i]?.trim() && (
                  <span className="mt-0.5 block text-xs font-normal text-muted">
                    <Markdown inline text={data.distractorReasons[i]} />
                  </span>
                )}
              </span>
              {multi && !answered && (
                <span className="shrink-0 text-muted">{selected ? <CheckSquare size={20} weight="fill" className="text-accent" /> : <Square size={20} />}</span>
              )}
            </motion.button>
          )
        })}
      </div>

      {!answered && multi && (
        <div className="flex items-center gap-3">
          <Button size="lg" disabled={picked.length === 0} onClick={() => validate(picked)}>
            <Check size={18} weight="bold" />
            Valider
          </Button>
          <span className="hidden text-xs text-muted sm:inline">
            <Kbd>Entrée</Kbd>
          </span>
        </div>
      )}
      {!answered && !multi && (
        <p className="text-xs text-muted">
          Touches <Kbd>1</Kbd>–<Kbd>{data.choices.length}</Kbd> ou <Kbd>A</Kbd>–<Kbd>{letterFor(data.choices.length - 1)}</Kbd>
        </p>
      )}

      {answered && !deferFeedback && (
        <Feedback
          correct={isCorrect}
          expected={<Markdown inline text={data.correct.map((i) => data.choices[i]).join(', ')} />}
          explanation={data.explanation}
          onContinue={() => onAnswer({ correct: isCorrect, grade: gradeFromCorrect(isCorrect) })}
        />
      )}
    </div>
  )
}
