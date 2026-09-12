import { useState, type ReactNode } from 'react'
import { createChapitre } from '../../db'
import { Button, Field, Input, Textarea } from '../ui'

export interface TabView {
  body: ReactNode
  footer: ReactNode
}

export function usePasteTab({ cahierId, onDone }: { cahierId: string; onDone: (ids: string[]) => void }): TabView {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!content.trim()) {
      setError('Colle le contenu de la fiche avant de l’ajouter.')
      return
    }
    setBusy(true)
    try {
      const created = await createChapitre({ cahierId, title, content: content.trim(), source: 'paste' })
      onDone([created.id])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible d’enregistrer la fiche.')
    } finally {
      setBusy(false)
    }
  }

  const body = (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <Field label="Titre de la fiche">
        {(id) => <Input id={id} autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Chapitre 3 : la Révolution française" />}
      </Field>
      <Field label="Contenu" error={error} hint="Dans OneNote : clique dans la page, Ctrl+A puis Ctrl+C, et colle ici.">
        {(id) => (
          <Textarea
            id={id}
            value={content}
            onChange={(e) => {
              setContent(e.target.value)
              if (error) setError(undefined)
            }}
            placeholder="Colle ici le texte de ton cours…"
            className="min-h-[40vh] font-mono text-sm"
            aria-invalid={!!error}
          />
        )}
      </Field>
    </form>
  )

  const footer = (
    <Button onClick={submit} disabled={busy}>
      Ajouter la fiche
    </Button>
  )

  return { body, footer }
}
