import type { Grade } from '../../types'
import { Kbd, cx } from '../ui'
import { capTitle, type IntervalCap, type IntervalLabels } from './shared'

export const GRADES: { grade: Grade; label: string; key: string; correct: boolean }[] = [
  { grade: 'again', label: 'Encore', key: '1', correct: false },
  { grade: 'hard', label: 'Difficile', key: '2', correct: false },
  { grade: 'good', label: 'Bien', key: '3', correct: true },
  { grade: 'easy', label: 'Facile', key: '4', correct: true },
]

export const CHRONO_GRADES: { grade: Grade; label: string; keys: string[]; hint: string; correct: boolean }[] = [
  { grade: 'again', label: 'Raté', keys: ['1', 'ArrowLeft'], hint: '1', correct: false },
  { grade: 'good', label: 'Su', keys: ['2', 'ArrowRight'], hint: '2', correct: true },
]

/**
 * The four grade buttons shared by every self-graded player (flashcard,
 * demonstration, true/false correction): same layout, same colours, interval
 * shown under the label and lifted by 4 px on hover, exam cap marker, the
 * suggested grade ringed and focused. Keyboard handling stays in the player.
 */
export function GradeButtons({
  intervals,
  intervalCap,
  suggested,
  focusIndex,
  onGrade,
  chrono = false,
}: {
  intervals?: IntervalLabels
  intervalCap?: IntervalCap
  suggested?: Grade | null
  /** Which button takes focus (−1: none). Defaults to the suggested one, else « Bien ». */
  focusIndex?: number
  onGrade: (grade: Grade, correct: boolean) => void
  chrono?: boolean
}) {
  if (chrono) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {CHRONO_GRADES.map((g, i) => (
          <button
            key={g.grade}
            type="button"
            autoFocus={i === 1}
            onClick={() => onGrade(g.grade, g.correct)}
            className={cx(
              'flex h-14 items-center justify-center gap-3 rounded-[var(--radius-md)] border text-base font-medium press ring-focus',
              g.correct ? 'border-ok/60 bg-ok-soft text-ok hover:border-ok' : 'border-bad/60 bg-bad-soft text-bad hover:border-bad',
            )}
          >
            {g.label}
            <Kbd>{g.hint}</Kbd>
          </button>
        ))}
      </div>
    )
  }
  const focus = focusIndex ?? (suggested ? GRADES.findIndex((g) => g.grade === suggested) : 2)
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" role="group" aria-label="Note ta réponse">
      {GRADES.map((g, i) => {
        const capped = !!intervalCap?.grades.includes(g.grade)
        const interval = intervals?.[g.grade]
        return (
          <button
            key={g.grade}
            type="button"
            autoFocus={i === focus}
            onClick={() => onGrade(g.grade, g.correct)}
            className={cx(
              'group/grade flex h-16 flex-col items-center justify-center gap-0.5 rounded-[var(--radius-md)] border text-sm font-medium press ring-focus transition-[border-color,box-shadow] duration-150',
              g.correct ? 'border-ok/60 bg-ok-soft text-ok hover:border-ok hover:shadow-elev-1' : 'border-bad/60 bg-bad-soft text-bad hover:border-bad hover:shadow-elev-1',
              suggested === g.grade && 'ring-2 ring-accent ring-offset-2 ring-offset-surface',
            )}
            title={capped && intervalCap ? capTitle(intervalCap) : interval ? `Prochaine révision dans ${interval}` : undefined}
          >
            <span className="flex items-center gap-1.5 transition-transform duration-150 ease-out group-hover/grade:-translate-y-1 motion-reduce:transition-none motion-reduce:group-hover/grade:translate-y-0">
              {g.label}
              <Kbd>{g.key}</Kbd>
            </span>
            {interval && (
              <span className="text-xs font-normal opacity-80 tabular-nums transition-[transform,opacity] duration-150 ease-out group-hover/grade:-translate-y-1 group-hover/grade:opacity-100 motion-reduce:transition-none motion-reduce:group-hover/grade:translate-y-0">
                {interval}
                {capped && intervalCap && (
                  <span className="ml-1" aria-label={capTitle(intervalCap)}>
                    ⌃ examen
                  </span>
                )}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
