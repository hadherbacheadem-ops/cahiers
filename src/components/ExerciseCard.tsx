import { useState } from 'react'
import { Pause, Pencil, Play, Trash } from 'lucide-react'
import type { Exercise, PointDeCours } from '../types'
import { deleteExercise, updateExercise } from '../db'
import { formatDue, isDueExercise } from '../lib/srs'
import { exerciseAnswerText, exercisePromptText } from '../lib/session'
import { Markdown } from './Markdown'
import { ExerciseEditModal } from './ExerciseEditModal'
import { ExerciseTypeBadge, IconButton, StatusBadge, cx } from './ui'

export function ExerciseCard({ exercise, points }: { exercise: Exercise; points?: PointDeCours[] }) {
  const [revealed, setRevealed] = useState(false)
  const [editing, setEditing] = useState(false)
  const due = isDueExercise(exercise)
  const point = exercise.pointId ? points?.find((p) => p.id === exercise.pointId) : undefined
  const paused = exercise.status === 'suspended' || exercise.status === 'leech'
  const canToggle = exercise.status !== 'pending'
  const actionClass = 'hover-only opacity-0 group-hover:opacity-100 focus-visible:opacity-100'

  function toggleStatus() {
    updateExercise(exercise.id, { status: paused ? 'active' : 'suspended' })
  }

  return (
    <li className="group flex gap-3 px-4 py-3.5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <ExerciseTypeBadge type={exercise.type} />
          {exercise.status !== 'active' && <StatusBadge status={exercise.status} />}
          <DifficultyDots level={exercise.difficulty} />
          <span className={cx('text-xs', due ? 'text-accent-text' : 'text-muted')}>{exercise.fsrs.state === 0 ? 'nouveau' : formatDue(exercise.fsrs.due)}</span>
        </div>
        {point && <p className="mt-1 truncate text-xs text-muted">{point.title}</p>}
        <button type="button" data-action="afficher-la-reponse" onClick={() => setRevealed((r) => !r)} className="mt-2 block w-full text-left text-sm leading-relaxed ring-focus rounded-md" aria-expanded={revealed}>
          <span className="block">
            <Markdown text={exercisePromptText(exercise)} inline />
          </span>
          <span className={cx('mt-1 block', revealed ? 'text-ok' : 'text-muted')}>{revealed ? <Markdown text={exerciseAnswerText(exercise)} inline /> : 'Afficher la réponse'}</span>
        </button>
        {exercise.tags.length > 0 && <div className="mt-2 text-xs text-muted">{exercise.tags.join(' · ')}</div>}
      </div>
      <div className="flex shrink-0 items-start gap-0.5">
        <IconButton label="Modifier l’exercice" className={actionClass} onClick={() => setEditing(true)}>
          <Pencil size={16} />
        </IconButton>
        {canToggle && (
          <IconButton label={paused ? 'Réactiver' : 'Suspendre'} className={actionClass} onClick={toggleStatus}>
            {paused ? <Play size={16} /> : <Pause size={16} />}
          </IconButton>
        )}
        <IconButton
          label="Supprimer l’exercice"
          className={actionClass}
          onClick={() => {
            if (window.confirm('Supprimer cet exercice ?')) deleteExercise(exercise.id)
          }}
        >
          <Trash size={16} />
        </IconButton>
      </div>
      <ExerciseEditModal open={editing} onClose={() => setEditing(false)} exercise={exercise} points={points ?? []} />
    </li>
  )
}

function DifficultyDots({ level }: { level: 1 | 2 | 3 }) {
  const label = ['facile', 'moyen', 'difficile'][level - 1]
  return (
    <span role="img" className="flex items-center gap-0.5" title={`Difficulté : ${label}`} aria-label={`Difficulté : ${label}`}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={cx('size-1.5 rounded-full', i <= level ? 'bg-muted' : 'bg-line')} />
      ))}
    </span>
  )
}
