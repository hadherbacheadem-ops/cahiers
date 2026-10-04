// End-to-end check of drag-and-drop / paste of images into the fiche creation panel (dev server on 5173).
import { mkdirSync } from 'node:fs'
import { chromium, webkit, devices } from '@playwright/test'
import { buildDemo, DEMO_IDS } from './seed-demo.mjs'

const OUT = 'docs/mobile/drop'
mkdirSync(OUT, { recursive: true })

/** Runs in the page: a DataTransfer holding `n` generated PNGs and optionally a text file. */
const makeTransfer = `async (n, withText) => {
  const dt = new DataTransfer()
  for (let i = 0; i < n; i++) {
    const c = document.createElement('canvas'); c.width = 160; c.height = 220
    const g = c.getContext('2d'); g.fillStyle = 'hsl(' + (i * 47) + ' 60% 45%)'; g.fillRect(0, 0, 160, 220); g.fillStyle = '#fff'; g.font = '40px sans-serif'; g.fillText('p' + (i + 1), 50, 120)
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'))
    dt.items.add(new File([blob], 'page-' + (i + 1) + '.png', { type: 'image/png' }))
  }
  if (withText) dt.items.add(new File(['Le théorème de Gauss relie le flux du champ électrique à la charge intérieure, divisée par epsilon zéro. '.repeat(3)], 'notes.txt', { type: 'text/plain' }))
  return dt
}`

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
  await page.evaluate(() => window.__cahiers.setTheme('dark'))
  await page.goto(`http://localhost:5173/cahier/${DEMO_IDS.cahier}`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click()
  await page.getByRole('menuitem', { name: /Rédiger avec Claude/ }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Photos du cours sur papier').waitFor()
  const thumbs = () => dialog.locator('ul[aria-label="Photos ajoutées"] li').count()
  const overlay = dialog.getByText('Dépose tes photos ici')
  const target = dialog.locator('ol').first()

  const fire = (type, n, text = false) =>
    target.evaluate(
      async (el, [type, n, text, make]) => {
        const dt = await eval(make)(n, text)
        el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }))
      },
      [type, n, text, makeTransfer],
    )

  const before = await thumbs()
  await fire('dragenter', 2)
  await overlay.waitFor()
  await page.screenshot({ path: `${OUT}/${name}-survol.png` })
  await fire('dragleave', 2)
  await overlay.waitFor({ state: 'hidden' })
  const hidden = true

  await fire('dragenter', 3, true)
  await fire('drop', 3, true)
  await overlay.waitFor({ state: 'hidden' })
  await dialog.locator('ul[aria-label="Photos ajoutées"] li').nth(2).waitFor()
  await page.waitForTimeout(600)
  const afterDrop = await thumbs()
  const sources = await dialog.getByLabel('Nom de la source').evaluateAll((els) => els.map((e) => e.value))
  await page.screenshot({ path: `${OUT}/${name}-depose.png` })

  // Paste a screenshot
  await target.evaluate(async (el, make) => {
    const dt = await eval(make)(1, false)
    el.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }))
  }, makeTransfer)
  await page.waitForTimeout(300)
  const afterPaste = await thumbs()

  // Text dragged inside the page is not a file drag: nothing happens
  await target.evaluate((el) => {
    const dt = new DataTransfer()
    dt.setData('text/plain', 'du texte')
    el.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }))
  })
  const textOverlay = await overlay.isVisible()

  // The 20-photo cap
  await fire('drop', 19)
  await page.waitForTimeout(600)
  const capped = await thumbs()
  const warn = await dialog.getByText(/Au plus 20 photos/).count()
  console.log(`${name}: avant ${before}, survol ok ${hidden}, après dépôt de 3 images + 1 txt : ${afterDrop} photos, sources ${JSON.stringify(sources)}, après collage ${afterPaste}, survol d'un texte : ${textOverlay}, plafond ${capped} (avertissement ${warn}), erreurs ${JSON.stringify(errors)}`)
  await browser.close()
}

await run(chromium, { viewport: { width: 1280, height: 900 } }, 'desktop')
await run(webkit, { ...devices['iPhone 14'] }, 'iphone14')
