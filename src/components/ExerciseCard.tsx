import { useState } from 'react'
import { Trash } from '@phosphor-icons/react'
import type { Exercise } from '../types'
import { EXERCISE_LABELS_SINGULAR } from '../types'
import { deleteExercise } from '../db'
import { formatDue } from '../lib/srs'
import { exerciseAnswerText, exercisePromptText } from '../lib/session'
import { Badge, IconButton, cx } from './ui'

export function ExerciseCard({ exercise }: { exercise: Exercise }) {
  const [revealed, setRevealed] = useState(false)
  const due = exercise.srs.due <= Date.now()

  return (
    <li className="group flex gap-3 px-4 py-3.5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{EXERCISE_LABELS_SINGULAR[exercise.type]}</Badge>
          <DifficultyDots level={exercise.difficulty} />
          <span className={cx('text-xs', due ? 'text-accent' : 'text-muted')}>{exercise.srs.reps === 0 && exercise.srs.lapses === 0 ? 'nouveau' : formatDue(exercise.srs.due)}</span>
        </div>
        <button
          type="button"
          onClick={() => setRevealed((r) => !r)}
          className="mt-2 block w-full text-left text-sm leading-relaxed ring-focus rounded-md"
          aria-expanded={revealed}
        >
          <span className="block">{exercisePromptText(exercise)}</span>
          <span className={cx('mt-1 block', revealed ? 'text-ok' : 'text-muted')}>{revealed ? exerciseAnswerText(exercise) : 'Afficher la réponse'}</span>
        </button>
        {exercise.tags.length > 0 && <div className="mt-2 text-xs text-muted">{exercise.tags.join(' · ')}</div>}
      </div>
      <IconButton
        label="Supprimer l’exercice"
        className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        onClick={() => {
          if (window.confirm('Supprimer cet exercice ?')) deleteExercise(exercise.id)
        }}
      >
        <Trash size={16} />
      </IconButton>
    </li>
  )
}

function DifficultyDots({ level }: { level: 1 | 2 | 3 }) {
  const label = ['facile', 'moyen', 'difficile'][level - 1]
  return (
    <span className="flex items-center gap-0.5" title={`Difficulté : ${label}`} aria-label={`Difficulté : ${label}`}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={cx('size-1.5 rounded-full', i <= level ? 'bg-muted' : 'bg-line')} />
      ))}
    </span>
  )
}
