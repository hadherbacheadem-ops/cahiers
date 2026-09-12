import { useState, type ReactNode } from 'react'
import { ArrowSquareOut, Check, ClipboardText, Sparkle } from '@phosphor-icons/react'
import { claudeUrlFor } from '../lib/prompt'
import { Button, Field, Textarea, cx } from './ui'

/**
 * The two shared steps of every Claude round-trip (no API key involved):
 * copy the prompt and open claude.ai, then paste the answer back and parse it.
 * The parent owns the parsed result (it drives the footer's import button).
 */
export function ClaudeRoundTrip<T>({
  prompt,
  parse,
  onParsed,
  renderPreview,
  firstStep = 1,
  disabled,
  disabledHint,
  placeholder = '{ … }',
}: {
  prompt: string
  parse: (text: string) => T
  onParsed: (result: T | null) => void
  renderPreview?: (result: T) => ReactNode
  firstStep?: number
  disabled?: boolean
  disabledHint?: ReactNode
  placeholder?: string
}) {
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle')
  const [showPrompt, setShowPrompt] = useState(false)
  const [response, setResponse] = useState('')
  const [preview, setPreview] = useState<T | null>(null)
  const [error, setError] = useState<string>()

  async function copyAndOpen() {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied('done')
    } catch {
      setCopied('failed')
      setShowPrompt(true)
    }
    window.open(claudeUrlFor(prompt), '_blank', 'noopener')
  }

  function analyse(text: string) {
    setResponse(text)
    setError(undefined)
    if (!text.trim()) {
      setPreview(null)
      onParsed(null)
      return
    }
    try {
      const r = parse(text)
      setPreview(r)
      onParsed(r)
    } catch (e) {
      setPreview(null)
      onParsed(null)
      setError(e instanceof Error ? e.message : 'Réponse illisible.')
    }
  }

  return (
    <>
      <li className="flex flex-col gap-3">
        <StepTitle n={firstStep} title="Envoie le prompt à Claude" />
        <p className="text-sm text-muted">
          Le prompt est copié dans ton presse-papiers et une nouvelle conversation s’ouvre sur claude.ai. Si le champ est vide, colle-le avec <Key>Ctrl</Key>+<Key>V</Key>.
        </p>
        {disabled && disabledHint}
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={copyAndOpen} disabled={disabled || !prompt}>
            <Sparkle size={16} weight="fill" />
            Copier le prompt et ouvrir Claude
            <ArrowSquareOut size={14} />
          </Button>
          <Button variant="ghost" onClick={() => setShowPrompt((s) => !s)} disabled={!prompt}>
            <ClipboardText size={16} />
            {showPrompt ? 'Masquer le prompt' : 'Voir le prompt'}
          </Button>
          {copied === 'done' && (
            <span className="flex items-center gap-1 text-sm text-ok">
              <Check size={14} weight="bold" /> Copié
            </span>
          )}
          {copied === 'failed' && <span className="text-sm text-bad">Copie automatique refusée : copie le prompt ci-dessous.</span>}
        </div>
        {showPrompt && <Textarea readOnly value={prompt} className="min-h-48 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />}
      </li>

      <li className="flex flex-col gap-3">
        <StepTitle n={firstStep + 1} title="Colle la réponse de Claude" />
        <Field label="Réponse (le bloc JSON complet)" error={error} hint="Copie tout le message de Claude, l’application isole le JSON toute seule.">
          {(id) => <Textarea id={id} value={response} onChange={(e) => analyse(e.target.value)} placeholder={placeholder} className="min-h-36 font-mono text-xs" aria-invalid={!!error} />}
        </Field>
        {preview !== null && renderPreview && <div className={cx('rounded-lg border border-ok/40 bg-ok-soft px-3 py-2.5 text-sm')}>{renderPreview(preview)}</div>}
      </li>
    </>
  )
}

export function StepTitle({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-6 items-center justify-center rounded-md bg-accent-soft text-xs font-semibold text-accent">{n}</span>
      <h3 className="font-medium">{title}</h3>
    </div>
  )
}

function Key({ children }: { children: ReactNode }) {
  return <kbd className="rounded-md border border-line-strong bg-surface-2 px-1 font-mono text-[11px]">{children}</kbd>
}
