// End-to-end check of rich fiches on the dev server (npm run dev on 5173):
// rewrite a demo fiche as a rich one from a pasted Claude answer, then look at the fiche page.
import { readFileSync, mkdirSync } from 'node:fs'
import { chromium, webkit, devices } from '@playwright/test'
import { buildDemo, DEMO_IDS } from './seed-demo.mjs'

const sample = readFileSync('src/lib/ficheSample.ts', 'utf8')
const body = sample.slice(sample.indexOf('String.raw`') + 'String.raw`'.length, sample.lastIndexOf('`'))
const answer = 'Voici la fiche :\n```html' + body + '```\n'
const OUT = 'docs/mobile/fiche-riche'
mkdirSync(OUT, { recursive: true })

async function run(type, options, name) {
  const browser = await type.launch()
  const page = await (await browser.newContext(options)).newPage()
  const errors = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
  await page.waitForFunction(() => !!window.__cahiers, null, { timeout: 15000 })
  await page.evaluate((d) => window.__cahiers.importBackup(d), buildDemo(Date.now()))
  await page.evaluate(() => window.__cahiers.setTheme('dark'))
  await page.goto(`http://localhost:5173/cahier/${DEMO_IDS.cahier}/fiche/${DEMO_IDS.fiche}`, { waitUntil: 'networkidle' })
  const exercisesBefore = await page.locator('ul.divide-y > li').count()

  await page.getByRole('button', { name: /Régénérer/ }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel(/Fiche riche/).check()
  await dialog.getByRole('textbox', { name: /Réponse|réponse/ }).or(dialog.locator('textarea[placeholder*="Colle ici la réponse"]')).first().fill(answer)
  await dialog.getByText(/fiche prête/).waitFor()
  await dialog.getByRole('button', { name: 'Voir l’aperçu' }).click()
  await dialog.frameLocator('iframe').locator('h1').waitFor()
  await page.screenshot({ path: `${OUT}/${name}-panel.png` })
  await dialog.getByRole('button', { name: 'Remplacer la fiche' }).click()
  await dialog.waitFor({ state: 'hidden' })

  const frame = page.frameLocator('iframe').first()
  await frame.locator('.formula-card').first().waitFor()
  await page.waitForTimeout(800)
  const exercisesAfter = await page.locator('ul.divide-y > li').count()
  const katexCount = await frame.locator('.katex').count()
  console.log(`${name}: exercices ${exercisesBefore} -> ${exercisesAfter}, formules rendues ${katexCount}, erreurs: ${JSON.stringify(errors)}`)
  await page.screenshot({ path: `${OUT}/${name}-page.png`, fullPage: false })
  await page.reload({ waitUntil: 'networkidle' })
  await page.frameLocator('iframe').first().locator('.formula-card').first().waitFor()
  console.log(`${name}: la fiche riche survit au rechargement`)
  await browser.close()
}

await run(chromium, { viewport: { width: 1440, height: 900 } }, 'e2e-desktop')
await run(webkit, { ...devices['iPhone 14'] }, 'e2e-iphone14')
