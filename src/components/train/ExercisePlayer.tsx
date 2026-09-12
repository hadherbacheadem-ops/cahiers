import type { ReactNode } from 'react'
import type { Exercise } from '../../types'
import { ExerciseTypeBadge } from '../ui'
import type { AnswerResult, IntervalCap, IntervalLabels } from './shared'
import { FlashcardPlayer } from './FlashcardPlayer'
import { ClozePlayer } from './ClozePlayer'
import { McqPlayer } from './McqPlayer'
import { TrueFalsePlayer } from './TrueFalsePlayer'
import { MatchPlayer } from './MatchPlayer'
import { OrderPlayer } from './OrderPlayer'
import { RecallPlayer } from './RecallPlayer'
import { DemonstrationPlayer } from './DemonstrationPlayer'
import { CarteTrousPlayer } from './CarteTrousPlayer'

export interface ExercisePlayerProps {
  exercise: Exercise
  chrono?: boolean
  /** Chrono: verdicts are shown at the end of the quiz, not after each answer. */
  deferFeedback?: boolean
  askConfidence?: boolean
  intervals?: IntervalLabels
  intervalCap?: IntervalCap
  typedFlashcards?: boolean
  weightedMcq?: boolean
  onAnswer: (result: AnswerResult) => void
}

/** Dispatches to the player matching `exercise.type`. Keyed by id so state resets between exercises. */
export function ExercisePlayer({ exercise, chrono, deferFeedback, askConfidence, intervals, intervalCap, typedFlashcards, weightedMcq, onAnswer }: ExercisePlayerProps) {
  const d = exercise.data
  const common = { exercise, chrono, deferFeedback, askConfidence, typedFlashcards, weightedMcq, onAnswer }
  let player: ReactNode
  switch (d.type) {
    case 'flashcard':
      player = <FlashcardPlayer key={exercise.id} {...common} data={d} intervals={intervals} intervalCap={intervalCap} />
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
      player = <DemonstrationPlayer key={exercise.id} {...common} data={d} intervals={intervals} intervalCap={intervalCap} />
      break
    case 'carte_trous':
      player = <CarteTrousPlayer key={exercise.id} {...common} data={d} />
      break
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <ExerciseTypeBadge type={exercise.type} tone="accent" />
      </div>
      {player}
    </div>
  )
}
