import { useMemo, useState, type FormEvent } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Check } from '@phosphor-icons/react'
import { gradeFromCorrect } from '../../lib/srs'
import { matchesAnswer, parseCloze } from '../../lib/cloze'
import { Button, Kbd, cx } from '../ui'
import { Feedback } from './Feedback'
import type { PlayerProps } from './shared'

export function ClozePlayer({ data, onAnswer }: PlayerProps<'cloze'>) {
  const reduced = useReducedMotion()
  const segments = useMemo(() => parseCloze(data.text), [data.text])
  const blanks = useMemo(() => segments.filter((s) => s.kind === 'blank'), [segments])
  const [values, setValues] = useState<string[]>(() => blanks.map(() => ''))
  const [results, setResults] = useState<boolean[] | null>(null)

  const answered = results !== null
  const correct = answered && results.every(Boolean)

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if (answered) return
    setResults(blanks.map((b, i) => matchesAnswer(values[i] ?? '', b.answers)))
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <p className="text-sm text-muted">Complétez les trous.</p>

      <p className="text-xl leading-loose text-ink md:text-2xl">
        {segments.map((seg, i) => {
          if (seg.kind === 'text') return <span key={i}>{seg.value}</span>
          const longest = Math.max(...seg.answers.map((a) => a.length))
          const width = `${Math.max(6, longest + 2)}ch`
          const ok = results?.[seg.index]
          return (
            <span key={i} className="inline-flex items-baseline">
              <motion.input
                type="text"
                autoFocus={seg.index === 0}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                aria-label={`Trou ${seg.index + 1}`}
                value={values[seg.index] ?? ''}
                disabled={answered}
                onChange={(e) => {
                  const next = values.slice()
                  next[seg.index] = e.target.value
                  setValues(next)
                }}
                animate={answered && !reduced ? { scale: [1, 1.04, 1] } : undefined}
                transition={{ duration: 0.25 }}
                style={{ width }}
                className={cx(
                  'mx-1 inline-block rounded-lg border bg-surface px-2 text-center leading-normal text-ink ring-focus disabled:opacity-100',
                  !answered && 'border-line-strong',
                  answered && ok && 'border-ok bg-ok-soft text-ok',
                  answered && !ok && 'border-bad bg-bad-soft text-bad line-through',
                )}
              />
              {answered && !ok && <span className="mr-1 text-base font-medium text-ok">{seg.answers[0]}</span>}
            </span>
          )
        })}
      </p>

      {!answered ? (
        <div className="flex items-center gap-3">
          <Button type="submit" size="lg">
            <Check size={18} weight="bold" />
            Valider
          </Button>
          <span className="hidden text-xs text-muted sm:inline">
            <Kbd>Entrée</Kbd>
          </span>
        </div>
      ) : (
        <Feedback correct={correct} onContinue={() => onAnswer({ correct, grade: gradeFromCorrect(correct) })} />
      )}
    </form>
  )
}
