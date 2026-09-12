#!/usr/bin/env node
// Captures de la bannière d'installation : iPhone (Safari, hors écran d'accueil)
// et Android (Chrome, avec un `beforeinstallprompt` simulé), sur le build.
//
//   node scripts/install-shots.mjs [étape]   → docs/screenshots/<étape>/install-*.png

import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, devices } from '@playwright/test'
import { startServer, seed, ROOT } from './lib/app.mjs'

const step = process.argv[2] ?? 'B6'
const outDir = resolve(ROOT, 'docs/screenshots', step)
await mkdir(outDir, { recursive: true })
const server = await startServer()
const browser = await chromium.launch()
try {
  // iOS Safari: no beforeinstallprompt, the banner explains Partager → Sur l'écran d'accueil.
  const ios = await browser.newContext({ ...devices['iPhone 13'], colorScheme: 'dark' })
  const p1 = await ios.newPage()
  await seed(p1, server.url)
  await p1.goto(server.url + '/', { waitUntil: 'networkidle' })
  await p1.waitForSelector('[aria-label="Installer l’application"]')
  await p1.screenshot({ path: resolve(outDir, 'install-ios-390-dark.png') })
  console.log('install-ios-390-dark.png')

  // Android Chrome: the native prompt is offered; the event is simulated here (headless never fires it).
  const android = await browser.newContext({ ...devices['Pixel 7'], colorScheme: 'light' })
  const p2 = await android.newPage()
  await p2.addInitScript(() => {
    window.addEventListener('load', () => {
      const e = new Event('beforeinstallprompt')
      Object.assign(e, { prompt: async () => undefined, userChoice: Promise.resolve({ outcome: 'dismissed' }) })
      window.dispatchEvent(e)
    })
  })
  await seed(p2, server.url)
  await p2.goto(server.url + '/', { waitUntil: 'networkidle' })
  await p2.waitForSelector('[aria-label="Installer l’application"]')
  await p2.screenshot({ path: resolve(outDir, 'install-android-412-light.png') })
  console.log('install-android-412-light.png')

  // Theme-color follows the forced theme.
  const meta = await p2.evaluate(() => [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => `${m.getAttribute('media')} → ${m.getAttribute('content')}`))
  console.log('theme-color:', meta.join(' | '))
  const manifest = await (await fetch(server.url + '/manifest.webmanifest')).json()
  console.log('manifest:', manifest.display, manifest.orientation, manifest.icons.map((i) => `${i.sizes}/${i.purpose}`).join(' '))
} finally {
  await browser.close()
  await server.stop()
}
