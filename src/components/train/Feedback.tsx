import { useEffect, useRef, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowRight, CircleCheck, CircleX, ThumbsUp } from 'lucide-react'
import { Button, Kbd, cx } from '../ui'
import { Markdown } from '../Markdown'

export interface FeedbackProps {
  correct: boolean
  /** Shown when the answer was wrong. */
  expected?: ReactNode
  explanation?: string
  onContinue: () => void
  continueLabel?: string
  /** Wrong verdict the student disputes (a typed answer the comparison did not recognise): counts the answer as right. */
  onOverride?: () => void
}

/**
 * Shared second step of an auto-graded exercise: verdict banner, expected
 * answer when wrong, optional explanation, and the "Continuer" button which
 * takes focus and also fires on Enter.
 */
export function Feedback({ correct, expected, explanation, onContinue, continueLabel = 'Continuer', onOverride }: FeedbackProps) {
  const reduced = useReducedMotion()
  const firedRef = useRef(false)
  const continueRef = useRef(onContinue)
  useEffect(() => {
    continueRef.current = onContinue
  }, [onContinue])

  const fire = () => {
    if (firedRef.current) return
    firedRef.current = true
    continueRef.current()
  }

  const overrideRef = useRef(onOverride)
  useEffect(() => {
    overrideRef.current = onOverride
  }, [onOverride])
  const override = () => {
    if (firedRef.current || !overrideRef.current) return
    firedRef.current = true
    overrideRef.current()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (e.key === 'Enter') {
        e.preventDefault()
        fire()
      } else if (!correct && (e.key === 'j' || e.key === 'J') && overrideRef.current) {
        e.preventDefault()
        override()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [correct])

  return (
    <motion.div
      role="status"
      aria-live="polite"
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="mt-6 flex flex-col gap-4 border-t border-line pt-5"
    >
      {/* Right: one pulse of the accent. Wrong: a 2 px horizontal shake, 200 ms. Reduced motion: colour only. */}
      <motion.div
        className={cx('flex items-start gap-3 rounded-[var(--radius-md)] border px-4 py-3', correct ? 'border-ok/50 bg-ok-soft text-ok' : 'border-bad/50 bg-bad-soft text-bad')}
        initial={false}
        animate={reduced ? {} : correct ? { scale: [1, 1.02, 1], boxShadow: ['0 0 0 0 rgba(242,183,92,0)', '0 0 0 6px rgba(242,183,92,0.18)', '0 0 0 0 rgba(242,183,92,0)'] } : { x: [0, -2, 2, -2, 2, 0] }}
        transition={{ duration: correct ? 0.35 : 0.2, ease: 'easeOut' }}
      >
        <span className="mt-0.5 shrink-0">{correct ? <CircleCheck size={22} /> : <CircleX size={22} />}</span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{correct ? 'Correct' : 'Incorrect'}</p>
          {!correct && expected != null && (
            <div className="mt-1 text-sm text-ink">
              <span className="text-muted">Réponse attendue : </span>
              <span className="font-medium">{expected}</span>
            </div>
          )}
        </div>
      </motion.div>

      {explanation && (
        <div className="text-sm leading-relaxed text-muted">
          <Markdown text={explanation} />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        {!correct && onOverride && (
          <Button variant="secondary" size="lg" onClick={override} title="Ma réponse était juste, la comparaison ne l’a pas reconnue : compter comme réussi">
            <ThumbsUp size={16} />
            J’avais bon
            <Kbd>J</Kbd>
          </Button>
        )}
        <span className="hidden text-xs text-muted sm:inline">
          <Kbd>Entrée</Kbd>
        </span>
        <Button autoFocus size="lg" onClick={fire}>
          {continueLabel}
          <ArrowRight size={18} />
        </Button>
      </div>
    </motion.div>
  )
}
