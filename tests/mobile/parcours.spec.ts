// The recorded journey (project « parcours » : iPhone 14 WebKit, trace + video
// kept in docs/mobile/parcours/): dashboard → cahiers → cahier → fiche → a
// session of three exercises → results → statistics → settings. Every step
// checks the page is on screen, not wider than it, and silent in the console.
import { expect, test } from '@playwright/test'
import { collectErrors, DEMO_IDS, overflow, seed, settle } from './helpers'

test('parcours complet sur iPhone 14', async ({ page }) => {
  const errors = collectErrors(page)
  const check = async (label: string) => {
    await settle(page, 300)
    expect(await overflow(page), `${label} : débordement`).toBeLessThanOrEqual(0)
    expect(errors, `${label} : console`).toEqual([])
  }

  await seed(page)
  await check('tableau de bord')

  await page.getByRole('link', { name: 'Cahiers' }).last().click()
  await expect(page).toHaveURL(/\/cahiers$/)
  await check('cahiers')

  await page.locator('[data-action="ouvrir-le-cahier"]').first().click()
  await expect(page).toHaveURL(/\/cahier\//)
  await check('cahier')

  await page.locator('[data-action="ouvrir-la-fiche"]').first().click()
  await expect(page).toHaveURL(/\/fiche\//)
  await expect(page.locator('.prose-fiche').first()).toBeVisible()
  await check('fiche')

  await page.goto(`/train?mode=practice&scope=chapitre&id=${DEMO_IDS.fiche}&count=3&types=flashcard,truefalse`, { waitUntil: 'networkidle' })
  await check('session')
  const tryClick = async (re: RegExp) => {
    const l = page.getByRole('button', { name: re, disabled: false }).first()
    if (!(await l.count())) return false
    // A verdict can advance on its own while we aim at « Continuer »: a vanished button is progress, not a failure.
    await l.click({ timeout: 2500 }).catch(() => undefined)
    return true
  }
  // Answer whatever comes (flashcards, true/false and their verdicts) until the results screen.
  for (let i = 0; i < 14; i++) {
    if (await page.getByRole('button', { name: /^Terminer$/ }).count()) break
    if (await tryClick(/Retourner la carte/)) {
      await settle(page, 300)
      await tryClick(/Je savais|^Bien/)
    } else if (await tryClick(/^Vrai\b/)) {
      await settle(page, 300)
    } else if (!(await tryClick(/^Continuer|^Suivant/))) {
      await tryClick(/Je savais|^Bien|^Su\b/)
    }
    await check(`étape ${i + 1}`)
  }
  const leave = page.getByRole('button', { name: /^Terminer$|^Retour$/ }).first()
  await expect(leave).toBeVisible()
  await check('résultats')
  // The session has its own full-screen layout (no tab bar): leave it first.
  await leave.click()
  await settle(page, 500)
  await check('retour de session')

  await page.getByRole('link', { name: 'Statistiques' }).last().click()
  await expect(page).toHaveURL(/\/stats$/)
  await check('statistiques')

  await page.getByRole('link', { name: 'Réglages' }).last().click()
  await expect(page).toHaveURL(/\/settings$/)
  await page.locator('summary[data-action="section"]').first().click()
  await check('réglages')
})
