import type { ReactNode } from 'react'
import type { Exercise } from '../../types'
import { EXERCISE_LABELS_SINGULAR } from '../../types'
import { Badge } from '../ui'
import type { AnswerResult, IntervalLabels } from './shared'
import { FlashcardPlayer } from './FlashcardPlayer'
import { ClozePlayer } from './ClozePlayer'
import { McqPlayer } from './McqPlayer'
import { TrueFalsePlayer } from './TrueFalsePlayer'
import { MatchPlayer } from './MatchPlayer'
import { OrderPlayer } from './OrderPlayer'

export interface ExercisePlayerProps {
  exercise: Exercise
  chrono?: boolean
  intervals?: IntervalLabels
  onAnswer: (result: AnswerResult) => void
}

/** Dispatches to the player matching `exercise.type`. Keyed by id so state resets between exercises. */
export function ExercisePlayer({ exercise, chrono, intervals, onAnswer }: ExercisePlayerProps) {
  const d = exercise.data
  let player: ReactNode
  switch (d.type) {
    case 'flashcard':
      player = <FlashcardPlayer key={exercise.id} exercise={exercise} data={d} chrono={chrono} intervals={intervals} onAnswer={onAnswer} />
      break
    case 'cloze':
      player = <ClozePlayer key={exercise.id} exercise={exercise} data={d} chrono={chrono} onAnswer={onAnswer} />
      break
    case 'mcq':
      player = <McqPlayer key={exercise.id} exercise={exercise} data={d} chrono={chrono} onAnswer={onAnswer} />
      break
    case 'truefalse':
      player = <TrueFalsePlayer key={exercise.id} exercise={exercise} data={d} chrono={chrono} onAnswer={onAnswer} />
      break
    case 'match':
      player = <MatchPlayer key={exercise.id} exercise={exercise} data={d} chrono={chrono} onAnswer={onAnswer} />
      break
    case 'order':
      player = <OrderPlayer key={exercise.id} exercise={exercise} data={d} chrono={chrono} onAnswer={onAnswer} />
      break
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <Badge tone="accent">{EXERCISE_LABELS_SINGULAR[exercise.type]}</Badge>
      </div>
      {player}
    </div>
  )
}
