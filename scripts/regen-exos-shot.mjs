#!/usr/bin/env node
// Capture du mode « Régénérer les exercices » (build) : avertissement sur ce qui sera
// supprimé / conservé, bouton « Remplacer ».
//   node scripts/regen-exos-shot.mjs [étape]

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
  // Two « Régénérer » buttons: the fiche's (first) and the exercises' (second).
  await page.getByRole('button', { name: 'Régénérer' }).nth(1).click()
  await page.waitForSelector('text=Régénérer les exercices avec Claude')
  const warn = await page.locator('[role="dialog"] .bg-warn-soft').first().textContent()
  console.log('avertissement :', warn?.replace(/\s+/g, ' ').trim())
  console.log('bouton :', (await page.locator('[role="dialog"] button', { hasText: /Remplacer/ }).count()) ? 'Remplacer les exercices' : 'KO')
  await page.screenshot({ path: resolve(outDir, 'regen-exos-desktop.png') })
  console.log('regen-exos-desktop.png')
} finally {
  await browser.close()
  await server.stop()
}
