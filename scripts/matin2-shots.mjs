// iPhone 14 screenshots after the motion removal: sheet opening, feedback right / wrong, modal, exercise transition.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { devices, webkit } from '@playwright/test'
import { DEMO_IDS, ROOT, seed, settle, startServer } from './lib/app.mjs'
const out = join(ROOT, 'docs', 'mobile', 'matin2')
mkdirSync(out, { recursive: true })
const server = await startServer()
const browser = await webkit.launch()
const errors = []
try {
  const context = await browser.newContext({ ...devices['iPhone 14'], deviceScaleFactor: 2, locale: 'fr-FR' })
  const page = await context.newPage()
  page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await seed(page, server.url)
  await page.goto(`${server.url}/cahier/${DEMO_IDS.cahier}`, { waitUntil: 'networkidle' }); await settle(page)
  await page.getByRole('button', { name: 'Plus d’actions' }).click(); await page.waitForTimeout(120)
  await page.screenshot({ path: join(out, 'feuille-ouverture.png') })
  await page.waitForTimeout(400); await page.screenshot({ path: join(out, 'feuille-ouverte.png') })
  await page.keyboard.press('Escape'); await page.waitForTimeout(500)
  await page.goto(`${server.url}/train?mode=practice&scope=chapitre&id=${DEMO_IDS.fiche}&count=3&types=truefalse`, { waitUntil: 'networkidle' }); await settle(page)
  await page.getByRole('button', { name: /^Vrai\b/ }).first().click(); await page.waitForTimeout(150)
  await page.screenshot({ path: join(out, 'feedback.png') })
  await page.waitForTimeout(600)
  const cont = page.getByRole('button', { name: /^Continuer/, disabled: false })
  if (await cont.count()) { await cont.first().click(); await page.waitForTimeout(80); await page.screenshot({ path: join(out, 'transition-exercice.png') }) }
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: 'Plus d’actions' }).click(); await page.waitForTimeout(400)
  await page.getByRole('menuitem', { name: /Modifier l’exercice/ }).click(); await page.waitForTimeout(150)
  await page.screenshot({ path: join(out, 'modale-ouverture.png') })
  await page.waitForTimeout(400); await page.screenshot({ path: join(out, 'modale-ouverte.png') })
  console.log('motion chunk requested:', await page.evaluate(() => performance.getEntriesByType('resource').some((r) => /react-|motion/.test(r.name.split('/').pop()))))
} finally { await browser.close(); await server.stop() }
console.log('errors:', errors)
