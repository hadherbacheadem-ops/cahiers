import { useCallback, useMemo, useState } from 'react'
import { CircleQuestionMark, Eye } from 'lucide-react'
import type { Confidence } from '../../types'
import { Badge, Button, Kbd, cx } from '../ui'
import { Markdown } from '../Markdown'
import { ConfidencePicker } from './ConfidencePicker'
import { GRADES, GradeButtons } from './GradeButtons'
import { useKeys, type PlayerProps } from './shared'

const LEVEL_LABEL = { 1: 'exemple résolu, une étape à retrouver', 2: 'la moitié des étapes à retrouver', 3: 'reconstitution complète' } as const

/** Deterministic pseudo-random from the exercise id and its rep count, so the masked step changes across reviews. */
function seedFrom(s: string, salt: number): number {
  let h = 2166136261 ^ salt
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0) / 4294967296
}

/**
 * Worked example with fading (Sweller; Kalyuga's expertise reversal):
 * level 1 shows the full derivation with one step hidden, level 2 hides half
 * the steps, level 3 shows the statement only. "Pourquoi ?" is optional on
 * purpose: forced self-explanation prompts at every step lower the effect.
 */
export function DemonstrationPlayer({ exercise, data, intervals, intervalCap, chrono = false, askConfidence = false, onAnswer }: PlayerProps<'demonstration'>) {
  const [confidence, setConfidence] = useState<Confidence | undefined>()
  const level = exercise.fading?.level ?? 1
  const steps = data.steps
  const masked = useMemo(() => {
    const r = seedFrom(exercise.id, exercise.fsrs.reps)
    if (level === 1) {
      const idx = Math.floor(r * steps.length)
      return new Set([idx])
    }
    if (level === 2) {
      // Half the steps, spread out: parity chosen by the seed.
      const parity = r < 0.5 ? 0 : 1
      return new Set(steps.map((_, i) => i).filter((i) => i % 2 === parity))
    }
    return new Set(steps.map((_, i) => i))
  }, [exercise.id, exercise.fsrs.reps, level, steps])

  const [revealed, setRevealed] = useState(false)
  const [whyOpen, setWhyOpen] = useState<Set<number>>(() => new Set())
  const [attempt, setAttempt] = useState('')

  const reveal = useCallback(() => setRevealed(true), [])

  useKeys(
    !revealed,
    useCallback(
      (e: KeyboardEvent) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault()
          reveal()
        }
      },
      [reveal],
    ),
  )

  useKeys(
    revealed,
    useCallback(
      (e: KeyboardEvent) => {
        const hit = GRADES.find((g) => g.key === e.key)
        if (hit) {
          e.preventDefault()
          onAnswer({ correct: hit.correct, grade: hit.grade, confidence })
        }
      },
      [onAnswer, confidence],
    ),
  )

  const toggleWhy = (i: number) =>
    setWhyOpen((s) => {
      const n = new Set(s)
      if (n.has(i)) n.delete(i)
      else n.add(i)
      return n
    })

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">Niveau {level}</Badge>
          <span className="text-xs text-muted">{LEVEL_LABEL[level]}</span>
        </div>
        <p className="text-xl leading-snug font-medium text-ink md:text-2xl">
          <Markdown inline text={data.title} />
        </p>
        <div className="text-base text-ink">
          <Markdown text={data.statement} />
        </div>
      </div>

      {level === 3 && !revealed ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">Reconstitue l’enchaînement des étapes (au brouillon ou ci-dessous), puis compare.</p>
          <textarea
            autoFocus
            value={attempt}
            onChange={(e) => setAttempt(e.target.value)}
            placeholder="1. … 2. … 3. …"
            className="min-h-32 w-full rounded-[var(--radius-sm)] border border-line-strong bg-surface-2 px-3 py-2 text-sm leading-relaxed text-ink ring-focus"
          />
        </div>
      ) : (
        <ol className="flex flex-col gap-2">
          {steps.map((step, i) => {
            const hidden = masked.has(i) && !revealed
            return (
              <li key={i} className={cx('flex gap-3 rounded-lg border px-3 py-2', hidden ? 'border-dashed border-line-strong bg-surface-2' : 'border-line bg-surface', revealed && masked.has(i) && 'border-accent/60 bg-accent-soft/40')}>
                <span className="w-5 shrink-0 pt-0.5 text-right font-mono text-xs text-muted tabular-nums">{i + 1}.</span>
                <div className="min-w-0 flex-1">
                  {hidden ? (
                    <span className="text-sm text-muted">Étape à retrouver…</span>
                  ) : (
                    <>
                      <div className="text-sm text-ink">
                        <Markdown text={step.text} />
                      </div>
                      {step.why && (
                        <div className="mt-1">
                          <button type="button" onClick={() => toggleWhy(i)} className="flex items-center gap-1 text-xs text-muted hover:text-ink ring-focus rounded">
                            <CircleQuestionMark size={14} /> {whyOpen.has(i) ? 'Masquer' : 'Pourquoi ?'}
                          </button>
                          {whyOpen.has(i) && (
                            <p className="mt-1 text-xs text-muted">
                              <Markdown inline text={step.why} />
                            </p>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}

      {level === 3 && revealed && attempt.trim() && (
        <div className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm">
          <p className="mb-1 text-xs text-muted">Ta reconstitution</p>
          <p className="whitespace-pre-wrap text-ink">{attempt}</p>
        </div>
      )}

      {!revealed ? (
        <div className="flex flex-col gap-4">
          {askConfidence && !chrono && <ConfidencePicker value={confidence} onChange={setConfidence} />}
          <div className="flex items-center gap-3">
            <Button size="lg" autoFocus={level !== 3} onClick={reveal}>
              <Eye size={18} />
              {level === 3 ? 'Afficher la démonstration' : masked.size > 1 ? 'Afficher les étapes' : 'Afficher l’étape'}
            </Button>
            <span className="hidden text-xs text-muted sm:inline">
              <Kbd>Espace</Kbd>
            </span>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted">{chrono ? 'Tu l’avais ?' : level === 3 ? 'Ton enchaînement était-il complet et juste ?' : 'Avais-tu retrouvé les étapes masquées ?'}</p>
          <GradeButtons intervals={intervals} intervalCap={intervalCap} focusIndex={2} onGrade={(g, correct) => onAnswer({ correct, grade: g, confidence })} />
          <p className="text-xs text-muted">Deux réussites de suite montent d’un niveau ; « Encore » redescend.</p>
        </div>
      )}
    </div>
  )
}
