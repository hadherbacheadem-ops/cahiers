#!/usr/bin/env node
// CPU profile of one page load on the emulated phone (Pixel 7, CPU ×4): where the
// main thread's time goes during the first N seconds, aggregated by function and
// by source file, plus the long tasks (> 50 ms) in order. For attributing TBT.
//
//   node scripts/cpu-profile.mjs [--page=fiche|dashboard|train] [--seconds=3.5] [--cpu=4] [--background=off]

import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, devices } from '@playwright/test'
import { DEMO_IDS, ROOT, seed, startServer } from './lib/app.mjs'

const args = process.argv.slice(2)
const flag = (name, def) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? def
const pageName = flag('page', 'fiche')
const seconds = Number(flag('seconds', 3.5))
const cpu = Number(flag('cpu', 4))
const background = flag('background', null)
const PATHS = {
  dashboard: '/',
  fiche: `/cahier/${DEMO_IDS.cahier}/fiche/${DEMO_IDS.fiche}`,
  train: `/train?mode=practice&scope=chapitre&id=${DEMO_IDS.fiche}&count=3&types=flashcard`,
}

const server = await startServer()
const browser = await chromium.launch()
const context = await browser.newContext({ ...devices['Pixel 7'], locale: 'fr-FR' })
const page = await context.newPage()
await seed(page, server.url)
if (background) await page.evaluate((b) => window.__cahiers.updateSettings({ background: b }), background)
const cdp = await context.newCDPSession(page)
await cdp.send('Network.enable')
await cdp.send('Network.clearBrowserCache')
await page.evaluate(async () => {
  for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister()
})
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu })
await page.addInitScript(() => {
  window.__long = []
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__long.push({ start: Math.round(e.startTime), dur: Math.round(e.duration) })
    }).observe({ type: 'longtask', buffered: true })
  } catch {}
})
await cdp.send('Profiler.enable')
await cdp.send('Profiler.setSamplingInterval', { interval: 500 })
await cdp.send('Profiler.start')
await page.goto(server.url + PATHS[pageName], { waitUntil: 'load' })
await page.waitForTimeout(seconds * 1000)
const { profile } = await cdp.send('Profiler.stop')
const long = await page.evaluate(() => window.__long)
await browser.close()
await server.stop()

// ---- Aggregate self time by node (function) and by file --------------------------------------------
const byId = new Map(profile.nodes.map((n) => [n.id, n]))
const self = new Map()
const deltas = profile.timeDeltas
for (let i = 0; i < profile.samples.length; i++) {
  const id = profile.samples[i]
  self.set(id, (self.get(id) ?? 0) + (deltas[i] ?? 0) / 1000)
}
const byFn = new Map()
const byFile = new Map()
let total = 0
for (const [id, ms] of self) {
  const n = byId.get(id)
  const cf = n.callFrame
  const file = (cf.url || '(natif)').split('/').pop()?.split('?')[0] || '(natif)'
  const fn = `${cf.functionName || '(anonyme)'} @ ${file}:${cf.lineNumber + 1}`
  byFn.set(fn, (byFn.get(fn) ?? 0) + ms)
  byFile.set(file, (byFile.get(file) ?? 0) + ms)
  total += ms
}
const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
const fmt = (ms) => `${String(Math.round(ms)).padStart(6)} ms`
console.log(`Profil ${pageName} (${seconds} s après load, CPU ×${cpu}${background ? `, fond ${background}` : ''}) — temps CPU échantillonné : ${Math.round(total)} ms`)
console.log('\nTâches longues (> 50 ms), par ordre :')
for (const t of long) console.log(`  t+${String(t.start).padStart(5)} ms  ${String(t.dur).padStart(5)} ms`)
console.log(`  total > 50 ms : ${long.reduce((s, t) => s + Math.max(0, t.dur - 50), 0)} ms de blocage`)
console.log('\nPar fichier :')
for (const [f, ms] of top(byFile, 12)) console.log(`  ${fmt(ms)}  ${f}`)
console.log('\nPar fonction (temps propre) :')
for (const [f, ms] of top(byFn, 30)) console.log(`  ${fmt(ms)}  ${f}`)
mkdirSync(join(ROOT, 'docs', 'perf'), { recursive: true })
writeFileSync(join(ROOT, 'docs', 'perf', `cpu-${pageName}${background ? '-' + background : ''}.json`), JSON.stringify({ page: pageName, seconds, cpu, background, long, byFile: top(byFile, 40), byFn: top(byFn, 80) }, null, 2))
