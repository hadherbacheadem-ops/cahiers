import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, TriangleAlert } from 'lucide-react'
import type { Cahier, Chapitre, MindmapNode } from '../types'
import { db, saveMindmap } from '../db'
import { useSettings } from '../lib/useSettings'
import { buildMindmapPrompt, joinFiches } from '../lib/prompt'
import { countNodes, parseMindmapResponse } from '../lib/importClaude'
import { Button, Modal, plural } from './ui'
import { ClaudeRoundTrip, StepTitle } from './ClaudeRoundTrip'

interface Props {
  open: boolean
  onClose: () => void
  cahier: Cahier
  /** Omit for a synthesis map of the whole cahier. */
  chapitre?: Chapitre
}

/** Generates a mind map (per fiche, or for the whole cahier) through claude.ai, saves it and opens it. */
export function MindmapPanel(props: Props) {
  const [session, setSession] = useState(0)
  const [prevOpen, setPrevOpen] = useState(props.open)
  if (props.open !== prevOpen) {
    setPrevOpen(props.open)
    if (props.open) setSession((s) => s + 1)
  }
  return <Inner key={session} {...props} />
}

function Inner({ open, onClose, cahier, chapitre }: Props) {
  const navigate = useNavigate()
  const settings = useSettings()
  const [root, setRoot] = useState<MindmapNode | null>(null)
  const [saving, setSaving] = useState(false)
  const fiches = useLiveQuery(() => db.chapitres.where('cahierId').equals(cahier.id).sortBy('createdAt'), [cahier.id])

  const content = chapitre ? chapitre.content : fiches ? joinFiches(fiches) : ''
  const title = chapitre ? chapitre.title : cahier.name
  const prompt = useMemo(
    () => buildMindmapPrompt({ cahierName: cahier.name, title, content, scope: chapitre ? 'chapitre' : 'cahier', niveau: settings?.niveau }),
    [cahier.name, title, content, chapitre, settings?.niveau],
  )
  const emptyContent = content.trim().length < 40

  async function save() {
    if (!root) return
    setSaving(true)
    try {
      const map = await saveMindmap({ cahierId: cahier.id, chapitreId: chapitre?.id, title: root.label || title, root })
      onClose()
      navigate(`/carte/${map.id}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={chapitre ? 'Carte mentale de la fiche' : 'Carte mentale du cahier'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Fermer
          </Button>
          <Button onClick={save} disabled={!root || saving}>
            <Check size={16} />
            Enregistrer et afficher la carte
          </Button>
        </>
      }
    >
      <ol className="flex flex-col gap-7">
        <li className="flex flex-col gap-2">
          <StepTitle n={1} title="Ce que Claude va cartographier" />
          <p className="text-sm text-muted">
            {chapitre ? (
              <>
                La fiche « {chapitre.title} » ({chapitre.content.length.toLocaleString('fr-FR')} caractères). Une branche par grande partie, les notions clés en sous-branches.
              </>
            ) : (
              <>
                Les {plural(fiches?.length ?? 0, 'fiche')} du cahier « {cahier.name} » ({content.length.toLocaleString('fr-FR')} caractères). Une branche par fiche : une vue d’ensemble de la matière.
              </>
            )}
          </p>
          <p className="text-sm text-muted">Si une carte existe déjà pour ce périmètre, elle sera remplacée.</p>
        </li>

        <ClaudeRoundTrip
          firstStep={2}
          prompt={prompt}
          disabled={emptyContent}
          disabledHint={
            emptyContent ? (
              <p className="flex items-start gap-2 rounded-lg bg-warn-soft px-3 py-2 text-sm text-ink">
                <TriangleAlert size={18} className="mt-0.5 shrink-0 text-warn" />
                Il n’y a presque rien à cartographier : ajoute d’abord du contenu.
              </p>
            ) : null
          }
          parse={parseMindmapResponse}
          onParsed={setRoot}
          placeholder='{"mindmap": { "label": "…", "children": [ … ] }}'
          renderPreview={(r) => (
            <span className="font-medium">
              Carte « {r.label} » : {plural(r.children?.length ?? 0, 'branche')}, {plural(countNodes(r), 'nœud')} au total.
            </span>
          )}
        />
      </ol>
    </Modal>
  )
}
