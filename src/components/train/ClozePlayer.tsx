import { useMemo, useState, type FormEvent } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Check } from 'lucide-react'
import { gradeFromCorrect } from '../../lib/srs'
import { blankInsideMath, clozeDisplayText, matchesAnswer, parseCloze } from '../../lib/cloze'
import type { Confidence } from '../../types'
import { Button, Kbd, cx } from '../ui'
import { Markdown } from '../Markdown'
import { ConfidencePicker } from './ConfidencePicker'
import { Feedback } from './Feedback'
import type { PlayerProps } from './shared'

export function ClozePlayer({ data, deferFeedback = false, askConfidence = false, chrono = false, onAnswer }: PlayerProps<'cloze'>) {
  const reduced = useReducedMotion()
  const [confidence, setConfidence] = useState<Confidence | undefined>()
  const segments = useMemo(() => parseCloze(data.text), [data.text])
  const blanks = useMemo(() => segments.filter((s) => s.kind === 'blank'), [segments])
  // A blank inside a formula cannot host an input: show the sentence with a boxed gap, inputs below.
  const mathLayout = useMemo(() => blankInsideMath(data.text), [data.text])
  const [values, setValues] = useState<string[]>(() => blanks.map(() => ''))
  const [results, setResults] = useState<boolean[] | null>(null)

  const answered = results !== null
  const correct = answered && results.every(Boolean)

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if (answered) return
    const res = blanks.map((b, i) => matchesAnswer(values[i] ?? '', b.answers))
    setResults(res)
    if (deferFeedback) {
      const ok = res.every(Boolean)
      onAnswer({ correct: ok, grade: gradeFromCorrect(ok), confidence })
    }
  }

  const renderInput = (index: number, answers: string[]) => {
    const longest = Math.max(...answers.map((a) => a.length))
    const width = `${Math.max(6, Math.min(40, longest + 2))}ch`
    const ok = results?.[index]
    return (
      <span className="inline-flex items-baseline">
        <motion.input
          type="text"
          autoFocus={index === 0}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-label={`Trou ${index + 1}`}
          value={values[index] ?? ''}
          disabled={answered}
          onChange={(e) => {
            const next = values.slice()
            next[index] = e.target.value
            setValues(next)
          }}
          animate={answered && !reduced ? { scale: [1, 1.04, 1] } : undefined}
          transition={{ duration: 0.25 }}
          style={{ width }}
          className={cx(
            'mx-1 inline-block rounded-[var(--radius-sm)] border bg-surface-2 px-2 text-center leading-normal text-ink ring-focus disabled:opacity-100',
            !answered && 'border-line-strong',
            answered && ok && 'border-ok bg-ok-soft text-ok',
            answered && !ok && 'border-bad bg-bad-soft text-bad line-through',
          )}
        />
        {answered && !ok && (
          <span className="mr-1 text-base font-medium text-ok">
            <Markdown inline text={answers[0]} />
          </span>
        )}
      </span>
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <p className="text-sm text-muted">{mathLayout ? 'Complétez la formule.' : 'Complétez les trous.'}</p>

      {mathLayout ? (
        <div className="flex flex-col gap-4">
          <div className="text-xl leading-loose text-ink md:text-2xl">
            <Markdown text={clozeDisplayText(data.text, answered)} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {blanks.map((b) => (
              <label key={b.index} className="flex items-center gap-2 text-sm text-muted">
                {blanks.length > 1 ? `Trou ${b.index + 1} :` : 'Réponse :'}
                {renderInput(b.index, b.answers)}
              </label>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xl leading-loose text-ink md:text-2xl">
          {segments.map((seg, i) => (seg.kind === 'text' ? <Markdown key={i} inline text={seg.value} /> : <span key={i}>{renderInput(seg.index, seg.answers)}</span>))}
        </p>
      )}

      {!answered ? (
        <div className="flex flex-col gap-4">
          {askConfidence && !chrono && <ConfidencePicker value={confidence} onChange={setConfidence} active={false} />}
          <div className="flex items-center gap-3">
            <Button type="submit" size="lg">
              <Check size={18} />
              Valider
            </Button>
            <span className="hidden text-xs text-muted sm:inline">
              <Kbd>Entrée</Kbd>
            </span>
          </div>
        </div>
      ) : deferFeedback ? null : (
        <Feedback correct={correct} onContinue={() => onAnswer({ correct, grade: gradeFromCorrect(correct), confidence })} />
      )}
    </form>
  )
}
