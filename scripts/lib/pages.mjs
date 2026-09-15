// The app's main pages on the demo database, with the interaction that brings
// each to its interesting state. Shared by screenshots.mjs, mobile-matrix.mjs
// and parity.mjs so every script walks the same surface.

import { DEMO_IDS } from './app.mjs'

export async function clickIf(page, re) {
  // Only enabled buttons: an answered « Vrai » stays in the page, disabled and pressed.
  const btn = page.getByRole('button', { name: re, disabled: false }).first()
  if (await btn.count()) {
    await btn.click({ timeout: 3000 })
    await page.waitForTimeout(150)
    return true
  }
  return false
}

async function settle(page, ms = 400) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(ms)
}

/** Each page: a path, whether only the viewport matters (fixed layouts), an optional interaction. */
export const PAGES = [
  { name: 'dashboard', path: '/' },
  { name: 'cahiers', path: '/cahiers' },
  { name: 'cahier', path: `/cahier/${DEMO_IDS.cahier}` },
  { name: 'fiche', path: `/cahier/${DEMO_IDS.cahier}/fiche/${DEMO_IDS.fiche}` },
  { name: 'train-before', path: '/train?mode=review&scope=all&types=flashcard', viewportOnly: true },
  {
    name: 'train-after',
    path: '/train?mode=review&scope=all&types=flashcard',
    viewportOnly: true,
    async act(page) {
      await clickIf(page, /^Sûr/)
      const box = page.getByRole('textbox').first()
      if (await box.count()) await box.fill('F = q1 q2 / (4 pi eps0 r^2)')
      await clickIf(page, /Retourner la carte|Révéler|Voir la réponse|^Valider|^Vérifier/)
      await settle(page, 500)
    },
  },
  { name: 'chrono', path: '/train?mode=chrono&scope=all&count=5&seconds=90&types=truefalse', viewportOnly: true },
  {
    name: 'results',
    path: `/train?mode=practice&scope=chapitre&id=${DEMO_IDS.fiche}&count=1&types=truefalse`,
    async act(page) {
      // Answer whatever comes until the results screen shows up.
      for (let i = 0; i < 8; i++) {
        if (await page.getByRole('button', { name: /^Retour|^Terminer/ }).count()) break
        await clickIf(page, /^Sûr/)
        if (await clickIf(page, /^Vrai\b/)) {
          await settle(page, 300)
          await clickIf(page, /^Continuer/)
        } else if (await clickIf(page, /Retourner la carte|Révéler|Voir la réponse|^Valider|^Vérifier/)) {
          await settle(page, 300)
          await clickIf(page, /^Bien|Je savais/)
        } else if (!(await clickIf(page, /^Continuer/))) {
          await clickIf(page, /^Bien|^Su\b|Je savais/)
        }
        await settle(page, 400)
      }
    },
  },
  { name: 'validate', path: `/cahier/${DEMO_IDS.cahier}/fiche/${DEMO_IDS.ficheWithPending}/valider` },
  { name: 'mindmap', path: `/carte/${DEMO_IDS.mindmap}`, viewportOnly: true },
  { name: 'stats', path: '/stats' },
  { name: 'settings', path: '/settings' },
  { name: 'aide', path: '/aide' },
]

/** Pages worth checking in landscape too (fixed-height layouts and long reading). */
export const LANDSCAPE_PAGES = ['train-before', 'train-after', 'fiche', 'mindmap']
