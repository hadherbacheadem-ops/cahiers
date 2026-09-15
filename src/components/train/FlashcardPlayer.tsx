import { useCallback, useMemo, useRef, useState } from 'react'
import { useReducedMotion } from '../../lib/media'
import { Check, RotateCcw } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db'
import type { Confidence, Grade } from '../../types'
import { typedMatch, wordDiff } from '../../lib/typed'
import { useSettings } from '../../lib/useSettings'
import { Button, Kbd, cx } from '../ui'
import { Markdown } from '../Markdown'
import { ConfidencePicker } from './ConfidencePicker'
import { CHRONO_GRADES, GRADES, GradeButtons } from './GradeButtons'
import { useKeys, type IntervalLabels, type PlayerProps } from './shared'

const SWIPE_RATIO = 0.4
/** Swipes that start this close to a screen edge belong to the system (back / forward gesture). */
const EDGE_PX = 24
const COARSE = typeof window !== 'undefined' ? window.matchMedia('(pointer: coarse)') : null

/**
 * Touch: once the card is turned, dragging it left grades « Encore », right
 * grades « Bien », beyond 40 % of the width; the interval is shown during the
 * gesture. Transform only; released early, the card springs back.
 */
function useSwipeGrade(enabled: boolean, intervals: IntervalLabels | undefined, grade: (g: Grade, correct: boolean) => void) {
  const [dx, setDx] = useState(0)
  const start = useRef<{ x: number; id: number; width: number } | null>(null)
  const active = enabled && !!COARSE?.matches
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!active || e.pointerType !== 'touch') return
      if (e.clientX < EDGE_PX || e.clientX > window.innerWidth - EDGE_PX) return
      start.current = { x: e.clientX, id: e.pointerId, width: e.currentTarget.getBoundingClientRect().width || window.innerWidth }
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        /* synthetic or already-released pointer */
      }
    },
    [active],
  )
  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!start.current || e.pointerId !== start.current.id) return
    setDx(e.clientX - start.current.x)
  }, [])
  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const s = start.current
      if (!s || e.pointerId !== s.id) return
      start.current = null
      const d = e.clientX - s.x
      setDx(0)
      if (Math.abs(d) >= s.width * SWIPE_RATIO) grade(d > 0 ? 'good' : 'again', d > 0)
    },
    [grade],
  )
  const dir: Grade | null = dx > 24 ? 'good' : dx < -24 ? 'again' : null
  const label = dir ? `${dir === 'good' ? 'Je savais' : 'Je ne savais pas'}${intervals?.[dir] ? ` · ${intervals[dir]}` : ''}` : null
  return {
    style: active && dx !== 0 ? { transform: `translateX(${dx}px) rotate(${dx / 40}deg)`, transition: 'none' } : { transition: 'transform 200ms var(--ease-out)' },
    onPointerDown: active ? onPointerDown : undefined,
    onPointerMove: active ? onPointerMove : undefined,
    onPointerUp: active ? onPointerUp : undefined,
    label,
    dir,
    dragging: dx !== 0,
  }
}

/**
 * Flashcard, Quizlet-style: the question on the front, tap (or Space) to turn
 * the card, the answer on the back, then « Je ne savais pas » / « Je savais »
 * (the four FSRS nuances stay one link and the keys 1–4 away). Typing the
 * answer first is an opt-in setting (comparison tolerant to spelling; it only
 * suggests a grade).
 */
export function FlashcardPlayer({ exercise, data, chrono = false, intervals, intervalCap, askConfidence = false, typedFlashcards, onAnswer }: PlayerProps<'flashcard'>) {
  const reduced = useReducedMotion()
  const settings = useSettings()
  const typed = !!(typedFlashcards ?? settings?.typedFlashcards) && !chrono
  const [flipped, setFlipped] = useState(false)
  const [confidence, setConfidence] = useState<Confidence | undefined>()
  const [input, setInput] = useState('')
  // A formula / theorem point or a "formule" tag forces the formula comparison.
  const point = useLiveQuery(async () => (exercise.pointId ? await db.points.get(exercise.pointId) : undefined), [exercise.pointId])
  const forceFormula = exercise.tags.some((t) => /^formules?$/i.test(t.trim())) || point?.nature === 'formule' || point?.nature === 'theoreme'

  const match = useMemo(() => (typed && flipped ? typedMatch(input, [data.answer], { forceFormula }) : null), [typed, flipped, input, data.answer, forceFormula])
  const suggested: Grade | null = match?.suggestion ?? null
  const diff = useMemo(() => (match && !match.exact && !match.formula ? wordDiff(input, data.answer) : null), [match, input, data.answer])

  const grade = useCallback(
    (g: Grade, correct: boolean) => {
      onAnswer({ correct, grade: g, confidence })
    },
    [onAnswer, confidence],
  )

  const flip = useCallback(() => setFlipped(true), [])

  useKeys(
    !flipped && !typed,
    useCallback(
      (e: KeyboardEvent) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault()
          flip()
        }
      },
      [flip],
    ),
  )

  useKeys(
    flipped,
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

  const swipe = useSwipeGrade(flipped && !chrono && settings?.swipeToGrade !== false, intervals, grade)
  const flipMs = reduced ? 0 : 420

  return (
    <div className="flex flex-col gap-5">
      {typed && !flipped && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            flip()
          }}
        >
          <p className="text-xl leading-snug font-medium text-ink md:text-2xl">
            <Markdown inline text={data.question} />
          </p>
          {askConfidence && <ConfidencePicker value={confidence} onChange={setConfidence} active={false} />}
          <label className="text-sm font-medium" htmlFor="typed-answer">
            Écris la réponse
          </label>
          <input
            id="typed-answer"
            autoFocus
            autoComplete="off"
            autoCapitalize="off"
            enterKeyHint="done"
            spellCheck={false}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={data.answer.includes('$') ? 'Formule, en clair ou en LaTeX…' : 'Ta réponse…'}
            className="h-11 w-full rounded-[var(--radius-sm)] border border-line-strong bg-surface-2 px-3 text-base text-ink ring-focus"
          />
          <div className="flex items-center gap-3">
            <Button type="submit" size="lg">
              <Check size={18} />
              Vérifier
            </Button>
            <span className="hidden text-xs text-muted sm:inline">
              <Kbd>Entrée</Kbd>
            </span>
          </div>
        </form>
      )}

      {(!typed || flipped) && (
        <div data-swipe className="relative touch-pan-y" style={swipe.style} onPointerDown={swipe.onPointerDown} onPointerMove={swipe.onPointerMove} onPointerUp={swipe.onPointerUp} onPointerCancel={swipe.onPointerUp}>
          {swipe.label && (
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-2 z-10 flex justify-center">
              <span className={cx('rounded-full border px-3 py-1 text-sm font-semibold shadow-elev-2', swipe.dir === 'good' ? 'border-ok bg-ok-soft text-ok' : 'border-bad bg-bad-soft text-bad')}>{swipe.label}</span>
            </div>
          )}
          {/* The two faces share one grid cell: the card is as tall as its taller face, no jump on flip. */}
          <div style={{ perspective: '1400px' }}>
            <div className="grid" style={{ transformStyle: 'preserve-3d', transition: `transform ${flipMs}ms var(--ease-out)`, transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }} aria-live="polite">
              <button
                type="button"
                data-action="retourner-la-carte"
                onClick={flipped ? undefined : flip}
                disabled={flipped}
                aria-label="Retourner la carte"
                className={cx(
                  '[grid-area:1/1] flex min-h-56 w-full cursor-pointer flex-col items-center justify-center gap-6 rounded-[var(--radius-md)] border border-line bg-surface-2 px-5 py-8 text-center ring-focus md:min-h-80',
                  flipped && 'pointer-events-none',
                )}
                style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
                aria-hidden={flipped}
                tabIndex={flipped ? -1 : 0}
              >
                <span className="text-xl leading-snug font-medium text-ink md:text-3xl md:leading-snug">
                  <Markdown inline text={data.question} />
                </span>
                {!typed && (
                  <span className="flex items-center gap-1.5 text-xs text-muted">
                    <RotateCcw size={12} aria-hidden="true" />
                    Toucher pour retourner <Kbd>Espace</Kbd>
                  </span>
                )}
              </button>
              <div
                className={cx(
                  '[grid-area:1/1] flex min-h-56 w-full flex-col items-center justify-center gap-4 text-center rounded-[var(--radius-md)] border border-accent/50 bg-surface-2 px-5 py-6 md:min-h-80',
                  !flipped && 'pointer-events-none',
                )}
                style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
                aria-hidden={!flipped}
              >
                <p className="text-xs text-muted">
                  <Markdown inline text={data.question} />
                </p>
                <div className="text-lg leading-relaxed text-ink md:text-3xl">
                  <Markdown text={data.answer} />
                </div>
                {data.hint && (
                  <p className="text-sm text-muted">
                    <Markdown inline text={data.hint} />
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {!flipped && !typed && askConfidence && !chrono && <ConfidencePicker value={confidence} onChange={setConfidence} active />}

      {flipped && (
        <div className="flex flex-col gap-3">
          {match && (
            <div className={cx('rounded-lg border px-4 py-3 text-sm', suggested === 'again' ? 'border-bad bg-bad-soft' : suggested === 'good' ? 'border-ok bg-ok-soft' : 'border-warn bg-warn-soft')}>
              <p className={cx('font-medium', suggested === 'again' ? 'text-bad' : suggested === 'good' ? 'text-ok' : 'text-warn')}>
                {match.exact
                  ? match.equivalent
                    ? 'Formule équivalente (écriture différente, même contenu).'
                    : 'Réponse identique.'
                  : match.formula
                    ? 'Formule différente, à l’écriture près : compare terme à terme (signe, exposant, facteur).'
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
          <GradeButtons chrono={chrono} simple={!chrono} intervals={intervals} intervalCap={intervalCap} suggested={suggested} onGrade={grade} />
        </div>
      )}
    </div>
  )
}
