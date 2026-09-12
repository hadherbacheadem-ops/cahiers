import { useCallback, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Eye } from '@phosphor-icons/react'
import type { Grade } from '../../types'
import { Button, Kbd, cx } from '../ui'
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

export function FlashcardPlayer({ data, chrono = false, intervals, onAnswer }: PlayerProps<'flashcard'>) {
  const reduced = useReducedMotion()
  const [revealed, setRevealed] = useState(false)

  const grade = useCallback(
    (g: Grade, correct: boolean) => {
      onAnswer({ correct, grade: g })
    },
    [onAnswer],
  )

  useKeys(
    !revealed,
    useCallback((e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        setRevealed(true)
      }
    }, []),
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

  return (
    <div className="flex flex-col gap-6">
      <p className="text-xl leading-snug font-medium text-ink md:text-2xl">{data.question}</p>

      {!revealed ? (
        <div className="flex items-center gap-3">
          <Button size="lg" autoFocus onClick={() => setRevealed(true)}>
            <Eye size={18} />
            Afficher la réponse
          </Button>
          <span className="hidden text-xs text-muted sm:inline">
            <Kbd>Espace</Kbd>
          </span>
        </div>
      ) : (
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="flex flex-col gap-6"
        >
          <div className="rounded-lg border border-line bg-surface-2 px-5 py-4">
            <p className="text-lg leading-relaxed text-ink md:text-xl">{data.answer}</p>
            {data.hint && <p className="mt-2 text-sm text-muted">{data.hint}</p>}
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
                    autoFocus={i === 2}
                    onClick={() => grade(g.grade, g.correct)}
                    className={cx(
                      'flex h-16 flex-col items-center justify-center gap-0.5 rounded-lg border text-sm font-medium press ring-focus',
                      g.correct ? 'border-ok bg-ok-soft text-ok hover:opacity-90' : 'border-bad bg-bad-soft text-bad hover:opacity-90',
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
