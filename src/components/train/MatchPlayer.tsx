import { useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Check } from '@phosphor-icons/react'
import { gradeFromCorrect } from '../../lib/srs'
import { shuffleDistinct } from '../../lib/shuffle'
import { Button, cx } from '../ui'
import { Markdown } from '../Markdown'
import { Feedback } from './Feedback'
import type { PlayerProps } from './shared'

type Side = 'left' | 'right'
type Selection = { side: Side; index: number } | null

export function MatchPlayer({ data, onAnswer }: PlayerProps<'match'>) {
  const reduced = useReducedMotion()
  const pairs = data.pairs
  // Right column shows pair indices in a shuffled order; the value is the original pair index.
  const rightOrder = useMemo(() => shuffleDistinct(pairs.map((_, i) => i)), [pairs])

  const [selected, setSelected] = useState<Selection>(null)
  /** leftIndex → rightIndex (original pair index of the chosen right item). */
  const [links, setLinks] = useState<Record<number, number>>({})
  /** Creation order of each link, for the small number chip. */
  const [order, setOrder] = useState<number[]>([])
  const [answered, setAnswered] = useState(false)

  const rightToLeft = useMemo(() => {
    const m: Record<number, number> = {}
    for (const [l, r] of Object.entries(links)) m[r] = Number(l)
    return m
  }, [links])

  const allPaired = Object.keys(links).length === pairs.length
  const isCorrect = answered && pairs.every((_, i) => links[i] === i)

  const chipFor = (leftIndex: number) => {
    const n = order.indexOf(leftIndex)
    return n === -1 ? null : n + 1
  }

  const unlink = (leftIndex: number) => {
    setLinks((prev) => {
      const next = { ...prev }
      delete next[leftIndex]
      return next
    })
    setOrder((prev) => prev.filter((i) => i !== leftIndex))
  }

  const link = (leftIndex: number, rightIndex: number) => {
    setLinks((prev) => ({ ...prev, [leftIndex]: rightIndex }))
    setOrder((prev) => [...prev, leftIndex])
    setSelected(null)
  }

  const click = (side: Side, index: number) => {
    if (answered) return
    const pairedLeft = side === 'left' ? (links[index] !== undefined ? index : undefined) : rightToLeft[index]
    if (pairedLeft !== undefined) {
      unlink(pairedLeft)
      setSelected(null)
      return
    }
    if (!selected) {
      setSelected({ side, index })
      return
    }
    if (selected.side === side) {
      setSelected(selected.index === index ? null : { side, index })
      return
    }
    if (side === 'right') link(selected.index, index)
    else link(index, selected.index)
  }

  const itemClass = (side: Side, index: number) => {
    const leftIndex = side === 'left' ? index : rightToLeft[index]
    const paired = leftIndex !== undefined
    const isSel = selected?.side === side && selected.index === index
    if (answered) {
      const ok = paired && links[leftIndex] === leftIndex
      return ok ? 'border-ok bg-ok-soft text-ok' : 'border-bad bg-bad-soft text-bad'
    }
    if (isSel) return 'border-accent bg-accent-soft ring-2 ring-accent/40'
    if (paired) return 'border-accent/60 bg-accent-soft/60'
    return 'border-line-strong bg-surface hover:bg-surface-2'
  }

  const chip = (n: number | null, tone: 'ok' | 'bad' | 'neutral') => (
    <span
      className={cx(
        'flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold',
        tone === 'ok' && 'bg-ok text-white',
        tone === 'bad' && 'bg-bad text-white',
        tone === 'neutral' && (n === null ? 'border border-dashed border-line-strong text-transparent' : 'bg-accent text-accent-fg'),
      )}
      aria-hidden
    >
      {n ?? '·'}
    </span>
  )

  const renderItem = (side: Side, index: number, text: string) => {
    const leftIndex = side === 'left' ? index : rightToLeft[index]
    const n = leftIndex === undefined ? null : chipFor(leftIndex)
    const ok = answered && leftIndex !== undefined && links[leftIndex] === leftIndex
    const tone = answered ? (ok ? 'ok' : 'bad') : 'neutral'
    const isSel = selected?.side === side && selected.index === index
    return (
      <motion.button
        key={`${side}-${index}`}
        type="button"
        disabled={answered}
        aria-pressed={isSel}
        onClick={() => click(side, index)}
        animate={answered && !reduced ? { scale: [1, 1.015, 1] } : undefined}
        transition={{ duration: 0.25 }}
        className={cx(
          'flex min-h-12 w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-base press ring-focus disabled:pointer-events-none',
          itemClass(side, index),
        )}
      >
        {side === 'left' && chip(n, tone)}
        <span className="flex-1 leading-snug">
          <Markdown inline text={text} />
        </span>
        {side === 'right' && chip(n, tone)}
      </motion.button>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-xl leading-snug font-medium text-ink md:text-2xl">
        <Markdown inline text={data.instruction?.trim() || 'Associez chaque élément à sa correspondance.'} />
      </p>
      <p className="text-sm text-muted">Cliquez un élément de gauche, puis son correspondant à droite. Cliquez une paire pour la défaire.</p>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">{pairs.map((p, i) => renderItem('left', i, p.left))}</div>
        <div className="flex flex-col gap-2">{rightOrder.map((i) => renderItem('right', i, pairs[i].right))}</div>
      </div>

      {!answered ? (
        <div className="flex items-center gap-3">
          <Button size="lg" disabled={!allPaired} onClick={() => setAnswered(true)}>
            <Check size={18} weight="bold" />
            Valider
          </Button>
          {!allPaired && (
            <span className="text-xs text-muted">
              {Object.keys(links).length} / {pairs.length} paires
            </span>
          )}
        </div>
      ) : (
        <Feedback
          correct={isCorrect}
          expected={
            <ul className="mt-1 flex flex-col gap-0.5 font-normal">
              {pairs.map((p, i) => (
                <li key={i}>
                  <Markdown inline text={p.left} /> <span className="text-muted">→</span> <Markdown inline text={p.right} />
                </li>
              ))}
            </ul>
          }
          onContinue={() => onAnswer({ correct: isCorrect, grade: gradeFromCorrect(isCorrect) })}
        />
      )}
    </div>
  )
}
