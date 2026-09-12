import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, RefreshCw, SkipForward } from 'lucide-react'
import { db } from '../../db'
import { CAHIER_COLORS } from '../../types'
import type { Mindmap } from '../../types'
import { branchesOf, flattenMap, pickMasked, type FlatNode } from '../../lib/mindmapMask'
import { recallGrade } from '../../lib/interleave'
import { Button, Kbd, Skeleton, cx } from '../ui'
import { Markdown } from '../Markdown'
import { useKeys, type PlayerProps } from './shared'

/**
 * Mind-map retrieval (Karpicke & Blunt 2011): the map is shown as an outline
 * and its nodes are recalled from memory, either one by one ('trous') or a
 * whole branch at a time ('reconstruction'). Reading the map is not reviewing.
 */
export function CarteTrousPlayer(props: PlayerProps<'carte_trous'>) {
  const { data, onAnswer } = props
  // undefined = loading, null = not found (Dexie's get() resolves to undefined for both).
  const map = useLiveQuery(async () => (await db.mindmaps.get(data.mindmapId)) ?? null, [data.mindmapId])

  if (map === undefined) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-5 w-3/5" />
        <Skeleton className="h-5 w-2/5" />
      </div>
    )
  }

  if (map === null) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="text-sm text-muted">Carte mentale introuvable. Elle a peut-être été supprimée ou régénérée ; cet exercice sera retiré à la prochaine génération.</p>
        <Button variant="secondary" onClick={() => onAnswer({ correct: true, grade: 'good' })}>
          <SkipForward size={16} />
          Passer
        </Button>
      </div>
    )
  }

  if (data.variant === 'reconstruction') return <ReconstructionVariant map={map} onAnswer={onAnswer} />
  return <TrousVariant map={map} exercise={props.exercise} onAnswer={onAnswer} />
}

// ---------------------------------------------------------------------------
// Outline pieces
// ---------------------------------------------------------------------------

function branchColor(branch: number | undefined): string | undefined {
  if (branch === undefined) return undefined
  return CAHIER_COLORS[branch % CAHIER_COLORS.length].value
}

/** One outline line: indentation by depth, a coloured dot for the branch, the label and its note. */
function NodeLine({ node, children, className }: { node: FlatNode; children?: ReactNode; className?: string }) {
  const color = branchColor(node.branch)
  return (
    <li className={cx('flex items-start gap-2 py-0.5', className)} style={{ paddingLeft: `${Math.max(0, node.depth - 1) * 1.25}rem` }}>
      {node.depth === 0 ? (
        <span aria-hidden className="mt-1.5 size-2.5 shrink-0 rounded-full bg-ink" />
      ) : (
        <span aria-hidden className={cx('mt-1.5 shrink-0 rounded-full', node.depth === 1 ? 'size-2.5' : 'size-1.5 opacity-70')} style={{ background: color }} />
      )}
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  )
}

function NodeText({ node, strong = false }: { node: FlatNode; strong?: boolean }) {
  return (
    <>
      <span className={cx('text-sm text-ink', (strong || node.depth <= 1) && 'font-medium', node.depth === 0 && 'text-base')}>
        <Markdown inline text={node.label} />
      </span>
      {node.note?.trim() && (
        <p className="text-xs text-muted">
          <Markdown inline text={node.note} />
        </p>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Variant 'trous': 30–50 % of the nodes hidden, recalled one by one
// ---------------------------------------------------------------------------

type Verdict = 'ok' | 'bad'

function TrousVariant({ map, exercise, onAnswer }: { map: Mindmap; exercise: PlayerProps['exercise']; onAnswer: PlayerProps['onAnswer'] }) {
  const nodes = useMemo(() => flattenMap(map.root), [map.root])
  const masked = useMemo(() => pickMasked(nodes, exercise.id, exercise.fsrs.reps), [nodes, exercise.id, exercise.fsrs.reps])
  const maskedIds = useMemo(() => nodes.filter((n) => masked.has(n.id)).map((n) => n.id), [nodes, masked])

  /** Ids in the order they were revealed. */
  const [revealed, setRevealed] = useState<string[]>([])
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({})
  const [confident, setConfident] = useState(false)

  const total = maskedIds.length
  const revealedSet = useMemo(() => new Set(revealed), [revealed])
  const sus = Object.values(verdicts).filter((v) => v === 'ok').length
  const judged = Object.keys(verdicts).length
  const done = total > 0 && judged === total
  const allSus = sus === total
  /** Most recently revealed node still waiting for a verdict. */
  const pending = [...revealed].reverse().find((id) => !verdicts[id])

  const reveal = useCallback(
    (id: string) => {
      setRevealed((r) => (r.includes(id) ? r : [...r, id]))
    },
    [],
  )

  const revealNext = useCallback(() => {
    const next = maskedIds.find((id) => !revealedSet.has(id))
    if (next) reveal(next)
  }, [maskedIds, revealedSet, reveal])

  const judge = useCallback((id: string, verdict: Verdict) => {
    setVerdicts((v) => ({ ...v, [id]: verdict }))
  }, [])

  const validate = useCallback(() => {
    if (!done) return
    const grade = recallGrade(sus, total, confident && allSus)
    onAnswer({ correct: grade !== 'again', grade })
  }, [done, sus, total, confident, allSus, onAnswer])

  useKeys(
    true,
    useCallback(
      (e: KeyboardEvent) => {
        if (e.key === 'Enter' && done) {
          e.preventDefault()
          validate()
          return
        }
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault()
          revealNext()
          return
        }
        if ((e.key === '1' || e.key === '2') && pending) {
          e.preventDefault()
          judge(pending, e.key === '1' ? 'ok' : 'bad')
        }
      },
      [done, validate, revealNext, pending, judge],
    ),
  )

  if (total === 0) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="text-sm text-muted">Cette carte n’a pas assez de nœuds pour être masquée.</p>
        <Button variant="secondary" onClick={() => onAnswer({ correct: true, grade: 'good' })}>
          <SkipForward size={16} />
          Passer
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-lg font-medium text-ink">
          Retrouve les {total} nœuds masqués. Clique (ou <Kbd>Entrée</Kbd>) pour en révéler un, puis dis si tu l’avais.
        </p>
        <p className="mt-1 text-sm text-muted">
          Dis le nœud à voix haute ou au brouillon avant de le révéler. Les nœuds masqués changent à chaque révision.
        </p>
      </div>

      <ul className="flex flex-col rounded-[var(--radius-sm)] border border-line bg-surface-2 px-3 py-2">
        {nodes.map((node) => {
          if (!masked.has(node.id)) {
            return (
              <NodeLine key={node.id} node={node}>
                <NodeText node={node} />
              </NodeLine>
            )
          }
          const isRevealed = revealedSet.has(node.id)
          const verdict = verdicts[node.id]
          if (!isRevealed) {
            return (
              <NodeLine key={node.id} node={node}>
                <button
                  type="button"
                  aria-label="Nœud masqué"
                  onClick={() => reveal(node.id)}
                  className="inline-flex h-7 min-w-16 items-center justify-center rounded-md border border-dashed border-line-strong bg-surface-2 px-3 font-mono text-sm text-muted hover:border-accent hover:text-accent-text press ring-focus"
                >
                  ?
                </button>
              </NodeLine>
            )
          }
          return (
            <NodeLine key={node.id} node={node}>
              <div className={cx('-mx-2 rounded-md px-2 py-1', verdict === 'ok' ? 'bg-ok-soft' : verdict === 'bad' ? 'bg-bad-soft' : 'bg-accent-soft/60')}>
                <NodeText node={node} strong />
                {!verdict ? (
                  <div className="mt-1.5 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => judge(node.id, 'ok')}
                      className="inline-flex h-7 items-center gap-1.5 rounded-md border border-ok bg-surface px-2.5 text-xs font-medium text-ok hover:bg-ok-soft press ring-focus"
                    >
                      Su {pending === node.id && <Kbd>1</Kbd>}
                    </button>
                    <button
                      type="button"
                      onClick={() => judge(node.id, 'bad')}
                      className="inline-flex h-7 items-center gap-1.5 rounded-md border border-bad bg-surface px-2.5 text-xs font-medium text-bad hover:bg-bad-soft press ring-focus"
                    >
                      Raté {pending === node.id && <Kbd>2</Kbd>}
                    </button>
                  </div>
                ) : (
                  <p className={cx('mt-0.5 text-xs font-medium', verdict === 'ok' ? 'text-ok' : 'text-bad')}>{verdict === 'ok' ? 'Su' : 'Raté'}</p>
                )}
              </div>
            </NodeLine>
          )
        })}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-sm tabular-nums">
            {revealed.length} / {total} révélés · {sus} {sus === 1 ? 'su' : 'sus'}
          </span>
          {!done && (
            <span className="hidden text-xs text-muted sm:inline">
              <Kbd>Espace</Kbd> révéler · <Kbd>1</Kbd> su · <Kbd>2</Kbd> raté
            </span>
          )}
          {done && (
            <label className={cx('flex items-center gap-2 text-sm', !allSus && 'text-muted')}>
              <input type="checkbox" checked={confident} disabled={!allSus} onChange={(e) => setConfident(e.target.checked)} className="size-4 accent-accent" />
              Sans hésitation
            </label>
          )}
        </div>
        {done && (
          <div className="flex items-center gap-3">
            <Button size="lg" onClick={validate}>
              <Check size={18} />
              Valider
            </Button>
            <span className="hidden text-xs text-muted sm:inline">
              <Kbd>Entrée</Kbd>
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Variant 'reconstruction': root and level-1 branches shown, sub-nodes recalled
// ---------------------------------------------------------------------------

function ReconstructionVariant({ map, onAnswer }: { map: Mindmap; onAnswer: PlayerProps['onAnswer'] }) {
  const branches = useMemo(() => branchesOf(map.root), [map.root])
  const total = useMemo(() => branches.reduce((n, b) => n + b.descendants.length, 0), [branches])
  const rootNode = useMemo<FlatNode>(() => ({ id: 'r', label: map.root.label, note: map.root.note, depth: 0 }), [map.root])

  const [step, setStep] = useState<'write' | 'check'>('write')
  const [texts, setTexts] = useState<string[]>(() => branches.map(() => ''))
  const [ticked, setTicked] = useState<Set<string>>(() => new Set())
  const [confident, setConfident] = useState(false)

  const count = ticked.size
  const allTicked = count === total

  const compare = useCallback(() => setStep('check'), [])

  const validate = useCallback(() => {
    if (step !== 'check') return
    const grade = recallGrade(count, total, confident && allTicked)
    onAnswer({ correct: grade !== 'again', grade })
  }, [step, count, total, confident, allTicked, onAnswer])

  useKeys(
    step === 'check',
    useCallback(
      (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          validate()
        }
      },
      [validate],
    ),
  )

  const toggle = (id: string, on: boolean) =>
    setTicked((s) => {
      const n = new Set(s)
      if (on) n.add(id)
      else n.delete(id)
      return n
    })

  if (total === 0) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="text-sm text-muted">Cette carte n’a pas de sous-nœuds à reconstruire.</p>
        <Button variant="secondary" onClick={() => onAnswer({ correct: true, grade: 'good' })}>
          <SkipForward size={16} />
          Passer
        </Button>
      </div>
    )
  }

  if (step === 'write') {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <p className="text-lg font-medium text-ink">Reconstruis la carte : pour chaque branche, écris les sous-nœuds dont tu te souviens.</p>
          <p className="mt-1 text-sm text-muted">Un sous-nœud par ligne, dans l’ordre qui te vient. Ensuite tu compareras avec la carte.</p>
        </div>

        <div className="flex flex-col gap-3">
          <ul className="rounded-[var(--radius-sm)] border border-line bg-surface-2 px-3 py-2">
            <NodeLine node={rootNode}>
              <NodeText node={rootNode} />
            </NodeLine>
          </ul>
          {branches.map((branch, i) => {
            const node: FlatNode = { id: `r.${i}`, label: branch.label, note: branch.note, depth: 1, parentId: 'r', branch: i }
            return (
              <div key={i} className="rounded-[var(--radius-sm)] border border-line bg-surface-2 px-3 py-2">
                <ul>
                  <NodeLine node={node}>
                    <NodeText node={node} />
                  </NodeLine>
                </ul>
                <textarea
                  autoFocus={i === 0}
                  value={texts[i]}
                  aria-label={`Sous-nœuds de « ${branch.label} »`}
                  onChange={(e) => {
                    const next = texts.slice()
                    next[i] = e.target.value
                    setTexts(next)
                  }}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                      e.preventDefault()
                      compare()
                    }
                  }}
                  placeholder="Sous-nœuds de mémoire…"
                  className="mt-2 min-h-20 w-full rounded-[var(--radius-sm)] border border-line-strong bg-surface-2 px-3 py-2 text-sm leading-relaxed text-ink ring-focus"
                />
              </div>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" onClick={compare}>
            <RefreshCw size={18} />
            Comparer
          </Button>
          <span className="text-xs text-muted">
            <Kbd>Ctrl</Kbd>+<Kbd>Entrée</Kbd>
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-lg font-medium text-ink">Coche ceux que tu avais</p>
        <p className="mt-1 text-sm text-muted">Sois honnête : un nœud approximatif ou mal placé ne compte pas.</p>
      </div>

      <div className="flex flex-col gap-3">
        <ul className="rounded-[var(--radius-sm)] border border-line bg-surface-2 px-3 py-2">
          <NodeLine node={rootNode}>
            <NodeText node={rootNode} />
          </NodeLine>
        </ul>
        {branches.map((branch, i) => {
          const node: FlatNode = { id: `r.${i}`, label: branch.label, note: branch.note, depth: 1, parentId: 'r', branch: i }
          const own = branch.descendants.filter((d) => ticked.has(d.id)).length
          return (
            <div key={i} className="rounded-[var(--radius-sm)] border border-line bg-surface-2 px-3 py-2">
              <ul>
                <NodeLine node={node}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <NodeText node={node} />
                    </div>
                    {branch.descendants.length > 0 && (
                      <span className="text-xs text-muted tabular-nums">
                        {own} / {branch.descendants.length}
                      </span>
                    )}
                  </div>
                </NodeLine>
              </ul>
              <div className="mt-2 grid gap-3 md:grid-cols-[1fr_1fr]">
                <div className="max-h-60 overflow-y-auto rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap text-ink">
                  <p className="mb-1 text-xs text-muted">Ce que tu as écrit</p>
                  {texts[i].trim() || <span className="text-muted">(rien)</span>}
                </div>
                {branch.descendants.length === 0 ? (
                  <p className="self-center text-sm text-muted">Aucun sous-nœud dans la carte.</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {branch.descendants.map((d) => {
                      const on = ticked.has(d.id)
                      return (
                        <li key={d.id} style={{ paddingLeft: `${(d.depth - 2) * 1.25}rem` }}>
                          <label className={cx('flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-1.5 text-sm', on ? 'border-ok bg-ok-soft' : 'border-line-strong bg-surface')}>
                            <input type="checkbox" checked={on} onChange={(e) => toggle(d.id, e.target.checked)} className="mt-0.5 size-4 accent-accent" />
                            <span className="min-w-0 flex-1">
                              <span className="flex items-start gap-2">
                                <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full opacity-70" style={{ background: branchColor(d.branch) }} />
                                <span className="min-w-0 flex-1">
                                  <Markdown inline text={d.label} />
                                  {d.note?.trim() && (
                                    <span className="block text-xs text-muted">
                                      <Markdown inline text={d.note} />
                                    </span>
                                  )}
                                </span>
                              </span>
                            </span>
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <span className="text-sm tabular-nums">
            {count} / {total} nœuds
          </span>
          <label className={cx('flex items-center gap-2 text-sm', !allTicked && 'text-muted')}>
            <input type="checkbox" checked={confident} disabled={!allTicked} onChange={(e) => setConfident(e.target.checked)} className="size-4 accent-accent" />
            Sans hésitation
          </label>
        </div>
        <div className="flex items-center gap-3">
          <Button size="lg" onClick={validate}>
            <Check size={18} />
            Valider
          </Button>
          <span className="hidden text-xs text-muted sm:inline">
            <Kbd>Entrée</Kbd>
          </span>
        </div>
      </div>
    </div>
  )
}
