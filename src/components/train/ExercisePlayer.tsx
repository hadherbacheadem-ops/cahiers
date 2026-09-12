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
import { RecallPlayer } from './RecallPlayer'
import { DemonstrationPlayer } from './DemonstrationPlayer'

export interface ExercisePlayerProps {
  exercise: Exercise
  chrono?: boolean
  /** Chrono: verdicts are shown at the end of the quiz, not after each answer. */
  deferFeedback?: boolean
  intervals?: IntervalLabels
  onAnswer: (result: AnswerResult) => void
}

/** Dispatches to the player matching `exercise.type`. Keyed by id so state resets between exercises. */
export function ExercisePlayer({ exercise, chrono, deferFeedback, intervals, onAnswer }: ExercisePlayerProps) {
  const d = exercise.data
  const common = { exercise, chrono, deferFeedback, onAnswer }
  let player: ReactNode
  switch (d.type) {
    case 'flashcard':
      player = <FlashcardPlayer key={exercise.id} {...common} data={d} intervals={intervals} />
      break
    case 'cloze':
      player = <ClozePlayer key={exercise.id} {...common} data={d} />
      break
    case 'mcq':
      player = <McqPlayer key={exercise.id} {...common} data={d} />
      break
    case 'truefalse':
      player = <TrueFalsePlayer key={exercise.id} {...common} data={d} />
      break
    case 'match':
      player = <MatchPlayer key={exercise.id} {...common} data={d} />
      break
    case 'order':
      player = <OrderPlayer key={exercise.id} {...common} data={d} />
      break
    case 'rappel_libre':
      player = <RecallPlayer key={exercise.id} {...common} data={d} />
      break
    case 'demonstration':
      player = <DemonstrationPlayer key={exercise.id} {...common} data={d} intervals={intervals} />
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
