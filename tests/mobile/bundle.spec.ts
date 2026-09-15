// Bundle splitting (M2): the start-up bundle carries neither KaTeX, MSAL, sql.js
// nor the parsers; they arrive on the page that needs them. The gzip size of
// what the dashboard loads stays under the budget.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { expect, test } from '@playwright/test'
import { DEMO_IDS, seed, settle } from './helpers'

const BUDGET_KB = 190
const ASSETS = join(process.cwd(), 'dist', 'assets')

function gzipKb(name: string): number {
  const file = join(ASSETS, name.split('?')[0])
  if (!existsSync(file)) return 0
  return gzipSync(readFileSync(file)).length / 1024
}

type Res = { name: string; bytes: number; initial: boolean }
async function scripts(page: import('@playwright/test').Page): Promise<Res[]> {
  // The start-up bundle is what the page needs to reach `load`; chunks fetched afterwards
  // (idle work such as the sync engine, or a page's lazy chunk) are listed separately.
  return page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    const loadEnd = nav?.loadEventEnd || Infinity
    return performance
      .getEntriesByType('resource')
      .filter((r) => /\.m?js(\?|$)/.test(r.name))
      .map((r) => ({ name: r.name.split('/').pop() ?? r.name, bytes: (r as PerformanceResourceTiming).encodedBodySize, initial: r.responseEnd <= loadEnd }))
  })
}

test('démarrage : ni KaTeX, ni MSAL, ni sql.js, ni parseurs ; budget gzip respecté', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'encodedBodySize is not reported by WebKit')
  await seed(page)
  // A fresh navigation after the seed reload: what the dashboard actually loads.
  await page.goto('/', { waitUntil: 'networkidle' })
  await settle(page, 800)
  const loaded = await scripts(page)
  const names = loaded.map((r) => r.name).join(' ')
  expect(names).not.toMatch(/katex/i)
  expect(names).not.toMatch(/msal/i)
  expect(names, 'motion ne doit pas être dans le bundle de démarrage').not.toMatch(/motion/i)
  expect(names).not.toMatch(/sql-wasm|sql\.js/i)
  expect(names).not.toMatch(/pdf|docx|mammoth/i)
  // Sizes as the network would carry them: gzip of the files on disk (`encodedBodySize` is the
  // decoded size when the service worker answers, and `vite preview` may not compress).
  const initial = loaded.filter((r) => r.initial)
  const later = loaded.filter((r) => !r.initial)
  const kb = Math.round(initial.reduce((s, r) => s + gzipKb(r.name), 0))
  const laterKb = Math.round(later.reduce((s, r) => s + gzipKb(r.name), 0))
  console.log(`JS avant load (gzip) : ${kb} Ko (${initial.map((r) => r.name).join(', ')}) ; après load : ${laterKb} Ko (${later.map((r) => r.name).join(', ')})`)
  expect(kb, `JS avant load (gzip) : ${kb} Ko (${initial.length} fichiers : ${initial.map((r) => r.name).join(', ')})`).toBeLessThanOrEqual(BUDGET_KB)
})

test('KaTeX arrive avec la première fiche à formules, pas avant', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'encodedBodySize is not reported by WebKit')
  await seed(page)
  await page.goto('/', { waitUntil: 'networkidle' })
  expect((await scripts(page)).map((r) => r.name).join(' ')).not.toMatch(/katex/i)
  await page.goto(`/cahier/${DEMO_IDS.cahier}/fiche/${DEMO_IDS.fiche}`, { waitUntil: 'networkidle' })
  await settle(page, 800)
  expect((await scripts(page)).map((r) => r.name).join(' ')).toMatch(/katex/i)
  await expect(page.locator('.katex').first()).toBeVisible()
  expect(await page.locator('.katex-pending').count()).toBe(0)
})
