import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Plus, UploadSimple, Warning, X } from '@phosphor-icons/react'
import type { Cahier } from '../types'
import { createChapitre } from '../db'
import { useSettings } from '../lib/useSettings'
import { buildFichePrompt, type FicheSource } from '../lib/prompt'
import { parseFicheResponse, type FicheParseResult } from '../lib/importClaude'
import { fileToText, ACCEPTED_EXTENSIONS } from '../lib/parsers'
import { uid } from '../lib/ids'
import { Button, Field, IconButton, Input, Modal, Textarea, cx, plural } from './ui'
import { ClaudeRoundTrip, StepTitle } from './ClaudeRoundTrip'

interface Props {
  open: boolean
  onClose: () => void
  cahier: Cahier
}

type Source = FicheSource & { id: string }

/** Claude writes one or more fiches from the raw course material and the user's notes. */
export function CreateFichePanel(props: Props) {
  const [session, setSession] = useState(0)
  const [prevOpen, setPrevOpen] = useState(props.open)
  if (props.open !== prevOpen) {
    setPrevOpen(props.open)
    if (props.open) setSession((s) => s + 1)
  }
  return <Inner key={session} {...props} />
}

function Inner({ open, onClose, cahier }: Props) {
  const navigate = useNavigate()
  const settings = useSettings()
  const [sources, setSources] = useState<Source[]>([
    { id: uid(), label: 'Cours', content: '' },
    { id: uid(), label: 'Mes notes', content: '' },
  ])
  const [split, setSplit] = useState<'auto' | 'one'>('auto')
  const [useProgramme, setUseProgramme] = useState(true)
  const [instructions, setInstructions] = useState('')
  const [parsed, setParsed] = useState<FicheParseResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [fileError, setFileError] = useState<string>()
  const [creating, setCreating] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const programme = cahier.programme?.trim() ?? ''
  const filled = sources.filter((s) => s.content.trim().length > 0)
  const totalChars = filled.reduce((n, s) => n + s.content.length, 0)
  const prompt = useMemo(
    () =>
      filled.length
        ? buildFichePrompt({
            cahierName: cahier.name,
            sources: filled.map(({ label, content }) => ({ label, content })),
            split,
            programme: useProgramme && programme ? programme : undefined,
            niveau: settings?.niveau,
            instructions,
          })
        : '',
    [filled, cahier.name, split, useProgramme, programme, settings?.niveau, instructions],
  )
  const tooShort = totalChars < 80

  function patch(id: string, p: Partial<FicheSource>) {
    setSources((list) => list.map((s) => (s.id === id ? { ...s, ...p } : s)))
  }

  async function importFiles(files: FileList | null) {
    if (!files?.length) return
    setBusy(true)
    setFileError(undefined)
    try {
      const added: Source[] = []
      for (const f of Array.from(files)) {
        const { title, content } = await fileToText(f)
        added.push({ id: uid(), label: title, content })
      }
      // Drop the empty placeholders once real material arrives.
      setSources((list) => [...list.filter((s) => s.content.trim()), ...added])
    } catch (e) {
      setFileError(e instanceof Error ? e.message : 'Fichier illisible.')
    } finally {
      setBusy(false)
    }
  }

  async function create() {
    if (!parsed?.fiches.length) return
    setCreating(true)
    try {
      const created = []
      for (const f of parsed.fiches) created.push(await createChapitre({ cahierId: cahier.id, title: f.title, content: f.content, source: 'claude' }))
      onClose()
      if (created.length === 1) navigate(`/cahier/${cahier.id}/fiche/${created[0].id}`)
    } finally {
      setCreating(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Rédiger des fiches avec Claude"
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Fermer
          </Button>
          <Button onClick={create} disabled={!parsed?.fiches.length || creating}>
            <Check size={16} weight="bold" />
            {parsed?.fiches.length ? `Créer ${plural(parsed.fiches.length, 'fiche')}` : 'Créer les fiches'}
          </Button>
        </>
      }
    >
      <ol className="flex flex-col gap-7">
        <li className="flex flex-col gap-3">
          <StepTitle n={1} title="Tes sources : le cours et tes notes" />
          <p className="text-sm text-muted">
            Colle le cours du professeur, tes notes prises en classe, un extrait du manuel… ou importe des fichiers. Claude fusionne tout en une fiche structurée sans rien perdre.
          </p>
          <ul className="flex flex-col gap-3">
            {sources.map((s) => (
              <li key={s.id} className="flex flex-col gap-2 rounded-lg border border-line bg-surface-2 p-3">
                <div className="flex items-center gap-2">
                  <Input value={s.label} onChange={(e) => patch(s.id, { label: e.target.value })} placeholder="Nom de la source (Cours, Mes notes, Manuel…)" className="h-9 max-w-xs bg-surface text-sm" aria-label="Nom de la source" />
                  <span className="ml-auto text-xs text-muted tabular-nums">{s.content.length ? `${s.content.length.toLocaleString('fr-FR')} caractères` : 'vide'}</span>
                  <IconButton label="Retirer cette source" onClick={() => setSources((list) => list.filter((x) => x.id !== s.id))} disabled={sources.length === 1}>
                    <X size={16} />
                  </IconButton>
                </div>
                <Textarea value={s.content} onChange={(e) => patch(s.id, { content: e.target.value })} placeholder="Colle le texte ici…" className="min-h-28 bg-surface text-sm" aria-label={`Contenu : ${s.label || 'source'}`} />
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setSources((list) => [...list, { id: uid(), label: '', content: '' }])}>
              <Plus size={14} weight="bold" />
              Ajouter un texte
            </Button>
            <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
              <UploadSimple size={14} />
              {busy ? 'Lecture…' : 'Importer des fichiers (PDF, Word, texte)'}
            </Button>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept={ACCEPTED_EXTENSIONS.join(',')}
              className="hidden"
              onChange={(e) => {
                importFiles(e.target.files)
                e.target.value = ''
              }}
            />
            {fileError && <span className="text-sm text-bad">{fileError}</span>}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1 text-sm font-medium">Découpage</legend>
              {(
                [
                  ['auto', 'Laisser Claude décider (une fiche par chapitre s’il y en a plusieurs)'],
                  ['one', 'Une seule fiche'],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className={cx('flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm', split === value ? 'border-accent bg-accent-soft' : 'border-line-strong')}>
                  <input type="radio" name="split" checked={split === value} onChange={() => setSplit(value)} className="mt-0.5 accent-accent" />
                  {label}
                </label>
              ))}
            </fieldset>
            <div className="flex flex-col gap-3">
              {programme && (
                <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-line-strong px-3 py-2 text-sm">
                  <input type="checkbox" checked={useProgramme} onChange={(e) => setUseProgramme(e.target.checked)} className="mt-0.5 accent-accent" />
                  <span>
                    S’appuyer sur le programme du cahier
                    <span className="block text-xs text-muted">Pour ordonner la fiche et lister ce qui manque dans tes sources.</span>
                  </span>
                </label>
              )}
              <Field label="Consignes (optionnel)">
                {(id) => <Input id={id} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Ex. insiste sur les définitions, garde les exemples du prof" />}
              </Field>
            </div>
          </div>
        </li>

        <ClaudeRoundTrip
          firstStep={2}
          prompt={prompt}
          disabled={tooShort}
          disabledHint={
            tooShort ? (
              <p className="flex items-start gap-2 rounded-lg bg-warn-soft px-3 py-2 text-sm text-ink">
                <Warning size={18} className="mt-0.5 shrink-0 text-warn" />
                Ajoute d’abord du contenu dans au moins une source.
              </p>
            ) : null
          }
          parse={parseFicheResponse}
          onParsed={setParsed}
          placeholder='{"fiches": [ { "title": "…", "content": "…" } ]}'
          renderPreview={(r) => (
            <>
              {r.fiches.length ? (
                <div>
                  <span className="font-medium">{plural(r.fiches.length, 'fiche prête', 'fiches prêtes')} :</span>
                  <ul className="mt-1 list-disc pl-5">
                    {r.fiches.map((f, i) => (
                      <li key={i}>
                        {f.title} <span className="text-muted">({f.content.length.toLocaleString('fr-FR')} caractères)</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <span>Aucune fiche valide dans cette réponse.</span>
              )}
              {r.rejected.length > 0 && (
                <p className="mt-1.5 text-xs text-muted">
                  {plural(r.rejected.length, 'élément ignoré', 'éléments ignorés')} : {r.rejected.map((x) => `#${x.index + 1} (${x.reason})`).join(', ')}
                </p>
              )}
            </>
          )}
        />
      </ol>
    </Modal>
  )
}
