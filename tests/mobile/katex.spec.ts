// KaTeX in a worker, rendered on approach (Matin 2, 1b): what the user can see is
// rendered within a second, wherever they scroll; the main-thread KaTeX chunk
// stays out of the page; placeholders do not shift the layout.
import { expect, test } from '@playwright/test'
import { collectErrors, DEMO_IDS, seed, settle } from './helpers'

const FICHE = `/cahier/${DEMO_IDS.cahier}/fiche/${DEMO_IDS.fiche}`

async function counts(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const inView = (el: Element) => {
      const r = el.getBoundingClientRect()
      return r.bottom > 0 && r.top < window.innerHeight && r.width > 0
    }
    return {
      rendered: document.querySelectorAll('.katex').length,
      pendingInView: [...document.querySelectorAll('.katex-pending')].filter(inView).length,
    }
  })
}

test('fiche : toute formule visible est rendue après 1 s, en haut comme en bas', async ({ page }) => {
  const errors = collectErrors(page)
  await seed(page)
  await page.goto(FICHE, { waitUntil: 'load' })
  await settle(page, 1000)
  const top = await counts(page)
  expect(top.rendered).toBeGreaterThan(0)
  expect(top.pendingInView, 'formules visibles non rendues en haut').toBe(0)
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await settle(page, 1000)
  expect((await counts(page)).pendingInView, 'formules visibles non rendues en bas').toBe(0)
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2))
  await settle(page, 1000)
  expect((await counts(page)).pendingInView, 'formules visibles non rendues au milieu').toBe(0)
  expect(errors).toEqual([])
})

test('fiche : KaTeX tourne dans le worker, pas sur le fil principal', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'resource entries are incomplete under Playwright WebKit')
  await seed(page)
  await page.goto(FICHE, { waitUntil: 'load' })
  await settle(page, 1500)
  const scripts = await page.evaluate(() => performance.getEntriesByType('resource').map((r) => r.name.split('/').pop() ?? ''))
  expect(scripts.some((s) => /katex\.worker/.test(s)), 'worker chargé').toBe(true)
  expect(scripts.some((s) => /^katex-[\w-]+\.js$/.test(s)), 'chunk KaTeX principal absent').toBe(false)
})

test('fiche : les placeholders ne décalent pas la mise en page (CLS)', async ({ page }) => {
  await page.addInitScript(() => {
    ;(window as unknown as { __cls: number }).__cls = 0
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries() as (PerformanceEntry & { hadRecentInput?: boolean; value?: number })[]) {
          if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value ?? 0
        }
      }).observe({ type: 'layout-shift', buffered: true })
    } catch {
      /* not in WebKit */
    }
  })
  await seed(page)
  await page.goto(FICHE, { waitUntil: 'load' })
  await settle(page, 2500)
  const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls)
  expect(cls, 'décalage cumulé').toBeLessThan(0.1)
})
