#!/usr/bin/env node
// Capture du mode « Régénérer la fiche » (build) : la fiche actuelle pré-remplie en source,
// bouton « Remplacer la fiche ».
//   node scripts/regen-shot.mjs [étape]

import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'
import { startServer, seed, ROOT, DEMO_IDS } from './lib/app.mjs'

const step = process.argv[2] ?? 'regen'
const outDir = resolve(ROOT, 'docs/screenshots', step)
await mkdir(outDir, { recursive: true })
const server = await startServer()
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await seed(page, server.url)
  await page.goto(`${server.url}/cahier/${DEMO_IDS.cahier}/fiche/${DEMO_IDS.fiche}`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Régénérer' }).click()
  await page.waitForSelector('text=Remplacer la fiche')
  const title = await page.locator('[role="dialog"] h2, [role="dialog"] h1').first().textContent()
  const firstSource = await page.locator('[role="dialog"] textarea').first().inputValue()
  console.log('titre :', title?.trim())
  console.log('source 1 :', firstSource.slice(0, 60).replace(/\n/g, ' ') + '…', `(${firstSource.length} caractères)`)
  console.log('prompt contient la fiche :', (await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => b.textContent?.includes('Voir le prompt')))) ? 'bouton présent' : 'KO')
  await page.screenshot({ path: resolve(outDir, 'regen-desktop.png') })
  console.log('regen-desktop.png')
} finally {
  await browser.close()
  await server.stop()
}
