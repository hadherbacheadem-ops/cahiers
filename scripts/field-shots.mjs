#!/usr/bin/env node
// Captures the background field alone (content hidden) at t = 0, 5 s, 15 s in
// 1440×900, dark and light, into docs/screenshots/<étape>/field-*.png.
//
//   node scripts/field-shots.mjs <étape>

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, VIEWPORTS, launch, newPage, seed, setTheme, startServer } from './lib/app.mjs'

const step = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'sans-nom'
const outDir = join(ROOT, 'docs', 'screenshots', step)
mkdirSync(outDir, { recursive: true })

const server = await startServer()
const browser = await launch()
try {
  for (const theme of ['dark', 'light']) {
    const { context, page } = await newPage(browser, VIEWPORTS.desktop)
    await seed(page, server.url, { theme })
    await page.goto(server.url + '/', { waitUntil: 'networkidle' })
    await setTheme(page, theme)
    // Hide everything but the canvas; move the pointer so the lamp and parallax show.
    await page.evaluate(() => {
      for (const el of document.querySelectorAll('#root > *')) el.style.visibility = 'hidden'
      for (const c of document.querySelectorAll('#root canvas')) c.style.visibility = 'visible'
    })
    await page.mouse.move(900, 400)
    const t0 = Date.now()
    for (const at of [0, 5000, 15000]) {
      const wait = t0 + at - Date.now()
      if (wait > 0) await page.waitForTimeout(wait)
      await page.screenshot({ path: join(outDir, `field-${theme}-t${at / 1000}s.png`), animations: 'allow' })
    }
    const stats = await page.evaluate(() => window.__depthField?.stats())
    console.log(theme, JSON.stringify(stats))
    await context.close()
  }
} finally {
  await browser.close()
  await server.stop()
}
