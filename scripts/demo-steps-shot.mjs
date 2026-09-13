#!/usr/bin/env node
// Vérifie qu'une démonstration de niveau 1 démarre avec une étape masquée, y compris
// quand on arrive dessus en enchaînant depuis l'exercice précédent avec Entrée.
//   node scripts/demo-steps-shot.mjs

import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'
import { startServer, seed, ROOT } from './lib/app.mjs'

const outDir = resolve(ROOT, 'docs/screenshots/demo-steps')
await mkdir(outDir, { recursive: true })
const server = await startServer()
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } })
  await seed(page, server.url)
  await page.goto(`${server.url}/train?mode=practice&scope=all&types=demonstration&count=3`, { waitUntil: 'networkidle' })
  await page.waitForSelector('text=Démonstration')
  const hidden0 = await page.locator('text=Étape à retrouver').count()
  console.log('au démarrage, étapes masquées :', hidden0)
  await page.screenshot({ path: resolve(outDir, 'demo-start.png') })
  // Reveal with Space, grade with Enter-less keys (3 = Bien), then the next demonstration arrives.
  await page.keyboard.press('Space')
  await page.waitForTimeout(300)
  const hidden1 = await page.locator('text=Étape à retrouver').count()
  console.log('après Espace, étapes masquées :', hidden1)
  await page.keyboard.press('3')
  await page.waitForTimeout(500)
  const hidden2 = await page.locator('text=Étape à retrouver').count()
  console.log('exercice suivant, étapes masquées :', hidden2)
  await page.screenshot({ path: resolve(outDir, 'demo-next.png') })
} finally {
  await browser.close()
  await server.stop()
}
