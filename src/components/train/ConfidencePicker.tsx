import { useCallback } from 'react'
import type { Confidence } from '../../types'
import { Kbd, cx } from '../ui'
import { useKeys } from './shared'

const LEVELS: { value: Confidence; label: string; key: string }[] = [
  { value: 3, label: 'Sûr', key: 'S' },
  { value: 2, label: 'Hésitant', key: 'H' },
  { value: 1, label: 'Aucune idée', key: 'A' },
]

/**
 * Asked BEFORE the answer is revealed (a judgement made after reading the
 * answer is worthless: fluency illusion). Optional: the user can reveal without
 * choosing. High-confidence errors trigger hypercorrection retests.
 */
export function ConfidencePicker({ value, onChange, active = true }: { value: Confidence | undefined; onChange: (c: Confidence) => void; active?: boolean }) {
  useKeys(
    active,
    useCallback(
      (e: KeyboardEvent) => {
        const hit = LEVELS.find((l) => l.key.toLowerCase() === e.key.toLowerCase())
        if (hit) {
          e.preventDefault()
          onChange(hit.value)
        }
      },
      [onChange],
    ),
  )

  return (
    <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Confiance avant de voir la réponse">
      <span className="text-xs text-muted">Tu la sais ?</span>
      {LEVELS.map((l) => (
        <button
          key={l.value}
          type="button"
          role="radio"
          aria-checked={value === l.value}
          onClick={() => onChange(l.value)}
          className={cx('flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium press ring-focus', value === l.value ? 'border-accent bg-accent-soft text-accent' : 'border-line-strong text-muted hover:text-ink')}
        >
          {l.label}
          <Kbd>{l.key}</Kbd>
        </button>
      ))}
    </div>
  )
}
