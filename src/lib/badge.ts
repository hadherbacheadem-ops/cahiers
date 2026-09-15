// The number of exercises due, on the app icon (Badging API). Chromium on
// Android and desktop show it without asking; iOS ≥ 17 shows it for Home
// Screen web apps that have notification permission. Elsewhere: no-op.

type BadgeNavigator = Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> }

let last: number | null = null

export function badgeSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof (navigator as BadgeNavigator).setAppBadge === 'function'
}

/** Sets or clears the badge; skips when nothing changed. */
export function updateAppBadge(count: number): void {
  if (!badgeSupported() || count === last) return
  last = count
  const nav = navigator as BadgeNavigator
  try {
    const p = count > 0 ? nav.setAppBadge?.(count) : nav.clearAppBadge?.()
    p?.catch(() => undefined)
  } catch {
    /* not installed, or permission missing */
  }
}
