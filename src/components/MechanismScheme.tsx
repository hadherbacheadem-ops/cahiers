import { useEffect, useState } from 'react'
import type { MechanismStep } from '../types'
import { cx } from './ui'

/** A skeletal formula drawn from a SMILES (the drawing library loads on the first molecule). Unreadable SMILES stay visible as text. */
export function MoleculeView({ smiles, className }: { smiles: string; className?: string }) {
  const [state, setState] = useState<{ smiles: string; svg: string | null } | undefined>()
  useEffect(() => {
    let alive = true
    void import('../lib/molecule').then((m) => m.renderSmiles(smiles)).then((svg) => alive && setState({ smiles, svg }))
    return () => {
      alive = false
    }
  }, [smiles])
  const ready = state?.smiles === smiles
  return (
    <span className={cx('inline-flex min-h-16 min-w-16 max-w-full items-center justify-center text-ink [&>svg]:h-auto [&>svg]:max-w-full', className)} title={smiles}>
      {!ready ? (
        <span className="h-14 w-24 animate-pulse rounded-md bg-surface-2" aria-hidden="true" />
      ) : state.svg ? (
        <span role="img" aria-label={`Structure ${smiles}`} className="contents" dangerouslySetInnerHTML={{ __html: state.svg }} />
      ) : (
        <code className="rounded bg-bad-soft px-1.5 py-0.5 text-xs text-bad">{smiles}</code>
      )}
    </span>
  )
}

/** reactants → products, with the reagents over the arrow. Nothing here names the type of reaction. */
export function StepScheme({ step }: { step: Pick<MechanismStep, 'reactants' | 'products' | 'conditions'> }) {
  const reactants = step.reactants ?? []
  const products = step.products ?? []
  if (!reactants.length && !products.length) return null
  const row = (list: string[]) =>
    list.map((s, i) => (
      <span key={i} className="inline-flex items-center gap-3">
        {i > 0 && <span className="text-lg text-muted">+</span>}
        <MoleculeView smiles={s} />
      </span>
    ))
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-lg border border-line bg-surface-2 px-3 py-3">
      {row(reactants)}
      {reactants.length > 0 && products.length > 0 && (
        <span className="inline-flex max-w-40 flex-col items-center text-center text-xs leading-tight text-muted">
          {step.conditions && <span>{step.conditions}</span>}
          <span className="text-3xl leading-none text-ink" aria-hidden="true">
            →
          </span>
        </span>
      )}
      {row(products)}
    </div>
  )
}
