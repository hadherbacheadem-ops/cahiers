import { useCallback, useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Check, Eye } from '@phosphor-icons/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db'
import type { Confidence, Grade } from '../../types'
import { typedMatch, wordDiff } from '../../lib/typed'
import { useSettings } from '../../lib/useSettings'
import { Button, Kbd, cx } from '../ui'
import { Markdown } from '../Markdown'
import { ConfidencePicker } from './ConfidencePicker'
import { useKeys, type PlayerProps } from './shared'

const GRADES: { grade: Grade; label: string; key: string; correct: boolean }[] = [
  { grade: 'again', label: 'Encore', key: '1', correct: false },
  { grade: 'hard', label: 'Difficile', key: '2', correct: false },
  { grade: 'good', label: 'Bien', key: '3', correct: true },
  { grade: 'easy', label: 'Facile', key: '4', correct: true },
]

const CHRONO_GRADES: { grade: Grade; label: string; keys: string[]; hint: string; correct: boolean }[] = [
  { grade: 'again', label: 'Raté', keys: ['1', 'ArrowLeft'], hint: '1', correct: false },
  { grade: 'good', label: 'Su', keys: ['2', 'ArrowRight'], hint: '2', correct: true },
]

/**
 * Flashcard, optionally with a typed answer: the student writes before the
 * reveal (generation effect), the comparison is tolerant (accents, case,
 * LaTeX spellings) and only suggests a grade — the student confirms.
 */
export function FlashcardPlayer({ exercise, data, chrono = false, intervals, askConfidence = false, onAnswer }: PlayerProps<'flashcard'>) {
  const reduced = useReducedMotion()
  const settings = useSettings()
  const typed = (data.typed || settings?.typedFlashcards) && !chrono
  const [revealed, setRevealed] = useState(false)
  const [confidence, setConfidence] = useState<Confidence | undefined>()
  const [input, setInput] = useState('')
  // A formula / theorem point or a "formule" tag forces the formula comparison (exact match only).
  const point = useLiveQuery(async () => (exercise.pointId ? await db.points.get(exercise.pointId) : undefined), [exercise.pointId])
  const forceFormula = exercise.tags.some((t) => /^formules?$/i.test(t.trim())) || point?.nature === 'formule' || point?.nature === 'theoreme'

  const match = useMemo(() => (typed && revealed ? typedMatch(input, [data.answer], { forceFormula }) : null), [typed, revealed, input, data.answer, forceFormula])
  // Formulas: only an exact match is put forward (a sign error looks 90 % similar). Text: Dice thresholds.
  const suggested: Grade | null = match?.suggestion ?? null
  const diff = useMemo(() => (match && !match.exact && !match.formula ? wordDiff(input, data.answer) : null), [match, input, data.answer])

  const grade = useCallback(
    (g: Grade, correct: boolean) => {
      onAnswer({ correct, grade: g, confidence })
    },
    [onAnswer, confidence],
  )

  const reveal = useCallback(() => setRevealed(true), [])

  useKeys(
    !revealed && !typed,
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
        if (chrono) {
          const hit = CHRONO_GRADES.find((g) => g.keys.includes(e.key))
          if (hit) {
            e.preventDefault()
            grade(hit.grade, hit.correct)
          }
          return
        }
        const hit = GRADES.find((g) => g.key === e.key)
        if (hit) {
          e.preventDefault()
          grade(hit.grade, hit.correct)
        }
      },
      [chrono, grade],
    ),
  )

  const focusIndex = suggested === 'again' ? 0 : suggested === 'good' ? 2 : -1

  return (
    <div className="flex flex-col gap-6">
      <p className="text-xl leading-snug font-medium text-ink md:text-2xl">
        <Markdown inline text={data.question} />
      </p>

      {!revealed ? (
        <div className="flex flex-col gap-4">
          {askConfidence && !chrono && <ConfidencePicker value={confidence} onChange={setConfidence} active={!typed} />}
          {typed ? (
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault()
                reveal()
              }}
            >
              <label className="text-sm font-medium" htmlFor="typed-answer">
                Écris la réponse
              </label>
              <input
                id="typed-answer"
                autoFocus
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={data.answer.includes('$') ? 'Formule en LaTeX ou en clair…' : 'Ta réponse…'}
                className="h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-base text-ink ring-focus"
              />
              <div className="flex items-center gap-3">
                <Button type="submit" size="lg">
                  <Check size={18} weight="bold" />
                  Valider
                </Button>
                <span className="hidden text-xs text-muted sm:inline">
                  <Kbd>Entrée</Kbd>
                </span>
              </div>
            </form>
          ) : (
            <div className="flex items-center gap-3">
              <Button size="lg" autoFocus onClick={reveal}>
                <Eye size={18} />
                Afficher la réponse
              </Button>
              <span className="hidden text-xs text-muted sm:inline">
                <Kbd>Espace</Kbd>
              </span>
            </div>
          )}
        </div>
      ) : (
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="flex flex-col gap-6"
        >
          {match && (
            <div className={cx('rounded-lg border px-4 py-3 text-sm', suggested === 'again' ? 'border-bad bg-bad-soft' : suggested === 'good' ? 'border-ok bg-ok-soft' : 'border-warn bg-warn-soft')}>
              <p className={cx('font-medium', suggested === 'again' ? 'text-bad' : suggested === 'good' ? 'text-ok' : 'text-warn')}>
                {match.exact
                  ? 'Réponse identique.'
                  : match.formula
                    ? 'Formule différente : compare caractère par caractère (signe, exposant, facteur).'
                    : suggested === 'good'
                      ? `Réponse très proche (${Math.round(match.score * 100)} %).`
                      : suggested === null
                        ? `Réponse partiellement proche (${Math.round(match.score * 100)} %) : à toi de juger.`
                        : `Réponse différente (${Math.round(match.score * 100)} % de similarité).`}
              </p>
              {match.charDiff && (
                <p className="mt-1.5 font-mono text-base leading-relaxed text-ink" aria-label="Différences entre ta formule et la formule attendue">
                  {match.charDiff.map((part, i) => (
                    <span key={i} className={cx(part.kind === 'added' && 'rounded bg-bad-soft px-0.5 text-bad line-through', part.kind === 'missing' && 'rounded bg-ok-soft px-0.5 font-semibold text-ok')}>
                      {part.text}
                    </span>
                  ))}
                </p>
              )}
              {diff && (
                <p className="mt-1.5 leading-relaxed text-ink">
                  {diff.map((part, i) => (
                    <span key={i} className={cx('mr-1', part.kind === 'added' && 'rounded bg-bad-soft px-0.5 text-bad line-through', part.kind === 'missing' && 'rounded bg-ok-soft px-0.5 font-medium text-ok')}>
                      {part.text}
                    </span>
                  ))}
                </p>
              )}
              <p className="mt-1 text-xs text-muted">Ta saisie : « {input || '—'} ». La comparaison est une aide : c’est toi qui tranches.</p>
            </div>
          )}
          <div className="rounded-lg border border-line bg-surface-2 px-5 py-4">
            <div className="text-lg leading-relaxed text-ink md:text-xl">
              <Markdown text={data.answer} />
            </div>
            {data.hint && (
              <p className="mt-2 text-sm text-muted">
                <Markdown inline text={data.hint} />
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted">{chrono ? 'Vous la saviez ?' : 'Comment l’avez-vous trouvée ?'}</p>
            {chrono ? (
              <div className="grid grid-cols-2 gap-3">
                {CHRONO_GRADES.map((g, i) => (
                  <button
                    key={g.grade}
                    type="button"
                    autoFocus={i === 1}
                    onClick={() => grade(g.grade, g.correct)}
                    className={cx(
                      'flex h-14 items-center justify-center gap-3 rounded-lg border text-base font-medium press ring-focus',
                      g.correct ? 'border-ok bg-ok-soft text-ok hover:opacity-90' : 'border-bad bg-bad-soft text-bad hover:opacity-90',
                    )}
                  >
                    {g.label}
                    <Kbd>{g.hint}</Kbd>
                  </button>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {GRADES.map((g, i) => (
                  <button
                    key={g.grade}
                    type="button"
                    autoFocus={i === focusIndex}
                    onClick={() => grade(g.grade, g.correct)}
                    className={cx(
                      'flex h-16 flex-col items-center justify-center gap-0.5 rounded-lg border text-sm font-medium press ring-focus',
                      g.correct ? 'border-ok bg-ok-soft text-ok hover:opacity-90' : 'border-bad bg-bad-soft text-bad hover:opacity-90',
                      suggested === g.grade && 'ring-2 ring-accent ring-offset-2 ring-offset-surface',
                    )}
                    title={intervals?.[g.grade] ? `Prochaine révision dans ${intervals[g.grade]}` : undefined}
                  >
                    <span className="flex items-center gap-1.5">
                      {g.label}
                      <Kbd>{g.key}</Kbd>
                    </span>
                    {intervals?.[g.grade] && <span className="text-xs font-normal opacity-80 tabular-nums">{intervals[g.grade]}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  )
}
