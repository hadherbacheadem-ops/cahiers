// Hors ligne : once the service worker has precached the app, it opens without network.
import { expect, test } from '@playwright/test'
import { DEMO_IDS, seed, settle } from './helpers'

test('hors ligne : l’app démarre et affiche une fiche depuis le cache', async ({ page, context, browserName }) => {
  test.skip(browserName === 'webkit', 'Service workers are not exposed to Playwright WebKit contexts')
  await seed(page)
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 20_000 })
  // Let the precache finish.
  await page.waitForFunction(async () => (await caches.keys()).some((k) => /precache/.test(k)), null, { timeout: 20_000 })
  await settle(page, 1000)
  await context.setOffline(true)
  await page.goto(`/cahier/${DEMO_IDS.cahier}/fiche/${DEMO_IDS.fiche}`, { waitUntil: 'load' })
  await settle(page, 600)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.locator('.prose-fiche').first()).toBeVisible()
  await context.setOffline(false)
})
