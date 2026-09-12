import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import type { Cahier } from '../types'
import { updateCahier } from '../db'
import { fileToText, ACCEPTED_EXTENSIONS } from '../lib/parsers'
import { Button, Field, Modal, Textarea } from './ui'

/**
 * The cahier's reference material: an extract of the Bulletin officiel for the
 * subject and year, and/or the teacher's course plan. Used to complete fiches.
 */
export function ProgrammeModal({ open, onClose, cahier }: { open: boolean; onClose: () => void; cahier: Cahier }) {
  const [session, setSession] = useState(0)
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setSession((s) => s + 1)
  }
  return <Inner key={session} open={open} onClose={onClose} cahier={cahier} />
}

function Inner({ open, onClose, cahier }: { open: boolean; onClose: () => void; cahier: Cahier }) {
  const [text, setText] = useState(cahier.programme ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const fileRef = useRef<HTMLInputElement>(null)

  async function importFiles(files: FileList | null) {
    if (!files?.length) return
    setBusy(true)
    setError(undefined)
    try {
      const parts: string[] = []
      for (const f of Array.from(files)) {
        const { title, content } = await fileToText(f)
        parts.push(`# ${title}\n\n${content}`)
      }
      setText((t) => (t.trim() ? t.trimEnd() + '\n\n' : '') + parts.join('\n\n'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fichier illisible.')
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    await updateCahier(cahier.id, { programme: text.trim() || undefined })
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Programme — ${cahier.name}`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={save} disabled={busy}>
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          Colle ici l’extrait du <strong className="font-medium text-ink">Bulletin officiel</strong> (programme de la matière pour ton année) et, si tu l’as, le plan de cours du professeur. Claude s’en sert pour repérer ce qui manque dans tes fiches.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
            <Upload size={16} />
            {busy ? 'Lecture du fichier…' : 'Importer un fichier (PDF, Word, texte)'}
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
          {error && <span className="text-sm text-bad">{error}</span>}
        </div>
        <Field label="Programme et plan de cours" hint={text.trim() ? `${text.length.toLocaleString('fr-FR')} caractères` : 'Vide pour l’instant.'}>
          {(id) => <Textarea id={id} value={text} onChange={(e) => setText(e.target.value)} className="min-h-[50vh] font-mono text-xs leading-relaxed" placeholder="Thème 1 – … Notions et contenus : … Capacités attendues : …" />}
        </Field>
      </div>
    </Modal>
  )
}
