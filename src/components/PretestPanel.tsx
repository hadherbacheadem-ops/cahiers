import { useMemo, useState } from 'react'
import { Check } from 'lucide-react'
import type { Cahier } from '../types'
import { pretestKey, setKv, type PretestRecord } from '../db'
import { useSettings } from '../lib/useSettings'
import { buildPretestPrompt } from '../lib/prompt'
import { parsePretestResponse } from '../lib/importClaude'
import { Button, Field, Input, Modal, plural } from './ui'
import { Markdown } from './Markdown'
import { ClaudeRoundTrip, StepTitle } from './ClaudeRoundTrip'

interface Props {
  open: boolean
  onClose: () => void
  cahier: Cahier
}

/**
 * Pre-test before a new chapter: a few conceptual questions answered without
 * grading, feedback at the end; the questions are then offered as points to
 * cover when the chapter's exercises are generated (only the pre-tested items
 * benefit, so they are the ones to turn into exercises).
 */
export function PretestPanel(props: Props) {
  const [session, setSession] = useState(0)
  const [prevOpen, setPrevOpen] = useState(props.open)
  if (props.open !== prevOpen) {
    setPrevOpen(props.open)
    if (props.open) setSession((s) => s + 1)
  }
  return <Inner key={session} {...props} />
}

type Q = { question: string; answer: string }

function Inner({ open, onClose, cahier }: Props) {
  const settings = useSettings()
  const [topic, setTopic] = useState('')
  const [questions, setQuestions] = useState<Q[] | null>(null)
  const [stage, setStage] = useState<'prepare' | 'answer' | 'review'>('prepare')
  const [given, setGiven] = useState<string[]>([])
  const [index, setIndex] = useState(0)

  const prompt = useMemo(() => (topic.trim() ? buildPretestPrompt({ cahierName: cahier.name, topic: topic.trim(), programme: cahier.programme, niveau: settings?.niveau }) : ''), [topic, cahier, settings?.niveau])

  function start() {
    if (!questions) return
    setGiven(questions.map(() => ''))
    setIndex(0)
    setStage('answer')
  }

  async function finish() {
    if (!questions) return
    const record: PretestRecord = { topic: topic.trim(), questions: questions.map((q, i) => ({ ...q, given: given[i] ?? '' })), at: Date.now() }
    await setKv(pretestKey(cahier.id), record)
    setStage('review')
  }

  const current = questions?.[index]

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={stage === 'prepare' ? 'Pré-test avant un nouveau chapitre' : stage === 'answer' ? `Pré-test · ${topic}` : 'Pré-test : réponses attendues'}
      size="lg"
      footer={
        stage === 'prepare' ? (
          <>
            <Button variant="secondary" onClick={onClose}>
              Fermer
            </Button>
            <Button onClick={start} disabled={!questions?.length}>
              Commencer le pré-test ({plural(questions?.length ?? 0, 'question')})
            </Button>
          </>
        ) : stage === 'answer' ? (
          <>
            <Button variant="secondary" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}>
              Précédente
            </Button>
            {index < (questions?.length ?? 0) - 1 ? (
              <Button onClick={() => setIndex((i) => i + 1)}>Suivante</Button>
            ) : (
              <Button onClick={finish}>
                <Check size={16} />
                Voir les réponses
              </Button>
            )}
          </>
        ) : (
          <Button onClick={onClose}>Terminer</Button>
        )
      }
    >
      {stage === 'prepare' && (
        <ol className="flex flex-col gap-7">
          <li className="flex flex-col gap-3">
            <StepTitle n={1} title="Le chapitre que tu vas étudier" />
            <Field label="Sujet du chapitre" hint={cahier.programme?.trim() ? 'Les questions s’appuient sur le programme du cahier.' : 'Sans programme renseigné, Claude s’appuie sur le programme standard de ton niveau.'}>
              {(id) => <Input id={id} autoFocus value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Ex. Induction électromagnétique" />}
            </Field>
            <p className="text-sm text-muted">
              Répondre à des questions avant le cours aide à retenir les points testés (g ≈ 0,54), pas le reste : après la rédaction de la fiche, ces questions te seront proposées comme points à couvrir par les exercices.
            </p>
          </li>
          <ClaudeRoundTrip
            firstStep={2}
            prompt={prompt}
            disabled={!topic.trim()}
            parse={parsePretestResponse}
            onParsed={setQuestions}
            placeholder='{"questions": [ { "question": "…", "answer": "…" } ]}'
            renderPreview={(qs) => <span className="font-medium">{plural(qs.length, 'question')} prêtes.</span>}
          />
        </ol>
      )}

      {stage === 'answer' && current && (
        <div className="flex flex-col gap-4">
          <p className="text-xs text-muted">
            Question {index + 1} / {questions!.length} · sans notation : réponds avec ce que tu crois savoir.
          </p>
          <p className="text-lg font-medium leading-snug">
            <Markdown inline text={current.question} />
          </p>
          <textarea
            key={index}
            autoFocus
            value={given[index] ?? ''}
            onChange={(e) => {
              const next = given.slice()
              next[index] = e.target.value
              setGiven(next)
            }}
            placeholder="Ta réponse…"
            className="min-h-28 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-base leading-relaxed text-ink ring-focus"
          />
        </div>
      )}

      {stage === 'review' && questions && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted">Le feedback arrive en fin de test, exprès. Lis chaque réponse attendue en la comparant à la tienne : les écarts sont ce que le chapitre va t’apprendre.</p>
          <ol className="flex flex-col divide-y divide-line">
            {questions.map((q, i) => (
              <li key={i} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0 text-sm">
                <p className="font-medium">
                  {i + 1}. <Markdown inline text={q.question} />
                </p>
                <p className="rounded-lg bg-surface-2 px-3 py-2 whitespace-pre-wrap text-muted">{given[i]?.trim() || '(sans réponse)'}</p>
                <div className="rounded-lg bg-ok-soft px-3 py-2">
                  <Markdown text={q.answer} />
                </div>
              </li>
            ))}
          </ol>
          <p className="text-sm text-muted">Ces {plural(questions.length, 'question')} sont mémorisées : à la prochaine génération d’exercices dans ce cahier, une case te proposera de les couvrir.</p>
        </div>
      )}
    </Modal>
  )
}
