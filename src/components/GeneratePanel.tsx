import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, GraduationCap, TriangleAlert } from 'lucide-react'
import type { Chapitre, ExerciseType, PointDeCours } from '../types'
import { EXERCISE_LABELS, EXERCISE_LABELS_SINGULAR, GENERATABLE_TYPES } from '../types'
import { db, deleteExercises, deleteKv, importGeneration, pretestKey, updateChapitre, updateSettings, type PretestRecord } from '../db'
import { useSettings } from '../lib/useSettings'
import { buildPrompt } from '../lib/prompt'
import { buildPrepaPrompt, prepaSection } from '../lib/prepaPrompt'
import { parseClaudeResponse, parsePrepaResponse, prepaCount, toPreparation, type ParsedPrepa, type ParseResult } from '../lib/importClaude'
import { exerciseKeyText, lintAnchor, lintBatch, type LintReport } from '../lib/lint'
import { Badge, Button, Modal, plural } from './ui'
import { ClaudeRoundTrip, RejectedList, StepTitle } from './ClaudeRoundTrip'

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
  /** Regenerate: the exercises never reviewed are removed when the new ones arrive; the reviewed ones stay. */
  replace?: boolean
  /** Only the kholle / DS preparation (the exercises are left alone). */
  prepaOnly?: boolean
}

/** Never answered: safe to replace (no history to lose). */
function isFresh(e: { fsrs: { reps: number; lapses: number } }): boolean {
  return e.fsrs.reps + e.fsrs.lapses === 0
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
  prepa?: ParsedPrepa
  reports: LintReport[]
  anchorIssues: number
  warnCount: number
}

function GenerateInner({ open, onClose, chapitre, cahierName, focus, replace = false, prepaOnly = false }: Props) {
  const navigate = useNavigate()
  const settings = useSettings()
  const existing = useLiveQuery(() => db.exercises.where('chapitreId').equals(chapitre.id).toArray(), [chapitre.id])
  const pretest = useLiveQuery(() => db.kv.get(pretestKey(chapitre.cahierId)).then((r) => (r?.value as PretestRecord | undefined) ?? null), [chapitre.cahierId])
  const [usePretest, setUsePretest] = useState(true)
  const [types, setTypes] = useState<ExerciseType[] | null>(null)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [importing, setImporting] = useState(false)
  // The preparation rides along with the exercises by default; it can also be asked for on its own.
  const [withPrepa, setWithPrepa] = useState(true)

  const effectiveTypes = types ?? settings?.promptTypes ?? []
  const focused = !!(focus?.points?.length || focus?.passages?.length)
  // Pre-tested questions ride along as extra passages to cover (only the pre-tested items benefit).
  const pretestPassages = useMemo(() => (pretest && usePretest ? pretest.questions.map((q) => `Question du pré-test : ${q.question}\nRéponse attendue : ${q.answer}`) : []), [pretest, usePretest])
  const prompt = useMemo(
    () =>
      prepaOnly
        ? buildPrepaPrompt({ cahierName, title: chapitre.title, content: chapitre.content, niveau: settings?.niveau })
        : buildPrompt({
        cahierName,
        title: chapitre.title,
        content: chapitre.content,
        types: effectiveTypes,
        niveau: settings?.niveau,
        focus:
          focused || pretestPassages.length
            ? { points: focus?.points?.map((p) => ({ id: p.id, title: p.title, anchor: p.anchor })), passages: [...(focus?.passages ?? []), ...(focused ? pretestPassages : [])] }
            : undefined,
        prepaSection: withPrepa && !focused ? prepaSection(settings?.niveau) : undefined,
      }),
    [prepaOnly, withPrepa, effectiveTypes, cahierName, chapitre, settings?.niveau, focus, focused, pretestPassages],
  )
  const emptyContent = chapitre.content.trim().length < 40

  function toggle(type: ExerciseType, on: boolean) {
    const next = on ? [...effectiveTypes.filter((t) => t !== type), type] : effectiveTypes.filter((t) => t !== type)
    setTypes(next)
    updateSettings({ promptTypes: next })
  }

  /** Parse + lint, so the preview can say how many items the validator will flag. */
  function analyse(text: string): Analysis {
    if (prepaOnly) return { result: { points: [], exercises: [], rejected: [], repairs: { doubledBackslashes: 0, trailingCommas: 0, commands: [], offsets: [] } }, prepa: parsePrepaResponse(text), reports: [], anchorIssues: 0, warnCount: 0 }
    const result = parseClaudeResponse(text)
    // When regenerating, the never-reviewed exercises are about to go: no point flagging the new ones as their duplicates.
    const existingKeys = (existing ?? []).filter((e) => e.status !== 'pending' && !(replace && isFresh(e))).map((e) => exerciseKeyText(e.data))
    const reports = lintBatch(
      result.exercises.map((e) => e.data),
      { existingKeys },
    )
    const anchorIssues = result.points.filter((p) => lintAnchor(p.anchor, chapitre.content)).length
    const warnCount = reports.filter((r) => r.issues.some((i) => i.severity === 'warn')).length
    return { result, prepa: result.prepa, reports, anchorIssues, warnCount }
  }

  async function importParsed() {
    if ((!analysis?.result.exercises.length && !prepaN) || !settings || !analysis) return
    setImporting(true)
    try {
      const { result } = analysis
      const status = settings.autoValidate ? 'active' : 'pending'
      if (result.exercises.length) {
        if (replace && existing) await deleteExercises(existing.filter(isFresh).map((e) => e.id))
        await importGeneration(chapitre.id, chapitre.cahierId, result.points, result.exercises, status, settings.autoInverse)
        if (pretest && usePretest) await deleteKv(pretestKey(chapitre.cahierId))
      }
      if (analysis.prepa && prepaN) await updateChapitre(chapitre.id, { prepa: toPreparation(analysis.prepa) })
      onClose()
      if (result.exercises.length && status === 'pending') navigate(`/cahier/${chapitre.cahierId}/fiche/${chapitre.id}/valider`)
      else if (!result.exercises.length) navigate(`/cahier/${chapitre.cahierId}/fiche/${chapitre.id}/preparation`)
    } finally {
      setImporting(false)
    }
  }

  const count = analysis?.result.exercises.length ?? 0
  const prepaN = analysis?.prepa ? prepaCount(analysis.prepa) : 0
  const validateLater = settings && !settings.autoValidate

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={prepaOnly ? 'Préparation aux kholles et aux DS avec Claude' : replace ? 'Régénérer les exercices avec Claude' : focused ? `Générer des exercices — ${focus?.label ?? 'sélection'}` : 'Générer des exercices avec Claude'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Fermer
          </Button>
          <Button onClick={importParsed} disabled={(!count && !prepaN) || importing}>
            <Check size={16} />
            {prepaOnly
              ? prepaN
                ? `Ajouter ${plural(prepaN, 'exercice')} de préparation`
                : 'Ajouter la préparation'
              : count
              ? replace
                ? `Remplacer par ${plural(count, 'exercice')}`
                : validateLater
                  ? `Recevoir ${plural(count, 'exercice')} et valider`
                  : `Ajouter ${plural(count, 'exercice')}`
              : replace
                ? 'Remplacer les exercices'
                : 'Ajouter les exercices'}
          </Button>
        </>
      }
    >
      <ol className="flex flex-col gap-7">
        {prepaOnly ? (
          <li className="flex flex-col gap-3">
            <StepTitle n={1} title="Ce que Claude va chercher" />
            <p className="text-sm text-muted">
              Des exercices d’annales de concours sur cette fiche, pour les kholles et pour les DS : 2 à 3 par concours, du plus accessible au plus difficile. Claude cherche sur le web, cite la source de chacun, écrit trois indices et la
              correction. Vérifie les sources : un énoncé marqué « adapté » n’est pas recopié tel quel.
              {(chapitre.prepa && ' La préparation actuelle de la fiche sera remplacée.') || ''}
            </p>
          </li>
        ) : (
        <li className="flex flex-col gap-3">
          <StepTitle n={1} title="Types d’exercices autorisés" />
          {replace && existing && (
            <p className="flex items-start gap-2 rounded-lg bg-warn-soft px-3 py-2 text-sm text-ink">
              <TriangleAlert size={18} className="mt-0.5 shrink-0 text-warn" />
              <span>
                À l’arrivée des nouveaux exercices, {plural(existing.filter(isFresh).length, 'exercice jamais révisé sera supprimé', 'exercices jamais révisés seront supprimés')}
                {existing.some((e) => !isFresh(e)) ? ` ; ${plural(existing.filter((e) => !isFresh(e)).length, 'exercice déjà révisé est conservé', 'exercices déjà révisés sont conservés')} avec leur historique.` : '.'}
              </span>
            </p>
          )}
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
          {pretest && (
            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-accent/40 bg-accent-soft/40 px-3 py-2 text-sm">
              <input type="checkbox" checked={usePretest} onChange={(e) => setUsePretest(e.target.checked)} className="mt-0.5 size-4 accent-accent" />
              <span>
                Couvrir les {plural(pretest.questions.length, 'question')} du pré-test « {pretest.topic} »
                <span className="block text-xs text-muted">Les notions testées avant le cours sont celles qui profitent du pré-test : elles sont ajoutées comme points à couvrir, puis le pré-test est effacé.</span>
              </span>
            </label>
          )}
          <p className="text-sm text-muted">
            Claude liste d’abord les points de cours de la fiche (définitions, formules, étapes, exemples…), puis écrit 1 à 3 exercices par point : un fait par exercice, QCM à distracteurs compétitifs, formules en LaTeX.
            {settings?.autoInverse ? ' Les cartes inverses (définition → terme) sont ajoutées automatiquement.' : ''} Ces choix de types sont mémorisés.
          </p>
          {!focused && (
            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm">
              <input type="checkbox" checked={withPrepa} onChange={(e) => setWithPrepa(e.target.checked)} className="mt-0.5 size-4 accent-accent" />
              <span>
                <span className="flex items-center gap-1.5 font-medium">
                  <GraduationCap size={15} aria-hidden="true" />
                  Ajouter la préparation aux kholles et aux DS
                </span>
                <span className="block text-xs text-muted">Claude cherche des exercices d’annales (CCP, Centrale, X…) sur cette fiche, avec trois indices et une correction chacun. Tu peux aussi la demander à part, depuis « Préparation ».</span>
              </span>
            </label>
          )}
        </li>
        )}

        <ClaudeRoundTrip
          firstStep={2}
          prompt={prompt}
          disabled={(!prepaOnly && effectiveTypes.length === 0) || emptyContent}
          disabledHint={
            emptyContent ? (
              <p className="flex items-start gap-2 rounded-lg bg-warn-soft px-3 py-2 text-sm text-ink">
                <TriangleAlert size={18} className="mt-0.5 shrink-0 text-warn" />
                Cette fiche est presque vide : Claude n’aura rien pour travailler. Modifie d’abord son contenu.
              </p>
            ) : !prepaOnly && effectiveTypes.length === 0 ? (
              <p className="flex items-start gap-2 rounded-lg bg-warn-soft px-3 py-2 text-sm text-ink">
                <TriangleAlert size={18} className="mt-0.5 shrink-0 text-warn" />
                Coche au moins un type d’exercice.
              </p>
            ) : null
          }
          parse={analyse}
          onParsed={setAnalysis}
          placeholder={prepaOnly ? '{"preparation": { "kholle": [ … ], "ds": [ … ] }}' : '{"points": [ … ], "exercises": [ … ]}'}
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
  const prepa = analysis.prepa
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
      ) : prepa && prepaCount(prepa) ? null : (
        <span>Aucun exercice valide dans cette réponse.</span>
      )}
      {prepa && prepaCount(prepa) > 0 && (
        <p className="mt-1 flex flex-wrap items-center gap-2">
          <span className="font-medium">Préparation :</span>
          <Badge tone="ok">{plural(prepa.kholle.length, 'exercice de kholle', 'exercices de kholle')}</Badge>
          <Badge tone="ok">{plural(prepa.ds.length, 'exercice de DS', 'exercices de DS')}</Badge>
          {[...prepa.kholle, ...prepa.ds].some((e) => !e.exact) && <Badge tone="warn">énoncés adaptés à vérifier</Badge>}
        </p>
      )}
      {prepa?.note && <p className="mt-1 text-xs text-muted">Note de Claude : {prepa.note}</p>}
      <ul className="mt-1.5 flex flex-col gap-0.5 text-xs text-muted">
        {warnCount > 0 && (
          <li>
            {plural(warnCount, 'exercice signalé', 'exercices signalés')} par le linter{validateLater ? ' : tu les verras dans la file de validation.' : '.'}
          </li>
        )}
        {anchorIssues > 0 && <li>{plural(anchorIssues, 'ancre introuvable', 'ancres introuvables')} dans la fiche (citation reformulée par Claude).</li>}
        {unlinked > 0 && result.points.length > 0 && <li>{plural(unlinked, 'exercice sans point de cours', 'exercices sans point de cours')} (pointId manquant).</li>}
        <RejectedList rejected={[...result.rejected, ...(prepa?.rejected ?? [])]} what="exercices" />
      </ul>
    </>
  )
}
