// Tiny store telling the background field where the user is: which cahier
// (its formulas and colour), whether a session is running (calm mode) and
// which fiches must never appear in the background (answer leak).

export interface FieldContext {
  cahierId?: string
  cahierColor?: string
  /** Session running: 40 % intensity, half speed, no formula from these fiches. */
  calm: boolean
  excludeChapitreIds: string[]
}

let current: FieldContext = { calm: false, excludeChapitreIds: [] }
const listeners = new Set<(c: FieldContext) => void>()

export function getFieldContext(): FieldContext {
  return current
}

export function setFieldContext(patch: Partial<FieldContext>) {
  const next = { ...current, ...patch }
  if (next.cahierId === current.cahierId && next.calm === current.calm && next.cahierColor === current.cahierColor && next.excludeChapitreIds.join() === current.excludeChapitreIds.join()) return
  current = next
  for (const l of listeners) l(current)
}

export function subscribeFieldContext(listener: (c: FieldContext) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function resetFieldContext() {
  setFieldContext({ cahierId: undefined, cahierColor: undefined, calm: false, excludeChapitreIds: [] })
}
