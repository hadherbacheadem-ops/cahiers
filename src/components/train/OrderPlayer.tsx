import { useMemo, useRef, useState, type DragEvent } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowDown, ArrowUp, Check, GripVertical } from 'lucide-react'
import { gradeFromCorrect } from '../../lib/srs'
import { shuffleDistinct } from '../../lib/shuffle'
import { Button, IconButton, cx } from '../ui'
import { Markdown } from '../Markdown'
import { Feedback } from './Feedback'
import type { PlayerProps } from './shared'

export function OrderPlayer({ data, deferFeedback = false, onAnswer }: PlayerProps<'order'>) {
  const reduced = useReducedMotion()
  const items = data.items
  const initial = useMemo(() => shuffleDistinct(items.map((_, i) => i)), [items])
  const [order, setOrder] = useState<number[]>(initial)
  const [answered, setAnswered] = useState(false)
  const dragFrom = useRef<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  const isCorrect = answered && order.every((v, i) => v === i)

  const validate = () => {
    if (answered) return
    setAnswered(true)
    if (deferFeedback) {
      const ok = order.every((v, i) => v === i)
      onAnswer({ correct: ok, grade: gradeFromCorrect(ok) })
    }
  }

  const move = (from: number, to: number) => {
    if (answered || to < 0 || to >= order.length || from === to) return
    setOrder((prev) => {
      const next = prev.slice()
      const [v] = next.splice(from, 1)
      next.splice(to, 0, v)
      return next
    })
  }

  const onDragStart = (pos: number) => (e: DragEvent<HTMLDivElement>) => {
    if (answered) {
      e.preventDefault()
      return
    }
    dragFrom.current = pos
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(pos))
  }
  const onDragOver = (pos: number) => (e: DragEvent<HTMLDivElement>) => {
    if (answered || dragFrom.current === null) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOver !== pos) setDragOver(pos)
  }
  const onDrop = (pos: number) => (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const from = dragFrom.current
    dragFrom.current = null
    setDragOver(null)
    if (from !== null) move(from, pos)
  }
  const onDragEnd = () => {
    dragFrom.current = null
    setDragOver(null)
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-xl leading-snug font-medium text-ink md:text-2xl">
        <Markdown inline text={data.instruction} />
      </p>
      <p className="text-sm text-muted">Remettez les éléments dans le bon ordre avec les flèches ou en les glissant.</p>

      <ol className="flex flex-col gap-2">
        {order.map((itemIndex, pos) => {
          const ok = answered && itemIndex === pos
          return (
            <motion.li key={itemIndex} layout={!reduced} transition={{ type: 'spring', stiffness: 500, damping: 40 }} className="list-none">
              {/* Native HTML5 drag & drop lives on a plain element: motion reserves the onDrag* props for its own gestures. */}
              <div
                draggable={!answered}
                onDragStart={onDragStart(pos)}
                onDragOver={onDragOver(pos)}
                onDrop={onDrop(pos)}
                onDragEnd={onDragEnd}
                className={cx(
                  'flex items-center gap-3 rounded-lg border px-3 py-2 text-base',
                  !answered && 'border-line-strong bg-surface',
                  !answered && dragOver === pos && 'border-accent bg-accent-soft',
                  !answered && 'cursor-grab active:cursor-grabbing',
                  ok && 'border-ok bg-ok-soft text-ok',
                  answered && !ok && 'border-bad bg-bad-soft text-bad',
                )}
              >
              <span
                className={cx(
                  'flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold',
                  answered ? (ok ? 'bg-ok text-white' : 'bg-bad text-white') : 'bg-surface-2 text-muted',
                )}
                aria-hidden
              >
                {pos + 1}
              </span>
              <span className="flex-1 leading-snug">
                <Markdown inline text={items[itemIndex]} />
              </span>
              {!answered && (
                <span className="flex shrink-0 items-center gap-0.5">
                  <IconButton label={`Monter « ${items[itemIndex]} »`} disabled={pos === 0} onClick={() => move(pos, pos - 1)} className="size-8">
                    <ArrowUp size={16} />
                  </IconButton>
                  <IconButton label={`Descendre « ${items[itemIndex]} »`} disabled={pos === order.length - 1} onClick={() => move(pos, pos + 1)} className="size-8">
                    <ArrowDown size={16} />
                  </IconButton>
                  <span className="ml-1 hidden text-muted sm:inline" aria-hidden>
                    <GripVertical size={16} />
                  </span>
                </span>
              )}
              </div>
            </motion.li>
          )
        })}
      </ol>

      {!answered ? (
        <div>
          <Button size="lg" onClick={validate}>
            <Check size={18} />
            Valider
          </Button>
        </div>
      ) : deferFeedback ? null : (
        <Feedback
          correct={isCorrect}
          expected={
            <ol className="mt-1 flex list-decimal flex-col gap-0.5 pl-5 font-normal">
              {items.map((it, i) => (
                <li key={i}>
                  <Markdown inline text={it} />
                </li>
              ))}
            </ol>
          }
          onContinue={() => onAnswer({ correct: isCorrect, grade: gradeFromCorrect(isCorrect) })}
        />
      )}
    </div>
  )
}
