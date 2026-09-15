// Screenshots of the M0 mobile patterns on iPhone 14 (WebKit): the ⋯ menu as a
// bottom sheet, the maths toolbar above the keyboard, the mind map hint.
//   node scripts/m0-shot.mjs  → docs/mobile/m0/*.png
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { devices, webkit } from '@playwright/test'
import { DEMO_IDS, ROOT, seed, settle, startServer } from './lib/app.mjs'

const out = join(ROOT, 'docs', 'mobile', 'm0')
mkdirSync(out, { recursive: true })
const server = await startServer()
const browser = await webkit.launch()
const errors = []
try {
  const context = await browser.newContext({ ...devices['iPhone 14'], deviceScaleFactor: 2, locale: 'fr-FR' })
  const page = await context.newPage()
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await seed(page, server.url)

  // 1. Cahier page: « Plus d’actions » opens a sheet from the bottom.
  await page.goto(`${server.url}/cahier/${DEMO_IDS.cahier}`, { waitUntil: 'networkidle' })
  await settle(page)
  await page.getByRole('button', { name: 'Plus d’actions' }).click()
  await page.waitForTimeout(400)
  const sheet = page.getByRole('dialog')
  console.log('sheet visible:', await sheet.isVisible(), '· items:', await page.getByRole('menuitem').count())
  await page.screenshot({ path: join(out, 'sheet-cahier.png') })
  // Swipe down closes it.
  const box = await sheet.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + 20)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(box.x + box.width / 2, box.y + 20 + i * 25)
    await page.waitForTimeout(30)
  }
  await page.mouse.up()
  await page.waitForTimeout(900)
  console.log('after swipe, dialogs:', await page.getByRole('dialog').count())

  // 2. Train: edit the exercise → the maths toolbar follows the focused field.
  await page.goto(`${server.url}/train?mode=practice&scope=chapitre&id=${DEMO_IDS.fiche}&count=1&types=flashcard`, { waitUntil: 'networkidle' })
  await settle(page)
  await page.getByRole('button', { name: 'Plus d’actions' }).click()
  await page.waitForTimeout(300)
  await page.getByRole('menuitem', { name: /Modifier l’exercice/ }).click()
  await page.waitForTimeout(500)
  const ta = page.locator('textarea').first()
  await ta.click()
  await page.keyboard.press('End')
  await page.keyboard.type(' $E = ')
  await page.waitForTimeout(200)
  const toolbar = page.getByRole('toolbar', { name: 'Clavier mathématique' })
  console.log('toolbar visible:', await toolbar.isVisible())
  await page.getByRole('button', { name: 'Fraction' }).click()
  await page.keyboard.type('q')
  await page.waitForTimeout(200)
  console.log('value ends with:', JSON.stringify((await ta.inputValue()).slice(-24)))
  console.log('preview:', (await page.locator('[aria-label="Aperçu de la formule"]').count()) ? 'oui' : 'non')
  await page.screenshot({ path: join(out, 'toolbar-math.png') })

  // 3. Mind map hint on phones.
  await page.goto(`${server.url}/carte/${DEMO_IDS.mindmap}`, { waitUntil: 'networkidle' })
  await settle(page)
  console.log('mindmap hint:', await page.getByText('Pincer : zoom').isVisible())
  await page.screenshot({ path: join(out, 'mindmap.png') })
} finally {
  await browser.close()
  await server.stop()
}
console.log('console errors:', errors.length, errors.slice(0, 5))
