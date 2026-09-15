import type { Page } from '@playwright/test'
// The demo database shared with the screenshot and matrix scripts.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — plain ESM without declarations
import { buildDemo, DEMO_IDS as IDS } from '../../scripts/seed-demo.mjs'

export const DEMO_IDS = IDS as { cahier: string; fiche: string; ficheWithPending: string; mindmap?: string }

type Hook = {
  importBackup: (data: unknown) => Promise<unknown>
  setTheme: (theme: string) => Promise<void>
  updateSettings: (patch: Record<string, unknown>) => Promise<unknown>
  count: () => Promise<number>
}

/** Loads the demo backup once per context and applies the dark theme. */
export async function seed(page: Page, theme: 'dark' | 'light' = 'dark') {
  await page.goto('/', { waitUntil: 'networkidle' })
  await page.waitForFunction(() => !!(window as unknown as { __cahiers?: Hook }).__cahiers, null, { timeout: 15_000 })
  const count = await page.evaluate(() => (window as unknown as { __cahiers: Hook }).__cahiers.count())
  if (count === 0) {
    const demo = buildDemo(Date.now())
    await page.evaluate((data) => (window as unknown as { __cahiers: Hook }).__cahiers.importBackup(data), demo)
  }
  await page.evaluate((t) => (window as unknown as { __cahiers: Hook }).__cahiers.setTheme(t), theme)
  await page.reload({ waitUntil: 'networkidle' })
  await settle(page)
}

export async function settings(page: Page, patch: Record<string, unknown>) {
  await page.evaluate((p) => (window as unknown as { __cahiers: Hook }).__cahiers.updateSettings(p), patch)
}

export async function settle(page: Page, ms = 400) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(ms)
}

/** Console errors and uncaught exceptions, minus known noise. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/React DevTools|\[vite\]/.test(m.text())) errors.push(m.text())
  })
  return errors
}

/** Pixels by which the document is wider than the viewport (0 = no horizontal scroll). */
export async function overflow(page: Page): Promise<number> {
  return page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth)
}

/** A touch swipe as pointer events (Playwright's touchscreen only taps). */
export async function touchSwipe(page: Page, selector: string, from: { x: number; y: number }, to: { x: number; y: number }, steps = 8) {
  await page.evaluate(
    ({ selector, from, to, steps }) => {
      const el = document.querySelector(selector) as Element
      const fire = (type: string, x: number, y: number) =>
        el.dispatchEvent(new PointerEvent(type, { pointerType: 'touch', pointerId: 7, isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true }))
      fire('pointerdown', from.x, from.y)
      for (let i = 1; i <= steps; i++) fire('pointermove', from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps)
      fire('pointerup', to.x, to.y)
    },
    { selector, from, to, steps },
  )
}
