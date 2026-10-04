// End-to-end check of the administrator padlock in Réglages (dev server on 5173).
// The code comes from the environment, never from the repository:  ADMIN_CODE=… node scripts/admin-e2e.mjs
import { mkdirSync } from 'node:fs'
import { chromium, webkit, devices } from '@playwright/test'

const CODE = process.env.ADMIN_CODE
if (!CODE) {
  console.error('ADMIN_CODE manquant.')
  process.exit(1)
}
const OUT = 'docs/mobile/admin'
mkdirSync(OUT, { recursive: true })

async function run(type, options, name) {
  const browser = await type.launch()
  const page = await (await browser.newContext(options)).newPage()
  page.setDefaultTimeout(30000)
  const errors = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto('http://localhost:5173/settings', { waitUntil: 'networkidle' })
  await page.evaluate(() => window.__cahiers && window.__cahiers.setTheme('dark'))
  const section = page.getByText('Sauvegardes et exports', { exact: true }).first()
  await section.click()
  const restore = page.getByRole('button', { name: 'Restaurer une sauvegarde' })
  const merge = page.getByRole('button', { name: 'Fusionner une sauvegarde' })
  const lock = page.getByRole('button', { name: 'Accès administrateur' })

  const locked = { restore: await restore.count(), merge: await merge.count(), exporter: await page.getByRole('button', { name: 'Exporter une sauvegarde' }).count() }
  await lock.scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${OUT}/${name}-verrouille.png`, fullPage: true })

  // Wrong code
  await lock.click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Code').fill('pas-le-bon-code')
  await dialog.getByRole('button', { name: 'Déverrouiller' }).click()
  await dialog.getByText('Code incorrect.').waitFor()
  const stillLocked = (await restore.count()) === 0

  // Right code (Enter submits)
  await dialog.getByLabel('Code').fill(CODE)
  await dialog.getByLabel('Code').press('Enter')
  await dialog.waitFor({ state: 'hidden' })
  await restore.waitFor()
  const unlocked = { restore: await restore.count(), merge: await merge.count() }
  await page.screenshot({ path: `${OUT}/${name}-deverrouille.png`, fullPage: true })

  // Stays unlocked after a reload (this device), locks again on a tap
  await page.reload({ waitUntil: 'networkidle' })
  await section.click()
  const afterReload = await page.getByRole('button', { name: 'Restaurer une sauvegarde' }).count()
  await page.getByRole('button', { name: 'Verrouiller l’accès administrateur' }).click()
  await page.waitForTimeout(300)
  const afterLock = await page.getByRole('button', { name: 'Restaurer une sauvegarde' }).count()
  console.log(`${name}: verrouillé ${JSON.stringify(locked)} | mauvais code refusé ${stillLocked} | déverrouillé ${JSON.stringify(unlocked)} | après rechargement ${afterReload} | après verrouillage ${afterLock} | erreurs ${JSON.stringify(errors)}`)
  await browser.close()
}

await run(chromium, { viewport: { width: 1280, height: 900 } }, 'desktop')
await run(webkit, { ...devices['iPhone 14'] }, 'iphone14')
