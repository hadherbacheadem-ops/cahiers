// End-to-end check of the « mécanisme » exercise on the dev server (npm run dev on 5173).
import { mkdirSync } from 'node:fs'
import { chromium, webkit, devices } from '@playwright/test'
import { buildDemo, DEMO_IDS } from './seed-demo.mjs'

const OUT = 'docs/mobile/mecanisme'
mkdirSync(OUT, { recursive: true })
const exercise = {
  pointId: 'p1',
  type: 'mecanisme',
  title: 'Hydrolyse du 2-bromo-2-méthylpropane',
  statement: 'Le 2-bromo-2-méthylpropane est chauffé dans l’eau. Donne le type de réaction de chaque étape du mécanisme.',
  difficulty: 3,
  tags: ['SN1'],
  steps: [
    { text: 'Le bromure part : il se forme un carbocation tertiaire.', reactants: ['CC(C)(C)Br'], products: ['C[C+](C)C', '[Br-]'], conditions: 'eau, Δ', answer: 'SN1', explanation: 'Étape lente, monomoléculaire : la vitesse ne dépend que du substrat.' },
    { text: 'Une molécule d’eau attaque le carbocation par son doublet.', reactants: ['C[C+](C)C', 'O'], products: ['CC(C)(C)[OH2+]'], answer: 'AdN', alsoAccept: ['SN1'], explanation: 'Le nucléophile se lie au carbone électrophile.' },
    { text: 'Un proton est arraché à l’ion oxonium.', reactants: ['CC(C)(C)[OH2+]'], products: ['CC(C)(C)O', '[H+]'], answer: 'acide-base', explanation: 'Transfert de proton vers l’eau du solvant.' },
  ],
}
const answer = '```json\n' + JSON.stringify({ points: [{ id: 'p1', title: 'Hydrolyse SN1', nature: 'methode', anchor: 'Hydrolyse' }], exercises: [exercise] }) + '\n```'

async function run(type, options, name) {
  const browser = await type.launch()
  const page = await (await browser.newContext(options)).newPage()
  page.setDefaultTimeout(30000)
  const errors = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
  await page.waitForFunction(() => !!window.__cahiers)
  await page.evaluate((d) => window.__cahiers.importBackup(d), buildDemo(Date.now()))
  await page.evaluate(async () => {
    await window.__cahiers.updateSettings({ autoValidate: true })
    await window.__cahiers.setTheme('dark')
  })
  const fiche = `http://localhost:5173/cahier/${DEMO_IDS.cahier}/fiche/${DEMO_IDS.fiche}`
  await page.goto(fiche, { waitUntil: 'networkidle' })

  await page.getByRole('button', { name: 'Générer des exercices' }).first().click()
  const dialog = page.getByRole('dialog')
  const box = dialog.getByLabel(/Mécanismes/)
  if (!(await box.isChecked())) await box.check()
  await dialog.locator('textarea[placeholder*="exercises"]').fill(answer)
  await dialog.getByText(/1 exercice/).first().waitFor()
  await dialog.getByRole('button', { name: /Ajouter 1 exercice/ }).click()
  await dialog.waitFor({ state: 'hidden' })

  await page.goto(`http://localhost:5173/train?scope=chapitre&id=${DEMO_IDS.fiche}&mode=practice&types=mecanisme&from=${encodeURIComponent(fiche.replace('http://localhost:5173', ''))}`, { waitUntil: 'networkidle' })
  await page.getByText('Donne le type de réaction de chaque étape.').first().waitFor()
  await page.waitForFunction(() => document.querySelectorAll('svg').length > 4, null, { timeout: 15000 })
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${OUT}/${name}-question.png`, fullPage: true })

  const steps = page.locator('ol > li')
  const pick = async (i, label) => steps.nth(i).getByRole('radio', { name: label, exact: true }).click()
  await pick(0, 'SN1')
  await pick(1, 'SN2') // wrong on purpose (AdN or SN1 expected)
  await pick(2, 'Acido-basique')
  await page.getByRole('button', { name: 'Valider' }).click()
  await page.getByText('Réponse :').first().waitFor()
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/${name}-correction.png`, fullPage: true })
  const verdicts = await steps.locator('p:has-text("Juste"), p:has-text("Réponse :")').allTextContents()
  console.log(name, 'molécules dessinées:', await page.locator('[role=img] svg').count(), '| verdicts:', verdicts.map((v) => v.slice(0, 26)).join(' / '), '| erreurs:', JSON.stringify(errors))
  await browser.close()
}

await run(chromium, { viewport: { width: 1280, height: 900 } }, 'desktop')
await run(webkit, { ...devices['iPhone 14'] }, 'iphone14')
