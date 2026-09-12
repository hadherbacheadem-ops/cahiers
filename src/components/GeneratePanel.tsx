import { useMemo, useState } from 'react'
import { Check, Warning } from '@phosphor-icons/react'
import type { Chapitre, ExerciseType } from '../types'
import { EXERCISE_LABELS, EXERCISE_LABELS_SINGULAR, EXERCISE_TYPES } from '../types'
import { addExercises, updateSettings } from '../db'
import { useSettings } from '../lib/useSettings'
import { buildPrompt } from '../lib/prompt'
import { parseClaudeResponse, type ParseResult } from '../lib/importClaude'
import { Badge, Button, Modal, plural } from './ui'
import { ClaudeRoundTrip, StepTitle } from './ClaudeRoundTrip'

interface Props {
  open: boolean
  onClose: () => void
  chapitre: Chapitre
  cahierName: string
}

/** Exercise generation through claude.ai (no API key). Remounted on every open so the form starts clean. */
export function GeneratePanel(props: Props) {
  const [session, setSession] = useState(0)
  const [prevOpen, setPrevOpen] = useState(props.open)
  if (props.open !== prevOpen) {
    setPrevOpen(props.open)
    if (props.open) setSession((s) => s + 1)
  }
  return <GenerateInner key={session} {...props} />
}

function GenerateInner({ open, onClose, chapitre, cahierName }: Props) {
  const settings = useSettings()
  const [types, setTypes] = useState<ExerciseType[] | null>(null)
  const [parsed, setParsed] = useState<ParseResult | null>(null)
  const [importing, setImporting] = useState(false)

  const effectiveTypes = types ?? settings?.promptTypes ?? []
  const prompt = useMemo(
    () => buildPrompt({ cahierName, title: chapitre.title, content: chapitre.content, types: effectiveTypes, niveau: settings?.niveau }),
    [effectiveTypes, cahierName, chapitre, settings?.niveau],
  )
  const emptyContent = chapitre.content.trim().length < 40

  function toggle(type: ExerciseType, on: boolean) {
    const next = on ? [...effectiveTypes.filter((t) => t !== type), type] : effectiveTypes.filter((t) => t !== type)
    setTypes(next)
    updateSettings({ promptTypes: next })
  }

  async function importParsed() {
    if (!parsed?.exercises.length) return
    setImporting(true)
    try {
      await addExercises(chapitre.id, chapitre.cahierId, parsed.exercises)
      onClose()
    } finally {
      setImporting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Générer des exercices avec Claude"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Fermer
          </Button>
          <Button onClick={importParsed} disabled={!parsed?.exercises.length || importing}>
            <Check size={16} weight="bold" />
            {parsed?.exercises.length ? `Ajouter ${plural(parsed.exercises.length, 'exercice')}` : 'Ajouter les exercices'}
          </Button>
        </>
      }
    >
      <ol className="flex flex-col gap-7">
        <li className="flex flex-col gap-3">
          <StepTitle n={1} title="Types d’exercices autorisés" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {EXERCISE_TYPES.map((t) => {
              const on = effectiveTypes.includes(t)
              return (
                <label key={t} className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line-strong bg-surface px-3 py-2">
                  <input type="checkbox" checked={on} onChange={(e) => toggle(t, e.target.checked)} className="size-4 accent-accent" />
                  <span className="text-sm">{EXERCISE_LABELS[t]}</span>
                </label>
              )
            })}
          </div>
          <p className="text-sm text-muted">
            Pas de nombre imposé : le prompt demande autant d’exercices qu’il y a de points de cours, même mineurs, en choisissant pour chacun le type le plus adapté. Ces choix sont mémorisés.
          </p>
        </li>

        <ClaudeRoundTrip
          firstStep={2}
          prompt={prompt}
          disabled={effectiveTypes.length === 0 || emptyContent}
          disabledHint={
            emptyContent ? (
              <p className="flex items-start gap-2 rounded-lg bg-warn-soft px-3 py-2 text-sm text-ink">
                <Warning size={18} className="mt-0.5 shrink-0 text-warn" />
                Cette fiche est presque vide : Claude n’aura rien pour travailler. Modifie d’abord son contenu.
              </p>
            ) : effectiveTypes.length === 0 ? (
              <p className="flex items-start gap-2 rounded-lg bg-warn-soft px-3 py-2 text-sm text-ink">
                <Warning size={18} className="mt-0.5 shrink-0 text-warn" />
                Coche au moins un type d’exercice.
              </p>
            ) : null
          }
          parse={parseClaudeResponse}
          onParsed={setParsed}
          placeholder='{"exercises": [ … ]}'
          renderPreview={(r) => <ExercisePreview result={r} />}
        />
      </ol>
    </Modal>
  )
}

function ExercisePreview({ result }: { result: ParseResult }) {
  const byType = new Map<ExerciseType, number>()
  result.exercises.forEach((e) => byType.set(e.data.type, (byType.get(e.data.type) ?? 0) + 1))
  return (
    <>
      {result.exercises.length ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{plural(result.exercises.length, 'exercice')} prêts :</span>
          {Array.from(byType.entries()).map(([t, n]) => (
            <Badge key={t} tone="ok">
              {n} {(n === 1 ? EXERCISE_LABELS_SINGULAR : EXERCISE_LABELS)[t].toLowerCase()}
            </Badge>
          ))}
        </div>
      ) : (
        <span>Aucun exercice valide dans cette réponse.</span>
      )}
      {result.rejected.length > 0 && (
        <p className="mt-1.5 text-xs text-muted">
          {plural(result.rejected.length, 'élément ignoré', 'éléments ignorés')} : {result.rejected.map((r) => `#${r.index + 1} (${r.reason})`).join(', ')}
        </p>
      )}
    </>
  )
}
