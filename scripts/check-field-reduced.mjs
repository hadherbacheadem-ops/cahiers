// Emulates prefers-reduced-motion and checks that an explicit background choice animates while automatic stays still.
import { chromium } from '@playwright/test'
import { startServer, seed } from './lib/app.mjs'

const server = await startServer()
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=default'] })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await seed(page, server.url)
  const probe = async (background) => {
    await page.evaluate((b) => window.__cahiers.updateSettings({ background: b }), background)
    await page.goto(server.url + '/', { waitUntil: 'networkidle' })
    await page.waitForTimeout(4000)
    return page.evaluate(() => ({ reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, ...window.__depthField.stats() }))
  }
  const auto = await probe(undefined)
  const full = await probe('full')
  const discreet = await probe('discreet')
  console.log('auto     :', JSON.stringify(auto))
  console.log('full     :', JSON.stringify(full))
  console.log('discreet :', JSON.stringify(discreet))
  const ok = auto.reduced && !auto.running && full.running && full.fps >= 55 && discreet.running && discreet.fps >= 55
  console.log(ok ? 'OK : choix explicite animé, automatique figé' : 'KO')
  process.exitCode = ok ? 0 : 1
} finally {
  await browser.close()
  await server.stop()
}
