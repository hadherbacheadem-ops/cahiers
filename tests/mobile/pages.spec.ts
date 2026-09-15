// Every page of the app on a phone: no horizontal overflow, no console error.
import { expect, test } from '@playwright/test'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — plain ESM without declarations
import { PAGES } from '../../scripts/lib/pages.mjs'
import { collectErrors, overflow, seed, settle } from './helpers'

type P = { name: string; path: string; act?: (page: import('@playwright/test').Page) => Promise<void> }

test.describe('pages', () => {
  for (const p of PAGES as P[]) {
    test(`${p.name} : pas de débordement, pas d’erreur`, async ({ page }) => {
      const errors = collectErrors(page)
      await seed(page)
      await page.goto(p.path, { waitUntil: 'networkidle' })
      await settle(page)
      if (p.act) await p.act(page)
      await settle(page, 200)
      expect(await overflow(page), 'largeur du document − largeur de l’écran').toBeLessThanOrEqual(0)
      expect(errors).toEqual([])
    })
  }
})
