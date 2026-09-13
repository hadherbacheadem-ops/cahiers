#!/usr/bin/env node
// Capture de l'exercice « carte mentale à trous » lancé depuis la carte de démonstration.
//   node scripts/carte-trous-shot.mjs [étape]

import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'
import { startServer, seed, ROOT, DEMO_IDS } from './lib/app.mjs'

const step = process.argv[2] ?? 'carte-trous'
const outDir = resolve(ROOT, 'docs/screenshots', step)
await mkdir(outDir, { recursive: true })
const server = await startServer()
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await seed(page, server.url)
  // Practice shuffles the two map exercises: retry until the « trous » one comes first.
  for (let attempt = 0; attempt < 6; attempt++) {
    await page.goto(`${server.url}/carte/${DEMO_IDS.mindmap}`, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'S’entraîner' }).click()
    await page.waitForSelector('text=Carte mentale à trous')
    if (await page.locator('text=masqué').count()) break
    if (attempt === 5) throw new Error('la variante « trous » n’est jamais venue en premier')
  }
  const text = (await page.textContent('main, body')).replace(/\s+/g, ' ')
  const m = text.match(/Retrouve (le nœud masqué|les \d+ nœuds masqués)[^.]*\./)
  console.log('consigne :', m ? m[0] : '(introuvable)')
  console.log('cases masquées :', await page.locator('button[aria-label="Nœud masqué"]').count())
  console.log('branches pliées :', await page.locator('text=pour une autre fois').count())
  await page.screenshot({ path: resolve(outDir, 'carte-trous-desktop.png'), fullPage: true })
  console.log('carte-trous-desktop.png')
} finally {
  await browser.close()
  await server.stop()
}
