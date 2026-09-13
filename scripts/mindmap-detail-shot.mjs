#!/usr/bin/env node
// Capture de la carte de démonstration avec le texte complet d'un nœud ouvert (clic),
// en desktop et en mobile, plus une vérification du pli/dépli sur le disque ±.
//   node scripts/mindmap-detail-shot.mjs [étape]

import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, devices } from '@playwright/test'
import { startServer, seed, ROOT, DEMO_IDS } from './lib/app.mjs'

const step = process.argv[2] ?? 'mindmap-detail'
const outDir = resolve(ROOT, 'docs/screenshots', step)
await mkdir(outDir, { recursive: true })
const server = await startServer()
const browser = await chromium.launch()
try {
  for (const [name, ctx] of [
    ['desktop', { viewport: { width: 1280, height: 720 } }],
    ['mobile', { ...devices['Pixel 7'] }],
  ]) {
    const context = await browser.newContext({ ...ctx, colorScheme: 'dark' })
    const page = await context.newPage()
    await seed(page, server.url)
    await page.goto(`${server.url}/carte/${DEMO_IDS.mindmap}`, { waitUntil: 'networkidle' })
    await page.waitForSelector('svg [data-node]')
    // Click the body of a node that has a note (not its ± disc).
    const target = page.locator('svg [data-node]').filter({ hasText: 'Coulomb' }).first()
    const box = await target.boundingBox()
    await page.mouse.click(box.x + box.width * 0.4, box.y + box.height / 2)
    await page.waitForSelector('[role="dialog"]')
    const detail = await page.textContent('[role="dialog"]')
    console.log(`${name}: détail →`, detail.replace(/\s+/g, ' ').trim().slice(0, 120))
    await page.screenshot({ path: resolve(outDir, `mindmap-detail-${name}.png`) })
    if (name === 'desktop') {
      // The ± disc still folds the branch, and a click on the background closes the card.
      const before = await page.locator('svg [data-node]').count()
      const toggle = page.locator('svg [data-toggle]').first()
      const tb = await toggle.boundingBox()
      await page.mouse.click(tb.x + tb.width / 2, tb.y + tb.height / 2)
      await page.waitForTimeout(200)
      const after = await page.locator('svg [data-node]').count()
      console.log('pli via ± :', after < before ? 'ok' : `KO (${before} → ${after})`)
      await page.mouse.click(30, 300)
      await page.waitForTimeout(200)
      console.log('fermeture au clic sur le fond :', (await page.locator('[role="dialog"]').count()) === 0 ? 'ok' : 'KO')
    }
    await context.close()
  }
} finally {
  await browser.close()
  await server.stop()
}
