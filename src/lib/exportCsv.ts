// CSV / TSV export of exercises (front, back, type, tags, fiche, cahier), pure.

import type { Cahier, Chapitre, Exercise } from '../types'
import { EXERCISE_LABELS_SINGULAR } from '../types'
import { exerciseAnswerText, exercisePromptText } from './session'

function cell(v: string, sep: string): string {
  const s = v.replace(/\r?\n/g, ' ')
  return /["\n]/.test(s) || s.includes(sep) ? `"${s.replace(/"/g, '""')}"` : s
}

export function exercisesToDelimited(exercises: Exercise[], chapitres: Map<string, Chapitre>, cahiers: Map<string, Cahier>, sep: ',' | '\t' = ','): string {
  const header = ['recto', 'verso', 'type', 'tags', 'fiche', 'cahier', 'statut'].join(sep)
  const rows = exercises.map((e) =>
    [exercisePromptText(e), exerciseAnswerText(e), EXERCISE_LABELS_SINGULAR[e.type], e.tags.join(' '), chapitres.get(e.chapitreId)?.title ?? '', cahiers.get(e.cahierId)?.name ?? '', e.status]
      .map((v) => cell(v, sep))
      .join(sep),
  )
  return [header, ...rows].join('\n')
}
