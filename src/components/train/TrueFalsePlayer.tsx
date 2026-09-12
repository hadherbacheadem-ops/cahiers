import { useCallback, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Check, X } from '@phosphor-icons/react'
import { gradeFromCorrect } from '../../lib/srs'
import { Kbd, cx } from '../ui'
import { Markdown } from '../Markdown'
import { Feedback } from './Feedback'
import { useKeys, type PlayerProps } from './shared'

export function TrueFalsePlayer({ data, onAnswer }: PlayerProps<'truefalse'>) {
  const reduced = useReducedMotion()
  const [picked, setPicked] = useState<boolean | null>(null)
  const answered = picked !== null
  const isCorrect = answered && picked === data.answer

  const choose = useCallback(
    (v: boolean) => {
      setPicked((prev) => (prev === null ? v : prev))
    },
    [],
  )

  useKeys(
    !answered,
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
          const showOk = answered && o.value === data.answer
          const showBad = answered && selected && !showOk
          const Icon = o.icon
          return (
            <motion.button
              key={o.label}
              type="button"
              autoFocus={o.value}
              disabled={answered}
              aria-pressed={selected}
              onClick={() => choose(o.value)}
              animate={selected && !reduced ? { scale: [1, 1.02, 1] } : undefined}
              transition={{ duration: 0.25 }}
              className={cx(
                'flex h-20 flex-col items-center justify-center gap-1 rounded-lg border text-lg font-semibold press ring-focus disabled:pointer-events-none',
                !answered && 'border-line-strong bg-surface hover:bg-surface-2',
                showOk && 'border-ok bg-ok-soft text-ok',
                showBad && 'border-bad bg-bad-soft text-bad',
                answered && !showOk && !showBad && 'border-line text-muted',
              )}
            >
              <span className="flex items-center gap-2">
                <Icon size={20} weight="bold" />
                {o.label}
              </span>
              {!answered && (
                <span className="text-xs font-normal text-muted">
                  <Kbd>{o.keys}</Kbd>
                </span>
              )}
            </motion.button>
          )
        })}
      </div>

      {answered && (
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
          onContinue={() => onAnswer({ correct: isCorrect, grade: gradeFromCorrect(isCorrect) })}
        />
      )}
    </div>
  )
}
