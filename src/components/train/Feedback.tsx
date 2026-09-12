import { useEffect, useRef, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowRight, CircleCheck, CircleX } from 'lucide-react'
import { Button, Kbd, cx } from '../ui'
import { Markdown } from '../Markdown'

export interface FeedbackProps {
  correct: boolean
  /** Shown when the answer was wrong. */
  expected?: ReactNode
  explanation?: string
  onContinue: () => void
  continueLabel?: string
}

/**
 * Shared second step of an auto-graded exercise: verdict banner, expected
 * answer when wrong, optional explanation, and the "Continuer" button which
 * takes focus and also fires on Enter.
 */
export function Feedback({ correct, expected, explanation, onContinue, continueLabel = 'Continuer' }: FeedbackProps) {
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.repeat) return
      e.preventDefault()
      fire()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <motion.div
      role="status"
      aria-live="polite"
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="mt-6 flex flex-col gap-4 border-t border-line pt-5"
    >
      <div className={cx('flex items-start gap-3 rounded-lg px-4 py-3', correct ? 'bg-ok-soft text-ok' : 'bg-bad-soft text-bad')}>
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
      </div>

      {explanation && (
        <div className="text-sm leading-relaxed text-muted">
          <Markdown text={explanation} />
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
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
