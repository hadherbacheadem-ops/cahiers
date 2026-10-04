// End-to-end check of the published content (public/contenu.json) on the dev server (npm run dev on 5173):
// a new device gets it by itself; the reader's own progress survives; the Réglages button reloads it.
import { mkdirSync } from 'node:fs'
import { chromium, webkit, devices } from '@playwright/test'

const OUT = 'docs/mobile/contenu'
mkdirSync(OUT, { recursive: true })

async function counts(page) {
  return page.evaluate(async () => {
    const { db } = await import('/src/db.ts')
    const exercises = await db.exercises.toArray()
    return {
      cahiers: await db.cahiers.count(),
      fiches: await db.chapitres.count(),
      exercices: exercises.length,
      riches: (await db.chapitres.toArray()).filter((c) => c.html).length,
      jamaisRevus: exercises.filter((e) => e.fsrs.reps === 0).length,
      journal: await db.reviewLogs.count(),
    }
  })
}

async function run(type, options, name) {
  // Automation flag off: the automatic start-up path is exercised for real.
  const browser = await type.launch(type === chromium ? { args: ['--disable-blink-features=AutomationControlled'] } : {})
  const ctx = await browser.newContext(options)
  const page = await ctx.newPage()
  page.setDefaultTimeout(40000)
  const errors = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(String(e)))

  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
  const webdriver = await page.evaluate(() => navigator.webdriver)
  // 1. Empty device: the content arrives by itself (~3 s after load).
  let first = await counts(page)
  for (let i = 0; i < 60 && first.fiches === 0; i++) {
    await page.waitForTimeout(500)
    first = await counts(page)
  }
  const toast = await page.getByText(/Contenu du site :/).first().isVisible().catch(() => false)
  if (first.fiches === 0) {
    // Automation flag on (WebKit): the start-up path is skipped on purpose, load through Réglages instead.
    await page.goto('http://localhost:5173/settings', { waitUntil: 'networkidle' })
    await page.getByText('Contenu du site', { exact: true }).first().click()
    await page.getByRole('button', { name: 'Recharger le contenu du site' }).click()
    await page.getByRole('status').filter({ hasText: /rechargé/ }).waitFor()
    first = await counts(page)
  }
  console.log(name, `webdriver=${webdriver}`, '1) appareil vide →', JSON.stringify(first), 'toast', toast)
  await page.screenshot({ path: `${OUT}/${name}-arrivee.png` })

  // 2. The reader reviews one card: the next reload of the content leaves it alone.
  await page.evaluate(async () => {
    const { db } = await import('/src/db.ts')
    const e = (await db.exercises.toArray())[0]
    await db.exercises.update(e.id, { fsrs: { ...e.fsrs, reps: 5, stability: 20, last_review: Date.now() } })
  })
  await page.goto('http://localhost:5173/settings', { waitUntil: 'networkidle' })
  await page.getByText('Contenu du site', { exact: true }).first().click()
  await page.getByText(/Contenu publié le/).waitFor()
  await page.screenshot({ path: `${OUT}/${name}-reglages.png`, fullPage: true })
  await page.getByRole('button', { name: 'Recharger le contenu du site' }).click()
  await page.getByRole('status').filter({ hasText: /déjà tout|rechargé/ }).waitFor()
  const msg = await page.getByRole('status').filter({ hasText: /déjà tout|rechargé/ }).textContent()
  const second = await counts(page)
  const kept = await page.evaluate(async () => (await (await import('/src/db.ts')).db.exercises.filter((e) => e.fsrs.reps === 5).count()))
  console.log(name, '2) après « Recharger » →', JSON.stringify(second), '| carte révisée conservée :', kept === 1, '| message :', msg)

  // 3. A fiche deleted by the reader stays deleted on the next start, comes back with « Recharger »
  await page.evaluate(async () => {
    const { db, deleteChapitre } = await import('/src/db.ts')
    const c = (await db.chapitres.toArray())[0]
    await deleteChapitre(c.id)
    const k = await db.kv.get('contenu.applied')
    await db.kv.put({ key: 'contenu.applied', value: { ...k.value, exportedAt: 0 } }) // as if a newer file had been published
  })
  const afterDelete = await counts(page)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(6000)
  const afterStart = await counts(page)
  console.log(name, '3) fiche supprimée :', afterDelete.fiches, '→ après redémarrage', afterStart.fiches, '(doit rester', afterDelete.fiches + ')')
  console.log(name, 'erreurs :', JSON.stringify(errors))
  await browser.close()
}

await run(chromium, { viewport: { width: 1280, height: 900 } }, 'desktop')
await run(webkit, { ...devices['iPhone 14'] }, 'iphone14')
