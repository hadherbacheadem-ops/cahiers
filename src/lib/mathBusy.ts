// « A maths render is in flight »: shared between the KaTeX pipeline (markdown.ts)
// and the animated background, which never starts under one. Kept in its own
// tiny module so the background does not drag marked + DOMPurify into the
// start-up bundle.

const idleListeners = new Set<() => void>()
let busyCount = 0
let inflightCount = 0

export function isMathBusy(): boolean {
  return busyCount > 0 || inflightCount > 0
}

/** Calls back when no render is in flight (immediately if already idle). */
export function onMathIdle(listener: () => void): () => void {
  if (!isMathBusy()) {
    listener()
    return () => {}
  }
  idleListeners.add(listener)
  return () => {
    idleListeners.delete(listener)
  }
}

export function notifyIdle(): void {
  if (isMathBusy()) return
  const ls = [...idleListeners]
  idleListeners.clear()
  for (const l of ls) l()
}

export function markBusy(delta: number): void {
  busyCount = Math.max(0, busyCount + delta)
  notifyIdle()
}

/** Number of formulas waiting for the worker. */
export function setInflight(n: number): void {
  inflightCount = n
  notifyIdle()
}
