import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowsClockwise, Warning } from '@phosphor-icons/react'
import type { Chapitre, Exercise, ExerciseType } from '../types'
import { EXERCISE_LABELS, EXERCISE_LABELS_SINGULAR } from '../types'
import { db, importGeneration, setExercisesStatus } from '../db'
import { useSettings } from '../lib/useSettings'
import { buildLeechPrompt, extractDiagnosis } from '../lib/leechPrompt'
import { parseClaudeResponse, type ParseResult } from '../lib/importClaude'
import { exerciseKeyText, lintBatch } from '../lib/lint'
import { Badge, Button, Card, Modal, plural } from './ui'
import { ClaudeRoundTrip, StepTitle } from './ClaudeRoundTrip'
import { ExerciseReadout } from './ExerciseEditModal'

interface Props {
  open: boolean
  onClose: () => void
  exercise: Exercise
  chapitre: Chapitre
  cahierName: string
  onDone?: () => void
}

/** Rewrites a leech through claude.ai: the leech is suspended, its replacements land in the validation queue. Remounted on every open. */
export function LeechRewritePanel(props: Props) {
  const [session, setSession] = useState(0)
  const [prevOpen, setPrevOpen] = useState(props.open)
  if (props.open !== prevOpen) {
    setPrevOpen(props.open)
    if (props.open) setSession((s) => s + 1)
  }
  return <LeechInner key={session} {...props} />
}

interface Analysis {
  result: ParseResult
  diagnosis?: string
  warnCount: number
}

function LeechInner({ open, onClose, exercise, chapitre, cahierName, onDone }: Props) {
  const settings = useSettings()
  const existing = useLiveQuery(() => db.exercises.where('chapitreId').equals(chapitre.id).toArray(), [chapitre.id])
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [importing, setImporting] = useState(false)

  const prompt = useMemo(
    () => buildLeechPrompt({ cahierName, ficheTitle: chapitre.title, ficheContent: chapitre.content, exercise, niveau: settings?.niveau }),
    [cahierName, chapitre, exercise, settings?.niveau],
  )

  function analyse(text: string): Analysis {
    const result = parseClaudeResponse(text)
    const existingKeys = (existing ?? []).filter((e) => e.id !== exercise.id && e.status !== 'pending').map((e) => exerciseKeyText(e.data))
    const reports = lintBatch(
      result.exercises.map((e) => e.data),
      { existingKeys },
    )
    const warnCount = reports.filter((r) => r.issues.some((i) => i.severity === 'warn')).length
    return { result, diagnosis: extractDiagnosis(text), warnCount }
  }

  async function replace() {
    const exercises = analysis?.result.exercises
    if (!exercises?.length) return
    setImporting(true)
    try {
      await importGeneration(
        chapitre.id,
        chapitre.cahierId,
        [],
        exercises.map((e) => ({ ...e, localPointId: exercise.pointId ?? undefined })),
        'pending',
      )
      await setExercisesStatus([exercise.id], 'suspended')
      onDone?.()
      onClose()
    } finally {
      setImporting(false)
    }
  }

  const count = analysis?.result.exercises.length ?? 0
  const lapses = exercise.fsrs.lapses

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Réécrire cet exercice avec Claude"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={importing}>
            Fermer
          </Button>
          <Button onClick={replace} disabled={!count || importing}>
            <ArrowsClockwise size={16} weight="bold" />
            {count ? `Remplacer par ${plural(count, 'exercice')}` : 'Remplacer l’exercice'}
          </Button>
        </>
      }
    >
      <ol className="flex flex-col gap-7">
        <li className="flex flex-col gap-3">
          <StepTitle n={1} title="L’exercice qui pose problème" />
          <p className="flex items-start gap-2 rounded-lg bg-warn-soft px-3 py-2 text-sm text-ink">
            <Warning size={18} className="mt-0.5 shrink-0 text-warn" />
            <span>
              Cet exercice a été raté {plural(lapses, 'fois', 'fois')} : il est probablement mal formulé (trop large, ambigu, réponse trop longue…). Claude va poser un diagnostic et
              proposer 1 à 3 exercices atomiques à la place. L’original sera suspendu, pas supprimé : son historique est conservé.
            </span>
          </p>
          <Card className="p-4">
            <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-muted">{EXERCISE_LABELS_SINGULAR[exercise.type]}</p>
            <ExerciseReadout data={exercise.data} />
          </Card>
        </li>

        <ClaudeRoundTrip
          firstStep={2}
          prompt={prompt}
          parse={analyse}
          onParsed={setAnalysis}
          placeholder='{"diagnosis": "…", "exercises": [ … ]}'
          renderPreview={(a) => <RewritePreview analysis={a} />}
        />
      </ol>
    </Modal>
  )
}

function RewritePreview({ analysis }: { analysis: Analysis }) {
  const { result, diagnosis, warnCount } = analysis
  const byType = new Map<ExerciseType, number>()
  result.exercises.forEach((e) => byType.set(e.data.type, (byType.get(e.data.type) ?? 0) + 1))
  return (
    <>
      {diagnosis && (
        <p className="mb-2 text-sm">
          <span className="font-medium">Diagnostic : </span>
          {diagnosis}
        </p>
      )}
      {result.exercises.length ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{plural(result.exercises.length, 'exercice proposé', 'exercices proposés')} :</span>
          {Array.from(byType.entries()).map(([t, n]) => (
            <Badge key={t} tone="ok">
              {n} {(n === 1 ? EXERCISE_LABELS_SINGULAR : EXERCISE_LABELS)[t].toLowerCase()}
            </Badge>
          ))}
        </div>
      ) : (
        <span>Aucun exercice valide dans cette réponse.</span>
      )}
      <ul className="mt-1.5 flex flex-col gap-0.5 text-xs text-muted">
        {warnCount > 0 && <li>{plural(warnCount, 'exercice signalé', 'exercices signalés')} par le linter : tu les verras dans la file de validation.</li>}
        {result.rejected.length > 0 && (
          <li>
            {plural(result.rejected.length, 'élément ignoré', 'éléments ignorés')} : {result.rejected.map((r) => `#${r.index + 1} (${r.reason})`).join(', ')}
          </li>
        )}
      </ul>
    </>
  )
}
