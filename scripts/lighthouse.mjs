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

const args = process.argv.slice(2)
const step = args.find((a) => !a.startsWith('--')) ?? 'sans-nom'
const software = args.includes('--software')
const background = args.find((a) => a.startsWith('--background='))?.slice(13)
const outDir = join(ROOT, 'docs', 'perf')
mkdirSync(outDir, { recursive: true })

const server = await startServer()

// One Chromium (launched by Playwright, chrome-launcher cannot spawn it on this
// machine) with a debugging port: the demo database is seeded through
// Playwright, then Lighthouse audits the same profile over that port.
const port = 9333
// GPU compositing like scripts/perf.mjs (`--software` for the SwiftShader worst case).
const browser = await chromium.launch({ headless: true, args: [`--remote-debugging-port=${port}`, ...(software ? [] : ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=default'])] })
const chrome = { port, kill: () => browser.close() }
const results = {}
try {
  // Seed in the browser's default context: Lighthouse's own target shares its IndexedDB.
  const page = await browser.contexts()[0]?.newPage() ?? (await browser.newPage())
  await page.goto(server.url + '/', { waitUntil: 'networkidle' })
  await page.waitForFunction(() => !!window.__cahiers)
  await page.evaluate((data) => window.__cahiers.importBackup(data), buildDemo())
  await page.evaluate(() => window.__cahiers.setTheme('dark'))
  if (background) await page.evaluate((b) => window.__cahiers.updateSettings({ background: b === 'auto' ? undefined : b }), background)
  // Close the seeding page: left open, its animation loop would compete with the audited page.
  await page.close()

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
    if (args.includes('--verbose')) {
      const boot = run.lhr.audits['bootup-time']?.details?.items ?? []
      for (const it of boot.slice(0, 5)) console.log(`   script ${(it.url ?? '').toString().slice(-48)} : ${Math.round(it.scripting ?? 0)} ms script, ${Math.round(it.scriptParseCompile ?? 0)} ms parse`)
      const work = run.lhr.audits['mainthread-work-breakdown']?.details?.items ?? []
      for (const it of work.slice(0, 6)) console.log(`   ${it.groupLabel} : ${Math.round(it.duration)} ms`)
      const long = run.lhr.audits['long-tasks']?.details?.items ?? []
      for (const it of long.slice(0, 6)) console.log(`   tâche longue ${Math.round(it.duration)} ms à ${Math.round(it.startTime)} ms : ${(it.url ?? '').toString().slice(-48)}`)
      const diag = run.lhr.audits['diagnostics']?.details?.items?.[0]
      if (diag) console.log(`   requêtes ${diag.numRequests}, ${Math.round(diag.totalByteWeight / 1024)} Ko, polices ${diag.numFonts}, scripts ${diag.numScripts}`)
    }
  }
} finally {
  await chrome.kill()
  await server.stop()
}
writeFileSync(join(outDir, `lighthouse-${step}.json`), JSON.stringify({ step, at: new Date().toISOString(), gpu: !software, background: background ?? 'auto', results }, null, 2))
console.log(`→ docs/perf/lighthouse-${step}.json`)
