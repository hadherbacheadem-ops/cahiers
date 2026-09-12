import { useCallback, useEffect, useState } from 'react'
import { Check, PencilLine } from 'lucide-react'
import { recallGrade } from '../../lib/interleave'
import { Button, Kbd, cx } from '../ui'
import { Markdown } from '../Markdown'
import type { PlayerProps } from './shared'

/**
 * Guided free recall (Karpicke & Blunt 2011): write everything you remember,
 * then compare with the checklist. Free recall without the comparison step is
 * the weakest format in class (Yang 2021, g = 0.24); with it, one of the strongest.
 */
export function RecallPlayer({ data, onAnswer }: PlayerProps<'rappel_libre'>) {
  const [text, setText] = useState('')
  const [step, setStep] = useState<'write' | 'check'>('write')
  const [ticked, setTicked] = useState<boolean[]>(() => data.checklist.map(() => false))
  const [confident, setConfident] = useState(false)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (step !== 'write') return
    const started = Date.now()
    const id = window.setInterval(() => setElapsed(Date.now() - started), 1000)
    return () => window.clearInterval(id)
  }, [step])

  const finishWriting = useCallback(() => {
    if (step !== 'write') return
    setStep('check')
  }, [step])

  const total = data.checklist.length
  const count = ticked.filter(Boolean).length
  const allTicked = count === total

  function validate() {
    const grade = recallGrade(count, total, confident && allTicked)
    const missedPointIds = data.checklist.filter((c, i) => !ticked[i] && c.pointId).map((c) => c.pointId as string)
    onAnswer({ correct: grade !== 'again', grade, missedPointIds })
  }

  const minutes = Math.floor(elapsed / 60_000)
  const seconds = Math.floor((elapsed % 60_000) / 1000)

  if (step === 'write') {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <p className="text-xl leading-snug font-medium text-ink md:text-2xl">
            Écris tout ce dont tu te souviens sur « <Markdown inline text={data.topic} /> ».
          </p>
          <p className="mt-2 text-sm text-muted">Définitions, formules, étapes, exemples, ordres de grandeur : dans l’ordre qui te vient. 3 à 5 minutes suffisent. Ensuite tu compareras avec la liste des notions attendues.</p>
        </div>
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault()
              finishWriting()
            }
          }}
          placeholder="Tout ce que tu sais…"
          className="min-h-48 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-base leading-relaxed text-ink ring-focus"
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" onClick={finishWriting}>
            <Check size={18} />
            J’ai terminé
          </Button>
          <span className="text-xs text-muted">
            <Kbd>Ctrl</Kbd>+<Kbd>Entrée</Kbd> · {minutes}:{String(seconds).padStart(2, '0')}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-lg font-medium text-ink">Coche les notions que tu avais écrites</p>
        <p className="mt-1 text-sm text-muted">Sois honnête : une notion approximative ou incomplète ne compte pas. Les notions manquées seront relancées en priorité.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
        <div className="max-h-80 overflow-y-auto rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap text-ink">
          <p className="mb-1 flex items-center gap-1.5 text-xs text-muted">
            <PencilLine size={14} /> Ce que tu as écrit
          </p>
          {text.trim() || <span className="text-muted">(rien)</span>}
        </div>
        <ul className="flex flex-col gap-1.5">
          {data.checklist.map((item, i) => (
            <li key={i}>
              <label className={cx('flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-sm', ticked[i] ? 'border-ok bg-ok-soft' : 'border-line-strong bg-surface')}>
                <input
                  type="checkbox"
                  checked={ticked[i]}
                  onChange={(e) => {
                    const next = ticked.slice()
                    next[i] = e.target.checked
                    setTicked(next)
                  }}
                  className="mt-0.5 size-4 accent-accent"
                />
                <Markdown inline text={item.text} />
              </label>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <span className="text-sm tabular-nums">
            {count} / {total} notions
          </span>
          <label className={cx('flex items-center gap-2 text-sm', !allTicked && 'text-muted')}>
            <input type="checkbox" checked={confident} disabled={!allTicked} onChange={(e) => setConfident(e.target.checked)} className="size-4 accent-accent" />
            Sans hésitation
          </label>
        </div>
        <Button size="lg" onClick={validate}>
          <Check size={18} />
          Valider
        </Button>
      </div>
    </div>
  )
}
