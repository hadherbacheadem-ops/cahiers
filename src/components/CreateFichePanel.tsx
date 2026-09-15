import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, Check, Image, Plus, TriangleAlert, Upload, X } from 'lucide-react'
import type { Cahier, Chapitre } from '../types'
import { createChapitre, updateChapitre } from '../db'
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
  /** Rewrite mode: this fiche is the first source and gets replaced by Claude's version (points and exercises untouched). */
  rewrite?: Chapitre
  /** Text received by share (share_target): becomes the first source. */
  initialText?: string
}

type Source = FicheSource & { id: string }

/** claude.ai accepts up to 20 images per message. */
const MAX_PHOTOS = 20

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

function Inner({ open, onClose, cahier, rewrite, initialText }: Props) {
  const navigate = useNavigate()
  const settings = useSettings()
  const [sources, setSources] = useState<Source[]>(() =>
    rewrite
      ? [
          { id: uid(), label: 'Fiche actuelle', content: rewrite.content },
          { id: uid(), label: 'Mes notes', content: '' },
        ]
      : [
          { id: uid(), label: 'Cours', content: initialText ?? '' },
          { id: uid(), label: 'Mes notes', content: '' },
        ],
  )
  const [split, setSplit] = useState<'auto' | 'one'>(rewrite ? 'one' : 'auto')
  const [useProgramme, setUseProgramme] = useState(true)
  const [instructions, setInstructions] = useState(rewrite ? 'Il s’agit d’une fiche existante à réécrire : garde chaque point, supprime le délayage, ne change pas l’ordre des parties sans raison.' : '')
  const [parsed, setParsed] = useState<FicheParseResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [fileError, setFileError] = useState<string>()
  const [creating, setCreating] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const photoRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const [photos, setPhotos] = useState<{ id: string; file: File; url: string }[]>([])
  const canCapture = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

  // Object URLs of the thumbnails are released when the panel closes.
  useEffect(() => () => photos.forEach((p) => URL.revokeObjectURL(p.url)), [photos])

  function addPhotos(list: FileList | null) {
    if (!list?.length) return
    const images = Array.from(list).filter((f) => f.type.startsWith('image/'))
    setPhotos((prev) => [...prev, ...images.map((file) => ({ id: uid(), file, url: URL.createObjectURL(file) }))].slice(0, MAX_PHOTOS))
  }

  const programme = cahier.programme?.trim() ?? ''
  const filled = sources.filter((s) => s.content.trim().length > 0)
  const totalChars = filled.reduce((n, s) => n + s.content.length, 0)
  const prompt = useMemo(
    () =>
      filled.length || photos.length
        ? buildFichePrompt({
            cahierName: cahier.name,
            sources: filled.map(({ label, content }) => ({ label, content })),
            photos: photos.length,
            split,
            programme: useProgramme && programme ? programme : undefined,
            niveau: settings?.niveau,
            instructions,
          })
        : '',
    [filled, photos.length, cahier.name, split, useProgramme, programme, settings?.niveau, instructions],
  )
  const tooShort = totalChars < 80 && photos.length === 0

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
      if (rewrite) {
        // The fiche keeps its id, title, points and exercises: only the text changes.
        await updateChapitre(rewrite.id, { content: parsed.fiches.map((f) => f.content).join('\n\n') })
        onClose()
        return
      }
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
      title={rewrite ? `Régénérer « ${rewrite.title} » avec Claude` : 'Rédiger des fiches avec Claude'}
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Fermer
          </Button>
          <Button onClick={create} disabled={!parsed?.fiches.length || creating}>
            <Check size={16} />
            {rewrite ? 'Remplacer la fiche' : parsed?.fiches.length ? `Créer ${plural(parsed.fiches.length, 'fiche')}` : 'Créer les fiches'}
          </Button>
        </>
      }
    >
      <ol className="flex flex-col gap-7">
        <li className="flex flex-col gap-3">
          <StepTitle n={1} title={rewrite ? 'Tes sources : la fiche actuelle, et ce que tu veux y ajouter' : 'Tes sources : le cours et tes notes'} />
          <p className="text-sm text-muted">
            {rewrite ? (
              <>
                La fiche actuelle est déjà en source. Ajoute des notes, un extrait du cours ou des photos si tu veux, puis Claude la réécrit en version courte : mêmes points, moins de mots. Les exercices et les points de
                cours sont conservés ; la couverture peut demander de nouvelles ancres.
              </>
            ) : (
              <>
                Colle le cours du professeur, tes notes prises en classe, un extrait du manuel… importe des fichiers, ou <span className="text-ink">photographie tes pages de cours</span> : Claude les transcrit puis
                fusionne tout en une fiche structurée sans rien perdre.
              </>
            )}
          </p>

          <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface-2 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <Image size={16} className="text-muted" aria-hidden="true" />
                Photos du cours sur papier
              </span>
              <span className="ml-auto text-xs text-muted tabular-nums">{photos.length ? `${photos.length} / ${MAX_PHOTOS}` : 'aucune'}</span>
            </div>
            {photos.length > 0 && (
              <ul className="flex flex-wrap gap-2" aria-label="Photos ajoutées">
                {photos.map((p, i) => (
                  <li key={p.id} className="relative">
                    <img src={p.url} alt={`Page ${i + 1}`} className="size-20 rounded-md border border-line object-cover" />
                    <span className="absolute bottom-1 left-1 rounded bg-bg-0/80 px-1 text-[10px] font-medium">{i + 1}</span>
                    <IconButton label={`Retirer la page ${i + 1}`} size="sm" className="absolute -top-2 -right-2 bg-surface shadow-elev-2" onClick={() => setPhotos((list) => list.filter((x) => x.id !== p.id))}>
                      <X size={14} />
                    </IconButton>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {canCapture && (
                <Button variant="secondary" size="sm" onClick={() => cameraRef.current?.click()} disabled={photos.length >= MAX_PHOTOS}>
                  <Camera size={14} />
                  Prendre une photo
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={() => photoRef.current?.click()} disabled={photos.length >= MAX_PHOTOS}>
                <Image size={14} />
                {canCapture ? 'Choisir des photos' : 'Ajouter des photos'}
              </Button>
              <span className="text-xs text-muted">Une page par photo, bien éclairée, dans l’ordre du cours. Les photos ne quittent pas ton appareil : tu les joins toi-même à Claude à l’étape 2.</span>
            </div>
            <input
              ref={photoRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                addPhotos(e.target.files)
                e.target.value = ''
              }}
            />
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                addPhotos(e.target.files)
                e.target.value = ''
              }}
            />
          </div>
          <ul className="flex flex-col gap-3">
            {sources.map((s) => (
              <li key={s.id} className="flex flex-col gap-2 rounded-lg border border-line bg-surface-2 p-3">
                <div className="flex items-center gap-2">
                  <Input
                    value={s.label}
                    onChange={(e) => patch(s.id, { label: e.target.value })}
                    placeholder="Nom de la source (Cours, Mes notes, Manuel…)"
                    className="h-9 max-w-xs bg-surface text-sm"
                    aria-label="Nom de la source"
                  />
                  <span className="ml-auto text-xs text-muted tabular-nums">{s.content.length ? `${s.content.length.toLocaleString('fr-FR')} caractères` : 'vide'}</span>
                  <IconButton label="Retirer cette source" onClick={() => setSources((list) => list.filter((x) => x.id !== s.id))} disabled={sources.length === 1}>
                    <X size={16} />
                  </IconButton>
                </div>
                <Textarea
                  value={s.content}
                  onChange={(e) => patch(s.id, { content: e.target.value })}
                  placeholder="Colle le texte ici…"
                  className="min-h-28 bg-surface text-sm"
                  aria-label={`Contenu : ${s.label || 'source'}`}
                />
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setSources((list) => [...list, { id: uid(), label: '', content: '' }])}>
              <Plus size={14} />
              Ajouter un texte
            </Button>
            <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
              <Upload size={14} />
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
          files={photos.map((p) => p.file)}
          disabled={tooShort}
          disabledHint={
            tooShort ? (
              <p className="flex items-start gap-2 rounded-lg bg-warn-soft px-3 py-2 text-sm text-ink">
                <TriangleAlert size={18} className="mt-0.5 shrink-0 text-warn" />
                Ajoute d’abord du contenu dans au moins une source, ou des photos du cours.
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
