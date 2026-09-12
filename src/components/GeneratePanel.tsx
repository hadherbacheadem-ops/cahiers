import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Warning } from '@phosphor-icons/react'
import type { Chapitre, ExerciseType, PointDeCours } from '../types'
import { EXERCISE_LABELS, EXERCISE_LABELS_SINGULAR, GENERATABLE_TYPES } from '../types'
import { db, importGeneration, updateSettings } from '../db'
import { useSettings } from '../lib/useSettings'
import { buildPrompt } from '../lib/prompt'
import { parseClaudeResponse, type ParseResult } from '../lib/importClaude'
import { exerciseKeyText, lintAnchor, lintBatch, type LintReport } from '../lib/lint'
import { Badge, Button, Modal, plural } from './ui'
import { ClaudeRoundTrip, StepTitle } from './ClaudeRoundTrip'

/** Restricts a generation to given points / passages (coverage view, kept supplements). */
export interface GenerateFocus {
  points?: PointDeCours[]
  passages?: string[]
  label?: string
}

interface Props {
  open: boolean
  onClose: () => void
  chapitre: Chapitre
  cahierName: string
  focus?: GenerateFocus
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

interface Analysis {
  result: ParseResult
  reports: LintReport[]
  anchorIssues: number
  warnCount: number
}

function GenerateInner({ open, onClose, chapitre, cahierName, focus }: Props) {
  const navigate = useNavigate()
  const settings = useSettings()
  const existing = useLiveQuery(() => db.exercises.where('chapitreId').equals(chapitre.id).toArray(), [chapitre.id])
  const [types, setTypes] = useState<ExerciseType[] | null>(null)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [importing, setImporting] = useState(false)

  const effectiveTypes = types ?? settings?.promptTypes ?? []
  const focused = !!(focus?.points?.length || focus?.passages?.length)
  const prompt = useMemo(
    () =>
      buildPrompt({
        cahierName,
        title: chapitre.title,
        content: chapitre.content,
        types: effectiveTypes,
        niveau: settings?.niveau,
        focus: focused ? { points: focus?.points?.map((p) => ({ id: p.id, title: p.title, anchor: p.anchor })), passages: focus?.passages } : undefined,
      }),
    [effectiveTypes, cahierName, chapitre, settings?.niveau, focus, focused],
  )
  const emptyContent = chapitre.content.trim().length < 40

  function toggle(type: ExerciseType, on: boolean) {
    const next = on ? [...effectiveTypes.filter((t) => t !== type), type] : effectiveTypes.filter((t) => t !== type)
    setTypes(next)
    updateSettings({ promptTypes: next })
  }

  /** Parse + lint, so the preview can say how many items the validator will flag. */
  function analyse(text: string): Analysis {
    const result = parseClaudeResponse(text)
    const existingKeys = (existing ?? []).filter((e) => e.status !== 'pending').map((e) => exerciseKeyText(e.data))
    const reports = lintBatch(
      result.exercises.map((e) => e.data),
      { existingKeys },
    )
    const anchorIssues = result.points.filter((p) => lintAnchor(p.anchor, chapitre.content)).length
    const warnCount = reports.filter((r) => r.issues.some((i) => i.severity === 'warn')).length
    return { result, reports, anchorIssues, warnCount }
  }

  async function importParsed() {
    if (!analysis?.result.exercises.length || !settings) return
    setImporting(true)
    try {
      const { result } = analysis
      const status = settings.autoValidate ? 'active' : 'pending'
      await importGeneration(chapitre.id, chapitre.cahierId, result.points, result.exercises, status, settings.autoInverse)
      onClose()
      if (status === 'pending') navigate(`/cahier/${chapitre.cahierId}/fiche/${chapitre.id}/valider`)
    } finally {
      setImporting(false)
    }
  }

  const count = analysis?.result.exercises.length ?? 0
  const validateLater = settings && !settings.autoValidate

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={focused ? `Générer des exercices — ${focus?.label ?? 'sélection'}` : 'Générer des exercices avec Claude'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Fermer
          </Button>
          <Button onClick={importParsed} disabled={!count || importing}>
            <Check size={16} weight="bold" />
            {count ? (validateLater ? `Recevoir ${plural(count, 'exercice')} et valider` : `Ajouter ${plural(count, 'exercice')}`) : 'Ajouter les exercices'}
          </Button>
        </>
      }
    >
      <ol className="flex flex-col gap-7">
        <li className="flex flex-col gap-3">
          <StepTitle n={1} title="Types d’exercices autorisés" />
          {focused && (
            <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm">
              Génération ciblée : {focus?.points?.length ? plural(focus.points.length, 'point de cours', 'points de cours') : ''}
              {focus?.points?.length && focus?.passages?.length ? ' et ' : ''}
              {focus?.passages?.length ? plural(focus.passages.length, 'passage sans point', 'passages sans point') : ''}. Le reste de la fiche est fourni pour le contexte seulement.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {GENERATABLE_TYPES.map((t) => {
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
            Claude liste d’abord les points de cours de la fiche (définitions, formules, étapes, exemples…), puis écrit 1 à 3 exercices par point : un fait par exercice, QCM à distracteurs compétitifs, formules en LaTeX.
            {settings?.autoInverse ? ' Les cartes inverses (définition → terme) sont ajoutées automatiquement.' : ''} Ces choix de types sont mémorisés.
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
          parse={analyse}
          onParsed={setAnalysis}
          placeholder='{"points": [ … ], "exercises": [ … ]}'
          renderPreview={(a) => <GenerationPreview analysis={a} validateLater={!!validateLater} />}
        />
      </ol>
    </Modal>
  )
}

function GenerationPreview({ analysis, validateLater }: { analysis: Analysis; validateLater: boolean }) {
  const { result, anchorIssues, warnCount } = analysis
  const byType = new Map<ExerciseType, number>()
  result.exercises.forEach((e) => byType.set(e.data.type, (byType.get(e.data.type) ?? 0) + 1))
  const unlinked = result.exercises.filter((e) => !e.localPointId || !result.points.some((p) => p.localId === e.localPointId)).length
  return (
    <>
      {result.exercises.length ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">
            {plural(result.points.length, 'point de cours', 'points de cours')}, {plural(result.exercises.length, 'exercice')} :
          </span>
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
        {warnCount > 0 && (
          <li>
            {plural(warnCount, 'exercice signalé', 'exercices signalés')} par le linter{validateLater ? ' : tu les verras dans la file de validation.' : '.'}
          </li>
        )}
        {anchorIssues > 0 && <li>{plural(anchorIssues, 'ancre introuvable', 'ancres introuvables')} dans la fiche (citation reformulée par Claude).</li>}
        {unlinked > 0 && result.points.length > 0 && <li>{plural(unlinked, 'exercice sans point de cours', 'exercices sans point de cours')} (pointId manquant).</li>}
        {result.rejected.length > 0 && (
          <li>
            {plural(result.rejected.length, 'élément ignoré', 'éléments ignorés')} : {result.rejected.map((r) => `#${r.index + 1} (${r.reason})`).join(', ')}
          </li>
        )}
      </ul>
    </>
  )
}
