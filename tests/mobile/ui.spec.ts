// Keyboard, sheets, modals, banners, standalone mode, orientation, gestures, canvas, lists.
import { expect, test } from '@playwright/test'
import { collectErrors, DEMO_IDS, overflow, seed, settings, settle, touchSwipe } from './helpers'

const FLASH = `/train?mode=practice&scope=chapitre&id=${DEMO_IDS.fiche}&count=3&types=flashcard`

test('clavier : champs à 16 px, enterkeyhint sur la réponse tapée', async ({ page }) => {
  await seed(page)
  await settings(page, { typedFlashcards: true })
  await page.goto(FLASH, { waitUntil: 'networkidle' })
  await settle(page)
  const input = page.locator('#typed-answer')
  await expect(input).toBeVisible()
  expect(await input.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16)
  await expect(input).toHaveAttribute('enterkeyhint', 'done')
  await expect(input).toHaveAttribute('autocapitalize', 'off')
})

test('menu ⋯ : feuille du bas, fermée par le bouton retour, Échap et un toucher dehors', async ({ page }) => {
  await seed(page)
  await page.goto(`/cahier/${DEMO_IDS.cahier}`, { waitUntil: 'networkidle' })
  await settle(page)
  const url = page.url()
  await page.getByRole('button', { name: 'Plus d’actions' }).click()
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  await expect(page.getByRole('menuitem').first()).toBeVisible()
  // Back button closes the sheet and stays on the page.
  await page.goBack()
  await expect(sheet).toHaveCount(0)
  expect(page.url()).toBe(url)
  // Escape.
  await page.getByRole('button', { name: 'Plus d’actions' }).click()
  await expect(sheet).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)
  // Tap outside.
  await page.getByRole('button', { name: 'Plus d’actions' }).click()
  await expect(sheet).toBeVisible()
  await page.mouse.click(200, 80)
  await expect(sheet).toHaveCount(0)
  expect(page.url()).toBe(url)
})

test('modale : verrouille le défilement, bouton retour = fermer', async ({ page }) => {
  await seed(page)
  await page.goto(FLASH, { waitUntil: 'networkidle' })
  await settle(page)
  const url = page.url()
  await page.getByRole('button', { name: 'Plus d’actions' }).click()
  await page.getByRole('menuitem', { name: /Modifier l’exercice/ }).click()
  const modal = page.getByRole('dialog', { name: /Modifier/ })
  await expect(modal).toBeVisible()
  expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe('hidden')
  expect(await overflow(page)).toBeLessThanOrEqual(0)
  await page.goBack()
  await expect(modal).toHaveCount(0)
  expect(page.url()).toBe(url)
  expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe('hidden')
})

test('bandeaux : nouvelle version et stockage indisponible', async ({ page }) => {
  await seed(page)
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cahiers:update')))
  await expect(page.getByText('Nouvelle version')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Recharger' })).toBeVisible()
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cahiers:storage-error', { detail: 'QuotaExceededError' })))
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('Stockage indisponible')
  await expect(alert).toContainText('QuotaExceededError')
  await page.getByRole('button', { name: 'Fermer' }).click()
  await expect(alert).toHaveCount(0)
})

test('app installée : bouton retour dans l’en-tête hors des onglets', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true, configurable: true }))
  await seed(page)
  await expect(page.getByRole('button', { name: 'Retour' })).toHaveCount(0)
  await page.goto(`/cahier/${DEMO_IDS.cahier}`, { waitUntil: 'networkidle' })
  await page.goto(`/cahier/${DEMO_IDS.cahier}/fiche/${DEMO_IDS.fiche}`, { waitUntil: 'networkidle' })
  await settle(page)
  const back = page.getByRole('button', { name: 'Retour' })
  await expect(back).toBeVisible()
  await back.click()
  await expect(page).toHaveURL(new RegExp(`/cahier/${DEMO_IDS.cahier}$`))
})

test('orientation : la session reste lisible en paysage', async ({ page }) => {
  await seed(page)
  await page.goto(FLASH, { waitUntil: 'networkidle' })
  await settle(page)
  const size = page.viewportSize()!
  await page.setViewportSize({ width: size.height, height: size.width })
  await settle(page, 300)
  expect(await overflow(page)).toBeLessThanOrEqual(0)
  await expect(page.getByRole('button', { name: /Retourner la carte|Révéler|Valider/ }).first()).toBeVisible()
  await page.setViewportSize(size)
  await settle(page, 300)
  expect(await overflow(page)).toBeLessThanOrEqual(0)
})

test('gestes : un balayage parti du bord ne note pas, un balayage central note', async ({ page }) => {
  await seed(page)
  await page.goto(FLASH, { waitUntil: 'networkidle' })
  await settle(page)
  await page.getByRole('button', { name: /Retourner la carte/ }).click()
  await settle(page, 300)
  await expect(page.getByRole('button', { name: /Je savais/ })).toBeVisible()
  const card = '[data-swipe]'
  await expect(page.locator(card)).toBeVisible()
  const width = page.viewportSize()!.width
  // From the left edge (iOS back gesture zone): ignored.
  await touchSwipe(page, card, { x: 10, y: 300 }, { x: width - 20, y: 300 })
  await settle(page, 400)
  await expect(page.getByRole('button', { name: /Je savais/ })).toBeVisible()
  // From the centre, to the right: « Je savais » → next card.
  await touchSwipe(page, card, { x: width / 2, y: 300 }, { x: width - 8, y: 300 })
  await settle(page, 600)
  await expect(page.getByRole('button', { name: /Je savais/ })).toHaveCount(0)
})

test('fond animé : canvas plafonné à 1,5× et mode discret sur téléphone', async ({ page }) => {
  await seed(page)
  const canvas = page.locator('canvas').first()
  await expect(canvas).toBeAttached()
  const { w, inner } = await canvas.evaluate((el) => ({ w: (el as HTMLCanvasElement).width, inner: window.innerWidth }))
  expect(w).toBeLessThanOrEqual(Math.ceil(inner * 1.5) + 1)
})

test('listes longues : les exercices de la fiche sont en content-visibility auto', async ({ page }) => {
  await seed(page)
  await page.goto(`/cahier/${DEMO_IDS.cahier}/fiche/${DEMO_IDS.fiche}`, { waitUntil: 'networkidle' })
  await settle(page)
  const li = page.locator('li.cv-auto').first()
  await expect(li).toBeAttached()
  expect(await li.evaluate((el) => getComputedStyle(el).contentVisibility)).toBe('auto')
})

test('aucune erreur console sur le parcours d’une session', async ({ page }) => {
  const errors = collectErrors(page)
  await seed(page)
  await page.goto(FLASH, { waitUntil: 'networkidle' })
  await settle(page)
  for (let i = 0; i < 3; i++) {
    const flip = page.getByRole('button', { name: /Retourner la carte/ })
    if (await flip.count()) await flip.click()
    await settle(page, 200)
    const know = page.getByRole('button', { name: /Je savais/ })
    if (await know.count()) await know.click()
    await settle(page, 300)
  }
  expect(errors).toEqual([])
})
