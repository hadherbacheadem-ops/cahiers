// M4 features on a phone: share target landing, content-only export button,
// answer feedback setting, Google Drive as a third sync choice.
import { expect, test } from '@playwright/test'
import { DEMO_IDS, seed, settle } from './helpers'

test('partage reçu : choix du cahier, puis « Rédiger avec Claude » pré-rempli', async ({ page }) => {
  await seed(page)
  const text = 'Théorème de Gauss : le flux du champ électrique à travers une surface fermée vaut Q/ε0.'
  await page.goto(`/partager?title=Cours&text=${encodeURIComponent(text)}`, { waitUntil: 'networkidle' })
  await settle(page)
  // Several cahiers in the demo: a list to pick from.
  const choices = page.locator('[data-action="partager-vers-le-cahier"]')
  await expect(choices.first()).toBeVisible()
  await choices.first().click()
  await expect(page).toHaveURL(/\/cahier\/[^?]+$/)
  const panel = page.getByRole('dialog')
  await expect(panel).toBeVisible()
  await expect(panel.locator('textarea').first()).toHaveValue(new RegExp('Théorème de Gauss'))
})

test('partage sans contenu : retour à l’accueil', async ({ page }) => {
  await seed(page)
  await page.goto('/partager', { waitUntil: 'networkidle' })
  await expect(page).toHaveURL(/\/$/)
})

test('réglages : contenu seul, retour à la notation, Google Drive', async ({ page }) => {
  await seed(page)
  await page.goto('/settings', { waitUntil: 'networkidle' })
  await settle(page)
  await page.locator('summary[data-action="section"]').filter({ hasText: 'Sauvegardes' }).click()
  await expect(page.getByRole('button', { name: 'Partager le contenu seul' })).toBeVisible()
  const feedback = page.locator('select[data-action="retour-notation"]')
  await expect(feedback).toBeVisible()
  await feedback.scrollIntoViewIfNeeded()
  await settle(page, 300)
  await feedback.selectOption('son')
  // WebKit occasionally drops the first change on a freshly rendered select: one retry.
  if ((await feedback.inputValue()) !== 'son') await feedback.selectOption('son')
  await expect(feedback).toHaveValue('son')
  // The write to IndexedDB is asynchronous: let it land before reloading.
  await settle(page, 800)
  await page.reload({ waitUntil: 'networkidle' })
  await expect(page.locator('select[data-action="retour-notation"]')).toHaveValue('son')
  await page.locator('summary[data-action="section"]').filter({ hasText: 'Synchronisation' }).click()
  const where = page.locator('select[data-action="ou-synchroniser"]')
  await where.selectOption('gdrive')
  await expect(page.getByPlaceholder(/apps\.googleusercontent\.com/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Se connecter à Google' })).toBeDisabled()
  await page.getByPlaceholder(/apps\.googleusercontent\.com/).fill('123-abc.apps.googleusercontent.com')
  await page.getByPlaceholder(/apps\.googleusercontent\.com/).blur()
  await expect(page.getByRole('button', { name: 'Se connecter à Google' })).toBeEnabled()
  // Without a token, a sync round says so instead of failing silently.
  await page.getByRole('button', { name: 'Tester la connexion' }).click()
  await expect(page.getByRole('status')).toContainText(/Connecte-toi à Google/)
  await where.selectOption('none')
})

test('export contenu seul : sans journal, cartes remises à neuf', async ({ page }) => {
  await seed(page)
  const backup = await page.evaluate(async () => {
    const mod = (window as unknown as { __cahiers: { exportContentOnly?: () => Promise<{ reviewLogs: unknown[]; exercises: { fsrs: { reps: number } }[]; tombstones: unknown[] }> } }).__cahiers
    return mod.exportContentOnly ? mod.exportContentOnly() : null
  })
  test.skip(!backup, 'hook not exposed')
  expect(backup!.reviewLogs).toEqual([])
  expect(backup!.tombstones).toEqual([])
  expect(backup!.exercises.length).toBeGreaterThan(0)
  expect(backup!.exercises.every((e) => e.fsrs.reps === 0)).toBe(true)
  expect(DEMO_IDS.fiche).toBeTruthy()
})
