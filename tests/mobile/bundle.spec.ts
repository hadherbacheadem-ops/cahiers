// Bundle splitting (M2): the start-up bundle carries neither KaTeX, MSAL, sql.js
// nor the parsers; they arrive on the page that needs them. The gzip size of
// what the dashboard loads stays under the budget.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { expect, test } from '@playwright/test'
import { DEMO_IDS, seed, settle } from './helpers'

const BUDGET_KB = 250
const ASSETS = join(process.cwd(), 'dist', 'assets')

function gzipKb(name: string): number {
  const file = join(ASSETS, name.split('?')[0])
  if (!existsSync(file)) return 0
  return gzipSync(readFileSync(file)).length / 1024
}

type Res = { name: string; bytes: number }
async function scripts(page: import('@playwright/test').Page): Promise<Res[]> {
  return page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .filter((r) => /\.m?js(\?|$)/.test(r.name))
      .map((r) => ({ name: r.name.split('/').pop() ?? r.name, bytes: (r as PerformanceResourceTiming).encodedBodySize })),
  )
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
  expect(names).not.toMatch(/sql-wasm|sql\.js/i)
  expect(names).not.toMatch(/pdf|docx|mammoth/i)
  // Sizes as the network would carry them: gzip of the files on disk (`encodedBodySize` is the
  // decoded size when the service worker answers, and `vite preview` may not compress).
  const kb = Math.round(loaded.reduce((s, r) => s + gzipKb(r.name), 0))
  expect(kb, `JS au démarrage (gzip) : ${kb} Ko (${loaded.length} fichiers : ${loaded.map((r) => r.name).join(', ')})`).toBeLessThanOrEqual(BUDGET_KB)
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
