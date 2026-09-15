// One history entry per open overlay (sheet, modal, drawer): on a phone the
// back button or the back gesture closes the overlay instead of leaving the
// page. A single stack for the whole app, so an overlay opened from another
// one (a sheet's item opening a modal) never eats the other's entry.

type Entry = { id: number; close: () => void; live: boolean; pushed: boolean }

const stack: Entry[] = []
let seq = 0
/** Pops we caused ourselves (history.back() after a programmatic close) and must not act on. */
let ignorePops = 0
/** Pushes waiting for such a pop to land: WebKit resolves back() against the entry current at call time,
 *  so a pushState issued before the pop lands would end up as a forward entry. */
const pending: Entry[] = []

function push(entry: Entry) {
  if (!entry.live) return
  try {
    window.history.pushState({ ...(window.history.state ?? {}), overlay: entry.id }, '')
    entry.pushed = true
  } catch {
    /* sandboxed or rate-limited history: the overlay still works, just without back-button support */
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (ignorePops > 0) {
      ignorePops--
      if (ignorePops === 0) while (pending.length) push(pending.shift()!)
      return
    }
    const top = stack.pop()
    if (top?.live) {
      top.live = false
      top.close()
    }
  })
}

/**
 * Registers an open overlay. Returns the release to call when it closes by
 * any other means (button, swipe, Escape, unmount).
 */
export function pushOverlay(close: () => void): () => void {
  const entry: Entry = { id: ++seq, close, live: true, pushed: false }
  stack.push(entry)
  if (ignorePops > 0) pending.push(entry)
  else push(entry)
  return () => {
    if (!entry.live) return
    entry.live = false
    const i = stack.indexOf(entry)
    if (i >= 0) stack.splice(i, 1)
    if (!entry.pushed) return
    // Drop our entry so « retour » does not replay it: when it is the current one, or when no overlay is
    // left and the current entry is a stale overlay entry. A navigation from inside the overlay has
    // already replaced the state and is left alone.
    const current = (window.history.state as { overlay?: number } | null)?.overlay
    if (current === entry.id || (current != null && stack.length === 0)) {
      ignorePops++
      window.history.back()
    }
  }
}

/** Test hook: how many overlays currently hold a history entry. */
export function overlayDepth(): number {
  return stack.length
}
