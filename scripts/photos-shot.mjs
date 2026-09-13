#!/usr/bin/env node
// Capture de « Rédiger avec Claude » avec des photos de pages ajoutées (build).
//   node scripts/photos-shot.mjs [étape]  → docs/screenshots/<étape>/redaction-photos-*.png

import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, devices } from '@playwright/test'
import { startServer, seed, ROOT, DEMO_IDS } from './lib/app.mjs'

const step = process.argv[2] ?? 'photos'
const outDir = resolve(ROOT, 'docs/screenshots', step)
await mkdir(outDir, { recursive: true })
const server = await startServer()
const browser = await chromium.launch()
const photos = ['public/icon-512.png', 'public/apple-touch-icon.png', 'public/icon-192.png'].map((p) => resolve(ROOT, p))
try {
  for (const [name, ctx] of [
    ['desktop', { viewport: { width: 1280, height: 900 } }],
    ['mobile', { ...devices['Pixel 7'] }],
  ]) {
    const context = await browser.newContext({ ...ctx, colorScheme: 'dark' })
    const page = await context.newPage()
    await seed(page, server.url)
    await page.goto(`${server.url}/cahier/${DEMO_IDS.cahier}`, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Rédiger avec Claude' }).first().click()
    await page.waitForSelector('text=Photos du cours sur papier')
    await page.locator('input[type=file][accept="image/*"]:not([capture])').setInputFiles(photos)
    await page.waitForSelector('img[alt="Page 3"]')
    const promptText = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Voir le prompt'))
      btn?.click()
      return new Promise((r) => setTimeout(() => r(document.querySelector('textarea[readonly]')?.value ?? ''), 200))
    })
    if (name === 'desktop') {
      console.log('prompt commence par la règle 0 :', /\n0\. Les 3 photos jointes/.test(promptText))
      console.log('sources :', /### Photos jointes \(3\)/.test(promptText))
      console.log('consigne glisser :', (await page.textContent('body')).includes('glisse les 3 photos'))
    }
    await page.screenshot({ path: resolve(outDir, `redaction-photos-${name}.png`), fullPage: name === 'desktop' })
    console.log(`redaction-photos-${name}.png`)
    await context.close()
  }
} finally {
  await browser.close()
  await server.stop()
}
