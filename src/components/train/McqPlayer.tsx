import { useCallback, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Check, CheckSquare, Square } from '@phosphor-icons/react'
import type { Grade } from '../../types'
import { gradeFromCorrect } from '../../lib/srs'
import { useSettings } from '../../lib/useSettings'
import { Button, Kbd, cx } from '../ui'
import { Markdown } from '../Markdown'
import { Feedback } from './Feedback'
import { letterFor, useKeys, type PlayerProps } from './shared'

/** Confidence-weighted score → rating (score = share of confidence put on the right answer). */
function weightedGrade(score: number): Grade {
  if (score >= 0.75) return 'good'
  if (score >= 0.5) return 'hard'
  return 'again'
}

export function McqPlayer({ data, deferFeedback = false, chrono = false, onAnswer }: PlayerProps<'mcq'>) {
  const reduced = useReducedMotion()
  const settings = useSettings()
  const multi = data.correct.length > 1
  // Sparck, Bjork & Bjork 2016: splitting one's confidence between two alternatives beats plain MCQ; single study, opt-in.
  const weighted = !!settings?.weightedMcq && !multi && !chrono
  const correctSet = new Set(data.correct)
  const [picked, setPicked] = useState<number[]>([])
  const [answered, setAnswered] = useState(false)
  const [confidence, setConfidence] = useState(0.75)
  const [score, setScore] = useState<number | null>(null)

  const isCorrect = answered && (weighted ? (score ?? 0) >= 0.5 : picked.length === correctSet.size && picked.every((i) => correctSet.has(i)))

  const validate = useCallback(
    (selection: number[]) => {
      if (selection.length === 0) return
      setPicked(selection)
      setAnswered(true)
      if (weighted) {
        const [primary, secondary] = selection
        const s = correctSet.has(primary) ? (secondary === undefined ? 1 : confidence) : secondary !== undefined && correctSet.has(secondary) ? 1 - confidence : 0
        setScore(s)
        if (deferFeedback) onAnswer({ correct: s >= 0.5, grade: weightedGrade(s) })
        return
      }
      if (deferFeedback) {
        const ok = selection.length === correctSet.size && selection.every((i) => correctSet.has(i))
        onAnswer({ correct: ok, grade: gradeFromCorrect(ok) })
      }
    },
    [deferFeedback, correctSet, onAnswer, weighted, confidence],
  )

  const choose = useCallback(
    (i: number) => {
      if (answered) return
      if (weighted) {
        // First pick = main answer, second pick = the alternative you hesitate with.
        setPicked((prev) => {
          if (prev.includes(i)) return prev.filter((p) => p !== i)
          if (prev.length === 0) return [i]
          return [prev[0], i]
        })
        return
      }
      if (!multi) {
        validate([i])
        return
      }
      setPicked((prev) => (prev.includes(i) ? prev.filter((p) => p !== i) : [...prev, i].sort((a, b) => a - b)))
    },
    [answered, multi, validate, weighted],
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
        if ((multi || weighted) && k === 'Enter' && picked.length > 0) {
          e.preventDefault()
          validate(picked)
        }
      },
      [choose, data.choices.length, multi, weighted, picked, validate],
    ),
  )

  const pct = Math.round(confidence * 100)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-xl leading-snug font-medium text-ink md:text-2xl">
          <Markdown inline text={data.question} />
        </p>
        {multi && <p className="text-sm text-muted">Plusieurs réponses possibles.</p>}
        {weighted && <p className="text-sm text-muted">Choisis ta réponse ; si tu hésites, choisis aussi l’autre option et répartis ta confiance.</p>}
      </div>

      <div role={multi ? 'group' : 'radiogroup'} className="flex flex-col gap-2">
        {data.choices.map((choice, i) => {
          const selected = picked.includes(i)
          const isRight = correctSet.has(i)
          const showOk = answered && isRight
          const showBad = answered && selected && !isRight
          const rank = weighted && selected ? picked.indexOf(i) : -1
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
              {weighted && !answered && rank >= 0 && <span className="shrink-0 text-xs font-medium text-accent tabular-nums">{rank === 0 ? `${picked.length > 1 ? pct : 100} %` : `${100 - pct} %`}</span>}
              {multi && !answered && (
                <span className="shrink-0 text-muted">{selected ? <CheckSquare size={20} weight="fill" className="text-accent" /> : <Square size={20} />}</span>
              )}
            </motion.button>
          )
        })}
      </div>

      {weighted && !answered && picked.length === 2 && (
        <label className="flex flex-col gap-1.5 text-sm">
          <span>
            Confiance sur {letterFor(picked[0])} : <span className="font-medium tabular-nums">{pct} %</span> · sur {letterFor(picked[1])} : <span className="font-medium tabular-nums">{100 - pct} %</span>
          </span>
          <input type="range" min={0.5} max={0.95} step={0.05} value={confidence} onChange={(e) => setConfidence(e.target.valueAsNumber)} className="w-full max-w-sm accent-accent" aria-label="Répartition de la confiance" />
        </label>
      )}

      {!answered && (multi || weighted) && (
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
      {!answered && !multi && !weighted && (
        <p className="text-xs text-muted">
          Touches <Kbd>1</Kbd>–<Kbd>{data.choices.length}</Kbd> ou <Kbd>A</Kbd>–<Kbd>{letterFor(data.choices.length - 1)}</Kbd>
        </p>
      )}

      {answered && !deferFeedback && (
        <Feedback
          correct={isCorrect}
          expected={<Markdown inline text={data.correct.map((i) => data.choices[i]).join(', ')} />}
          explanation={[weighted && score !== null ? `Score pondéré : ${Math.round(score * 100)} % de confiance sur la bonne réponse${score >= 0.75 ? '' : score >= 0.5 ? ' : noté « Difficile »' : ' : noté « Encore »'}.` : '', data.explanation ?? ''].filter(Boolean).join('\n\n') || undefined}
          onContinue={() => onAnswer({ correct: isCorrect, grade: weighted && score !== null ? weightedGrade(score) : gradeFromCorrect(isCorrect) })}
        />
      )}
    </div>
  )
}
