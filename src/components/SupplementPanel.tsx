import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Pencil, TriangleAlert } from 'lucide-react'
import type { Cahier, Chapitre, SupplementKind } from '../types'
import { SUPPLEMENT_KIND_LABELS } from '../types'
import { addSupplements } from '../db'
import { useSettings } from '../lib/useSettings'
import { buildSupplementPrompt } from '../lib/prompt'
import { parseSupplementResponse, type SupplementParseResult } from '../lib/importClaude'
import { Badge, Button, Modal, plural } from './ui'
import { ClaudeRoundTrip, StepTitle } from './ClaudeRoundTrip'
import { ProgrammeModal } from './ProgrammeModal'

interface Props {
  open: boolean
  onClose: () => void
  cahier: Cahier
  chapitre: Chapitre
}

/** Asks Claude to compare the fiche with the programme and propose additions, imported as pending supplements. */
export function SupplementPanel(props: Props) {
  const [session, setSession] = useState(0)
  const [prevOpen, setPrevOpen] = useState(props.open)
  if (props.open !== prevOpen) {
    setPrevOpen(props.open)
    if (props.open) setSession((s) => s + 1)
  }
  return <Inner key={session} {...props} />
}

function Inner({ open, onClose, cahier, chapitre }: Props) {
  const settings = useSettings()
  const [parsed, setParsed] = useState<SupplementParseResult | null>(null)
  const [editingProgramme, setEditingProgramme] = useState(false)
  const [importing, setImporting] = useState(false)

  const programme = cahier.programme?.trim() ?? ''
  const prompt = useMemo(
    () => buildSupplementPrompt({ cahierName: cahier.name, title: chapitre.title, content: chapitre.content, programme, niveau: settings?.niveau }),
    [cahier.name, chapitre.title, chapitre.content, programme, settings?.niveau],
  )
  const emptyContent = chapitre.content.trim().length < 40

  async function importParsed() {
    if (!parsed?.supplements.length) return
    setImporting(true)
    try {
      await addSupplements(chapitre.id, chapitre.cahierId, parsed.supplements)
      onClose()
    } finally {
      setImporting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Compléter la fiche avec Claude"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Fermer
          </Button>
          <Button onClick={importParsed} disabled={!parsed?.supplements.length || importing}>
            <Check size={16} />
            {parsed?.supplements.length ? `Recevoir ${plural(parsed.supplements.length, 'complément')}` : 'Recevoir les compléments'}
          </Button>
        </>
      }
    >
      <ol className="flex flex-col gap-7">
        <li className="flex flex-col gap-3">
          <StepTitle n={1} title="Programme de référence" />
          {programme ? (
            <div className="rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm">
              <p className="line-clamp-3 whitespace-pre-wrap text-muted">{programme}</p>
              <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted">
                <span>{programme.length.toLocaleString('fr-FR')} caractères · cahier « {cahier.name} »</span>
                <Button variant="ghost" size="sm" onClick={() => setEditingProgramme(true)}>
                  <Pencil size={14} />
                  Modifier
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3 rounded-lg bg-warn-soft px-3 py-3 text-sm">
              <p className="flex items-start gap-2">
                <TriangleAlert size={18} className="mt-0.5 shrink-0 text-warn" />
                <span>
                  Aucun programme renseigné pour ce cahier. Claude s’appuiera sur ses connaissances du programme standard
                  {settings?.niveau ? ` (niveau « ${settings.niveau} »)` : ''} — c’est moins fiable qu’avec l’extrait du BO.
                  {!settings?.niveau && (
                    <>
                      {' '}
                      Renseigne au moins ton niveau dans les <Link to="/settings" className="font-medium text-accent">réglages</Link>.
                    </>
                  )}
                </span>
              </p>
              <div>
                <Button variant="secondary" size="sm" onClick={() => setEditingProgramme(true)}>
                  Renseigner le programme (BO, plan de cours)
                </Button>
              </div>
            </div>
          )}
          <p className="text-sm text-muted">
            Les compléments proposés arrivent dans une section à part de la fiche : tu choisis ensuite, un par un, ceux que tu gardes.
          </p>
        </li>

        <ClaudeRoundTrip
          firstStep={2}
          prompt={prompt}
          disabled={emptyContent}
          disabledHint={
            emptyContent ? (
              <p className="flex items-start gap-2 rounded-lg bg-warn-soft px-3 py-2 text-sm text-ink">
                <TriangleAlert size={18} className="mt-0.5 shrink-0 text-warn" />
                Cette fiche est presque vide : ajoute d’abord son contenu.
              </p>
            ) : null
          }
          parse={parseSupplementResponse}
          onParsed={setParsed}
          placeholder='{"supplements": [ … ]}'
          renderPreview={(r) => <SupplementPreview result={r} />}
        />
      </ol>

      <ProgrammeModal open={editingProgramme} onClose={() => setEditingProgramme(false)} cahier={cahier} />
    </Modal>
  )
}

function SupplementPreview({ result }: { result: SupplementParseResult }) {
  const byKind = new Map<SupplementKind, number>()
  result.supplements.forEach((s) => byKind.set(s.kind, (byKind.get(s.kind) ?? 0) + 1))
  return (
    <>
      {result.supplements.length ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{plural(result.supplements.length, 'complément')} :</span>
          {Array.from(byKind.entries()).map(([k, n]) => (
            <Badge key={k} tone="ok">
              {n} · {SUPPLEMENT_KIND_LABELS[k].toLowerCase()}
            </Badge>
          ))}
        </div>
      ) : (
        <span>Aucun complément valide dans cette réponse.</span>
      )}
      {result.rejected.length > 0 && (
        <p className="mt-1.5 text-xs text-muted">
          {plural(result.rejected.length, 'élément ignoré', 'éléments ignorés')} : {result.rejected.map((r) => `#${r.index + 1} (${r.reason})`).join(', ')}
        </p>
      )}
    </>
  )
}
