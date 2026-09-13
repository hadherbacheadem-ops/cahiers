import { useState, type ReactNode } from 'react'
import { Check, Clipboard, ClipboardList, Copy, ExternalLink, Sparkles, TriangleAlert } from 'lucide-react'
import { claudeUrlFor } from '../lib/prompt'
import { runWithRepairs, type RejectedItem } from '../lib/importClaude'
import type { JsonRepairs } from '../lib/repairJson'
import { Button, Field, Textarea, cx, plural } from './ui'

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
  files = [],
}: {
  prompt: string
  parse: (text: string) => T
  onParsed: (result: T | null) => void
  renderPreview?: (result: T) => ReactNode
  firstStep?: number
  disabled?: boolean
  disabledHint?: ReactNode
  placeholder?: string
  /** Photos to attach to the Claude message (shared with the prompt on a phone, dragged in by hand on a desktop). */
  files?: File[]
}) {
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle')
  const [showPrompt, setShowPrompt] = useState(false)
  const [response, setResponse] = useState('')
  const [preview, setPreview] = useState<T | null>(null)
  const [repairs, setRepairs] = useState<JsonRepairs | null>(null)
  const [error, setError] = useState<string>()

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function' && window.matchMedia('(pointer: coarse)').matches
  const canShareFiles = canShare && files.length > 0 && typeof navigator.canShare === 'function' && navigator.canShare({ files })
  const canPaste = typeof navigator !== 'undefined' && typeof navigator.clipboard?.readText === 'function'

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

  /** Phone: the share sheet opens the Claude app directly with the prompt as text. */
  async function share() {
    try {
      // With photos, the share sheet hands the images and the prompt to the Claude app together.
      await navigator.share(canShareFiles ? { text: prompt, files } : { text: prompt })
      setCopied('done')
    } catch {
      // Cancelled or unsupported payload: fall back on copy + link.
      await copyAndOpen()
    }
  }

  /** Reads the clipboard on a user gesture (iOS shows its own confirmation). */
  async function paste() {
    try {
      const text = await navigator.clipboard.readText()
      if (text.trim()) analyse(text)
      else setError('Le presse-papiers est vide : copie d’abord la réponse de Claude.')
    } catch {
      setError('Lecture du presse-papiers refusée : colle la réponse dans la zone ci-dessous.')
    }
  }

  function analyse(text: string) {
    setResponse(text)
    setError(undefined)
    setRepairs(null)
    if (!text.trim()) {
      setPreview(null)
      onParsed(null)
      return
    }
    try {
      const { result, repairs: r } = runWithRepairs(() => parse(text))
      setPreview(result)
      setRepairs(r)
      onParsed(result)
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
          {files.length > 0 && !canShareFiles && (
            <>
              {' '}
              <span className="font-medium text-ink">Puis glisse {files.length === 1 ? 'la photo' : `les ${files.length} photos`} dans la conversation</span> (ou le bouton « + » de claude.ai), avant d’envoyer.
            </>
          )}
          {canShareFiles && (
            <>
              {' '}
              <span className="font-medium text-ink">{files.length === 1 ? 'La photo part' : 'Les photos partent'} avec le prompt</span> dans l’application Claude.
            </>
          )}
        </p>
        {disabled && disabledHint}
        <div className="flex flex-wrap items-center gap-2">
          {canShare ? (
            <Button size="lg" onClick={share} disabled={disabled || !prompt}>
              <Sparkles size={18} />
              Partager le prompt à Claude
            </Button>
          ) : (
            <Button size="lg" onClick={copyAndOpen} disabled={disabled || !prompt}>
              <Sparkles size={18} />
              Copier le prompt et ouvrir Claude
              <ExternalLink size={14} />
            </Button>
          )}
          <Button variant="ghost" onClick={() => setShowPrompt((s) => !s)} disabled={!prompt}>
            <ClipboardList size={16} />
            {showPrompt ? 'Masquer le prompt' : 'Voir le prompt'}
          </Button>
          {copied === 'done' && (
            <span className="flex items-center gap-1 text-sm text-ok">
              <Check size={14} /> Copié
            </span>
          )}
          {copied === 'failed' && <span className="text-sm text-bad">Copie automatique refusée : copie le prompt ci-dessous.</span>}
        </div>
        {showPrompt && <Textarea readOnly value={prompt} className="min-h-48 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />}
      </li>

      <li className="flex flex-col gap-3">
        <StepTitle n={firstStep + 1} title="Colle la réponse de Claude" />
        {canPaste && (
          <div>
            <Button variant="secondary" onClick={paste}>
              <Clipboard size={16} />
              Coller depuis le presse-papiers
            </Button>
          </div>
        )}
        <Field label="Réponse (le bloc JSON complet)" error={error} hint="Copie tout le message de Claude, l’application isole le JSON toute seule.">
          {(id) => <Textarea id={id} value={response} onChange={(e) => analyse(e.target.value)} placeholder={placeholder} className="min-h-40 font-mono text-xs" aria-invalid={!!error} />}
        </Field>
        {repairs && repairs.doubledBackslashes > 0 && <RepairsBanner repairs={repairs} />}
        {preview !== null && renderPreview && <div className={cx('rounded-[var(--radius-md)] border border-ok/40 bg-ok-soft px-3.5 py-3 text-sm')}>{renderPreview(preview)}</div>}
      </li>
    </>
  )
}

/** « N antislashs réparés — vérifie les formules » : the JSON had LaTeX with single backslashes. */
export function RepairsBanner({ repairs }: { repairs: JsonRepairs }) {
  const names = [...new Set(repairs.commands.filter((c) => /^[A-Za-z]+$/.test(c)))].slice(0, 8)
  return (
    <div role="status" className="flex flex-col gap-1 rounded-lg border border-warn/50 bg-warn-soft px-3 py-2.5 text-sm text-warn">
      <span className="flex items-center gap-1.5 font-medium">
        <TriangleAlert size={16} />
        {plural(repairs.doubledBackslashes, 'antislash réparé', 'antislashs réparés')} — vérifie les formules
      </span>
      <span className="text-xs opacity-90">
        Claude a écrit des commandes LaTeX avec un seul antislash ({names.map((n) => `\\${n}`).join(', ')}
        {repairs.commands.length > names.length ? ', …' : ''}). Elles ont été rétablies, mais relis les formules concernées : elles passent en tête de la validation.
      </span>
    </div>
  )
}

/** Rejected items with their raw text, and a button that copies a ready-to-paste message for Claude. */
export function RejectedList({ rejected, what = 'éléments' }: { rejected: RejectedItem[]; what?: string }) {
  const [copied, setCopied] = useState(false)
  if (!rejected.length) return null
  const message = rejectedMessage(rejected, what)
  async function copy() {
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
    } catch {
      window.prompt('Copie ce message :', message)
    }
  }
  return (
    <li className="flex flex-col gap-1.5">
      <span>
        {plural(rejected.length, 'élément ignoré', 'éléments ignorés')} (format invalide) :
        <Button size="sm" variant="ghost" className="ml-2" onClick={copy}>
          <Copy size={14} />
          {copied ? 'Copié' : 'Copier les rejetés'}
        </Button>
      </span>
      <ul className="flex flex-col gap-1 text-xs">
        {rejected.map((r) => (
          <li key={r.index} className="rounded-md border border-line bg-surface px-2 py-1.5">
            <span className="font-medium">#{r.index + 1}</span> — {r.reason}
            <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] text-muted">{r.raw}</pre>
          </li>
        ))}
      </ul>
    </li>
  )
}

/** The message to paste in Claude so it returns the rejected items corrected, same JSON format. */
export function rejectedMessage(rejected: RejectedItem[], what = 'éléments'): string {
  const n = rejected.length
  const head = n === 1 ? `Cet élément (${what}) de ta réponse a été rejeté` : `Ces ${n} ${what} de ta réponse ont été rejetés`
  const lines = [
    `${head} par l'application pour les raisons indiquées. Renvoie-${n === 1 ? 'le corrigé' : 'les corrigés'}, au même format JSON (un seul bloc \`\`\`json, mêmes champs, antislashs LaTeX doublés), sans renvoyer les autres.`,
    '',
    ...rejected.flatMap((r) => [`${r.index + 1}. Raison : ${r.reason}`, '```json', r.raw, '```', '']),
  ]
  return lines.join('\n').trimEnd()
}

export function StepTitle({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-6 items-center justify-center rounded-md bg-accent-soft text-xs font-semibold text-accent-text">{n}</span>
      <h3 className="font-medium">{title}</h3>
    </div>
  )
}

function Key({ children }: { children: ReactNode }) {
  return <kbd className="rounded-md border border-line-strong bg-surface-2 px-1 font-mono text-[11px]">{children}</kbd>
}
