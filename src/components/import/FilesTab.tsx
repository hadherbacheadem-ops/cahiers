import { useRef, useState, type DragEvent } from 'react'
import { CircleNotch, FileText, UploadSimple, X } from '@phosphor-icons/react'
import { createChapitre } from '../../db'
import { ACCEPTED_EXTENSIONS, fileToText, type FileSource } from '../../lib/parsers'
import { uid } from '../../lib/ids'
import { Badge, Button, Input, cx, plural } from '../ui'
import type { TabView } from './PasteTab'

type Row =
  | { id: string; name: string; title: string; status: 'parsing' }
  | { id: string; name: string; title: string; status: 'error'; error: string }
  | { id: string; name: string; title: string; status: 'ready'; content: string; source: FileSource }

const ACCEPT = ACCEPTED_EXTENSIONS.join(',')

export function useFilesTab({ cahierId, onDone }: { cahierId: string; onDone: (ids: string[]) => void }): TabView {
  const [rows, setRows] = useState<Row[]>([])
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const inputRef = useRef<HTMLInputElement>(null)

  function addFiles(list: FileList | File[]) {
    const files = Array.from(list)
    if (!files.length) return
    const fresh: Row[] = files.map((f) => ({ id: uid(), name: f.name, title: f.name.replace(/\.[^.]+$/, ''), status: 'parsing' }))
    setRows((r) => [...r, ...fresh])
    files.forEach((file, i) => parse(fresh[i].id, file))
  }

  async function parse(id: string, file: File) {
    try {
      const parsed = await fileToText(file)
      if (!parsed.content.trim()) throw new Error('Aucun texte trouvé dans ce fichier (PDF scanné ?).')
      setRows((r) => r.map((row) => (row.id === id ? { ...row, status: 'ready', content: parsed.content, source: parsed.source } : row)))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Lecture impossible.'
      setRows((r) => r.map((row) => (row.id === id ? { id: row.id, name: row.name, title: row.title, status: 'error', error: message } : row)))
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    addFiles(e.dataTransfer.files)
  }

  const ready = rows.filter((r): r is Extract<Row, { status: 'ready' }> => r.status === 'ready')
  const parsing = rows.some((r) => r.status === 'parsing')

  async function submit() {
    setBusy(true)
    setError(undefined)
    try {
      const ids: string[] = []
      for (const row of ready) {
        const created = await createChapitre({ cahierId, title: row.title, content: row.content, source: row.source })
        ids.push(created.id)
      }
      onDone(ids)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible d’enregistrer les fiches.')
    } finally {
      setBusy(false)
    }
  }

  const body = (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cx(
          'flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center press ring-focus',
          dragging ? 'border-accent bg-accent-soft' : 'border-line-strong hover:bg-surface-2',
        )}
      >
        <span className="flex size-11 items-center justify-center rounded-xl bg-surface-2 text-muted">
          <UploadSimple size={22} />
        </span>
        <span className="text-sm font-medium">Dépose des fichiers ici, ou clique pour choisir</span>
        <span className="text-xs text-muted">Word (.docx), PDF, texte (.txt, .md) — plusieurs fichiers possibles</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          if (e.target.files) addFiles(e.target.files)
          e.target.value = ''
        }}
      />

      {rows.length > 0 && (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.id} className="flex gap-3 rounded-xl border border-line bg-surface p-3">
              <span className="mt-2 flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">
                <FileText size={18} />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Input
                  value={row.title}
                  aria-label={`Titre de ${row.name}`}
                  onChange={(e) => setRows((r) => r.map((x) => (x.id === row.id ? { ...x, title: e.target.value } : x)))}
                />
                <div className="flex items-center gap-2 text-xs text-muted">
                  <span className="truncate">{row.name}</span>
                  {row.status === 'parsing' && (
                    <span className="inline-flex items-center gap-1">
                      <CircleNotch size={14} className="animate-spin" /> Lecture…
                    </span>
                  )}
                  {row.status === 'ready' && <Badge tone="ok">{plural(row.content.length, 'caractère')}</Badge>}
                </div>
                {row.status === 'error' && <p className="text-sm text-bad">{row.error}</p>}
                {row.status === 'ready' && <p className="line-clamp-2 text-sm text-muted">{row.content.slice(0, 400)}</p>}
              </div>
              <button
                type="button"
                aria-label={`Retirer ${row.name}`}
                title="Retirer"
                onClick={() => setRows((r) => r.filter((x) => x.id !== row.id))}
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink press ring-focus"
              >
                <X size={16} weight="bold" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-sm text-bad">{error}</p>}
    </div>
  )

  const footer = (
    <Button onClick={submit} disabled={busy || parsing || ready.length === 0}>
      Importer {plural(ready.length, 'fiche')}
    </Button>
  )

  return { body, footer }
}
