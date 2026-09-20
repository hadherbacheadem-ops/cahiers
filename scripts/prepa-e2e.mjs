// End-to-end check of the kholle / DS preparation on the dev server (npm run dev on 5173).
import { mkdirSync } from 'node:fs'
import { chromium, webkit, devices } from '@playwright/test'
import { buildDemo, DEMO_IDS } from './seed-demo.mjs'

const OUT = 'docs/mobile/prepa'
mkdirSync(OUT, { recursive: true })
const exo = (concours, niveau, extra = {}) => ({
  concours,
  annee: 2020 + niveau,
  epreuve: 'Physique, oral',
  source: `${concours} ${2020 + niveau}, oral de physique, exercice ${niveau}`,
  sourceUrl: 'https://example.org/annale',
  exact: niveau !== 2,
  niveau,
  duree: 15 + 5 * niveau,
  statement: `Une charge ponctuelle $q$ est placée au centre d'une sphère de rayon $R$ (niveau ${niveau}). Calculer le champ $E(r)$ pour $r \\lt R$ puis $r \\gt R$.`,
  hints: ['Quelle symétrie le problème a-t-il ?', 'Choisis une surface de Gauss adaptée.', 'Tu trouves $E = q / (4\\pi\\varepsilon_0 r^2)$ à l’extérieur.'],
  correction: 'Par le théorème de Gauss, $\\oint \\vec E\\cdot d\\vec S = Q_{int}/\\varepsilon_0$, donc $E(r) = \\dfrac{q}{4\\pi\\varepsilon_0 r^2}$ pour $r \\gt R$.',
  ...extra,
})
const answer =
  'Voici :\n```json\n' +
  JSON.stringify({ preparation: { note: 'Peu de résultats pour X-ENS.', kholle: [exo('X-ENS', 3), exo('CCP', 1), exo('Centrale-Supélec', 2), exo('CCP', 1, { statement: 'Deuxième exercice CCP : calculer le potentiel $V(r)$.' })], ds: [exo('Mines-Ponts', 2, { duree: undefined })] } }) +
  '\n```\n'

async function run(type, options, name) {
  const browser = await type.launch()
  const page = await (await browser.newContext(options)).newPage()
  page.setDefaultTimeout(20000)
  const errors = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
  await page.waitForFunction(() => !!window.__cahiers)
  await page.evaluate((d) => window.__cahiers.importBackup(d), buildDemo(Date.now()))
  await page.evaluate(() => window.__cahiers.setTheme('dark'))
  await page.goto(`http://localhost:5173/cahier/${DEMO_IDS.cahier}/fiche/${DEMO_IDS.fiche}`, { waitUntil: 'networkidle' })

  await page.getByRole('button', { name: /Préparation/ }).first().click()
  await page.waitForURL(/\/preparation$/)
  await page.getByText('Pas encore de préparation').waitFor()
  await page.screenshot({ path: `${OUT}/${name}-vide.png` })
  await page.getByRole('button', { name: 'Générer la préparation' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.locator('textarea[placeholder*="preparation"]').fill(answer)
  await dialog.getByText(/Préparation :/).waitFor()
  const preview = await dialog.getByText(/Préparation :/).textContent()
  await dialog.getByRole('button', { name: /Ajouter 5 exercices de préparation/ }).click()
  await dialog.waitFor({ state: 'hidden' })

  // Kholle track, concours sorted CCP < Centrale < X-ENS
  await page.getByRole('heading', { name: 'CCP' }).waitFor()
  const heads = await page.locator('section[aria-label] h2').allTextContents()
  console.log(name, 'aperçu:', preview.replace(/\s+/g, ' ').trim(), '| concours (kholle):', heads.join(' < '))
  const first = page.locator('article').first()
  const b1 = first.getByRole('button', { name: 'Débloquer le premier indice' })
  await b1.scrollIntoViewIfNeeded()
  console.log(name, 'hit:', await b1.evaluate((el) => { const r = el.getBoundingClientRect(); const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return `${t?.tagName}.${(t?.className || '').toString().slice(0, 60)} same=${el.contains(t)} y=${Math.round(r.y)} h=${innerHeight}` }))
  await b1.click()
  await page.waitForTimeout(500)
  console.log(name, 'localStorage:', JSON.stringify(await page.evaluate(() => Object.entries(localStorage).filter(([k]) => k.startsWith('cahiers.prepa')))))
  console.log(name, 'boutons:', JSON.stringify(await first.getByRole('button').allTextContents()))
  await first.getByRole('button', { name: 'Débloquer l’indice 2' }).scrollIntoViewIfNeeded()
  await first.getByRole('button', { name: 'Débloquer l’indice 2' }).click()
  const hintsShown = await first.locator('ol > li').count()
  await first.getByRole('button', { name: 'Voir la correction' }).click()
  await first.getByText('Correction').waitFor()
  await page.waitForTimeout(800)
  console.log(name, 'indices affichés:', hintsShown, '| formules rendues dans la 1re carte:', await first.locator('.katex').count())
  await page.screenshot({ path: `${OUT}/${name}-kholle.png` })

  await page.getByRole('tab', { name: /DS/ }).click()
  console.log(name, 'DS:', await page.locator('article').count(), 'exercice(s)')

  // Progress survives a reload (this device only)
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByRole('tab', { name: /Kholle/ }).click()
  const back = await page.locator('article').first().locator('ol > li').count()
  console.log(name, 'après rechargement, indices:', back, '| erreurs:', JSON.stringify(errors))

  // The fiche page shows the count on its button
  await page.goto(`http://localhost:5173/cahier/${DEMO_IDS.cahier}/fiche/${DEMO_IDS.fiche}`, { waitUntil: 'networkidle' })
  console.log(name, 'bouton fiche:', (await page.getByRole('button', { name: /Préparation/ }).first().textContent()).trim())
  await browser.close()
}

await run(chromium, { viewport: { width: 1440, height: 900 } }, 'desktop')
await run(webkit, { ...devices['iPhone 14'] }, 'iphone14')
