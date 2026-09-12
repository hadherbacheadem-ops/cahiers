#!/usr/bin/env node
// Lighthouse (mobile emulation, headless Chromium from Playwright) on the
// dashboard and the review session, with the demo database seeded in a
// persistent profile first. Writes docs/perf/lighthouse-<étape>.json.
//
//   node scripts/lighthouse.mjs <étape>

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from '@playwright/test'
import lighthouse from 'lighthouse'
import { ROOT, startServer } from './lib/app.mjs'
import { buildDemo } from './seed-demo.mjs'

const step = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'sans-nom'
const outDir = join(ROOT, 'docs', 'perf')
mkdirSync(outDir, { recursive: true })

const server = await startServer()

// One Chromium (launched by Playwright, chrome-launcher cannot spawn it on this
// machine) with a debugging port: the demo database is seeded through
// Playwright, then Lighthouse audits the same profile over that port.
const port = 9333
const browser = await chromium.launch({ headless: true, args: [`--remote-debugging-port=${port}`] })
const chrome = { port, kill: () => browser.close() }
const results = {}
try {
  // Seed in the browser's default context: Lighthouse's own target shares its IndexedDB.
  const page = await browser.contexts()[0]?.newPage() ?? (await browser.newPage())
  await page.goto(server.url + '/', { waitUntil: 'networkidle' })
  await page.waitForFunction(() => !!window.__cahiers)
  await page.evaluate((data) => window.__cahiers.importBackup(data), buildDemo())
  await page.evaluate(() => window.__cahiers.setTheme('dark'))

  for (const [name, path] of [['dashboard', '/'], ['train', '/train?mode=review&scope=all']]) {
    const run = await lighthouse(server.url + path, { port: chrome.port, output: 'json', logLevel: 'error', onlyCategories: ['performance', 'accessibility', 'best-practices'] })
    const cats = run.lhr.categories
    results[name] = {
      performance: Math.round((cats.performance?.score ?? 0) * 100),
      accessibility: Math.round((cats.accessibility?.score ?? 0) * 100),
      bestPractices: Math.round((cats['best-practices']?.score ?? 0) * 100),
      lcpMs: Math.round(run.lhr.audits['largest-contentful-paint']?.numericValue ?? 0),
      tbtMs: Math.round(run.lhr.audits['total-blocking-time']?.numericValue ?? 0),
      cls: +(run.lhr.audits['cumulative-layout-shift']?.numericValue ?? 0).toFixed(3),
      installable: run.lhr.audits['installable-manifest']?.score ?? null,
    }
    console.log(`${name}: perf ${results[name].performance}, a11y ${results[name].accessibility}, bonnes pratiques ${results[name].bestPractices} (LCP ${results[name].lcpMs} ms, TBT ${results[name].tbtMs} ms, CLS ${results[name].cls})`)
  }
} finally {
  await chrome.kill()
  await server.stop()
}
writeFileSync(join(outDir, `lighthouse-${step}.json`), JSON.stringify({ step, at: new Date().toISOString(), results }, null, 2))
console.log(`→ docs/perf/lighthouse-${step}.json`)
