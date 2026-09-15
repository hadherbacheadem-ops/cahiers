#!/usr/bin/env node
// Total Blocking Time, LCP and start-up cost on a mid-range phone: Pixel 7
// emulation in Chromium with the CPU throttled ×4, on the main pages, cold
// (fresh profile, no service worker) and warm (second load, service worker
// active). « Bisection » by feature: the same measures with the animated
// background off and with the light theme, so a regression can be attributed.
// Writes docs/perf/tbt-<étape>.json and prints the table.
//
//   node scripts/tbt.mjs <étape> [--runs=3] [--cpu=4] [--only=dashboard,fiche]

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, devices } from '@playwright/test'
import { DEMO_IDS, ROOT, seed, startServer } from './lib/app.mjs'

const args = process.argv.slice(2)
const step = args.find((a) => !a.startsWith('--')) ?? 'sans-nom'
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const runs = Number(flag('runs') ?? 3)
const cpu = Number(flag('cpu') ?? 4)
const only = flag('only')?.split(',')

const PAGES = [
  { name: 'dashboard', path: '/' },
  { name: 'fiche', path: `/cahier/${DEMO_IDS.cahier}/fiche/${DEMO_IDS.fiche}` },
  { name: 'train', path: `/train?mode=practice&scope=chapitre&id=${DEMO_IDS.fiche}&count=3&types=flashcard` },
].filter((p) => !only || only.includes(p.name))

/** Feature bisection: settings applied before the measured navigation. */
const VARIANTS = [
  { name: 'base', settings: {} },
  { name: 'sans-fond', settings: { background: 'off' } },
  ...(args.includes('--all-variants') ? [{ name: 'clair', settings: { theme: 'light' } }] : []),
]

const INIT = () => {
  window.__perf = { long: [], lcp: 0, fcp: 0 }
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__perf.long.push({ start: e.startTime, dur: e.duration })
    }).observe({ type: 'longtask', buffered: true })
    new PerformanceObserver((l) => {
      const e = l.getEntries().at(-1)
      if (e) window.__perf.lcp = e.startTime
    }).observe({ type: 'largest-contentful-paint', buffered: true })
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') window.__perf.fcp = e.startTime
    }).observe({ type: 'paint', buffered: true })
  } catch {
    /* observers unavailable */
  }
}

const READ = () => {
  const p = window.__perf
  const nav = performance.getEntriesByType('navigation')[0]
  const tasks = p.long.filter((t) => t.start >= p.fcp)
  const js = performance.getEntriesByType('resource').filter((r) => /\.m?js(\?|$)/.test(r.name))
  return {
    fcp: Math.round(p.fcp),
    lcp: Math.round(p.lcp),
    tbt: Math.round(tasks.reduce((s, t) => s + Math.max(0, t.dur - 50), 0)),
    longTasks: tasks.length,
    longest: Math.round(Math.max(0, ...tasks.map((t) => t.dur))),
    domReady: Math.round(nav?.domContentLoadedEventEnd ?? 0),
    load: Math.round(nav?.loadEventEnd ?? 0),
    jsFiles: js.length,
    jsKb: Math.round(js.reduce((s, r) => s + (r.encodedBodySize || 0), 0) / 1024),
  }
}

function median(values) {
  const s = [...values].sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : 0
}
function summarise(list) {
  const keys = Object.keys(list[0] ?? {})
  return Object.fromEntries(keys.map((k) => [k, median(list.map((r) => r[k]))]))
}

const server = await startServer()
const browser = await chromium.launch()
const results = []
try {
  for (const page of PAGES) {
    for (const variant of VARIANTS) {
      const cold = []
      const warm = []
      for (let i = 0; i < runs; i++) {
        const context = await browser.newContext({ ...devices['Pixel 7'], locale: 'fr-FR' })
        const tab = await context.newPage()
        await seed(tab, server.url)
        if (Object.keys(variant.settings).length) {
          await tab.evaluate((s) => window.__cahiers.updateSettings(s), variant.settings)
          await tab.evaluate((s) => window.__cahiers.setTheme(s.theme ?? 'dark'), variant.settings)
        }
        // Cold: the seeded profile keeps the database, but the HTTP cache and the service worker are dropped.
        const cdp = await context.newCDPSession(tab)
        await cdp.send('Network.enable')
        await cdp.send('Network.clearBrowserCache')
        await tab.evaluate(async () => {
          for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister()
        })
        await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu })
        await tab.addInitScript(INIT)
        await tab.goto(server.url + page.path, { waitUntil: 'load', timeout: 90_000 })
        await tab.waitForTimeout(3500)
        cold.push(await tab.evaluate(READ))
        console.error(`  ${page.name}/${variant.name} run ${i + 1}: froid TBT ${cold.at(-1).tbt} ms`)
        // Warm: service worker registered by the cold load, HTTP cache back on, second navigation.
        await cdp.send('Network.setCacheDisabled', { cacheDisabled: false })
        await tab.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 15_000 }).catch(() => undefined)
        await tab.waitForTimeout(1500)
        await tab.goto(server.url + page.path, { waitUntil: 'load', timeout: 90_000 })
        await tab.waitForTimeout(3500)
        warm.push(await tab.evaluate(READ))
        console.error(`  ${page.name}/${variant.name} run ${i + 1}: chaud TBT ${warm.at(-1).tbt} ms`)
        await context.close()
      }
      const row = { page: page.name, variant: variant.name, cold: summarise(cold), warm: summarise(warm) }
      results.push(row)
      console.log(
        `${page.name.padEnd(10)} ${variant.name.padEnd(10)} froid : TBT ${String(row.cold.tbt).padStart(5)} ms · LCP ${String(row.cold.lcp).padStart(5)} ms · JS ${row.cold.jsKb} Ko (${row.cold.jsFiles})  |  chaud : TBT ${String(row.warm.tbt).padStart(5)} ms · LCP ${String(row.warm.lcp).padStart(5)} ms · load ${row.warm.load} ms`,
      )
    }
  }
} finally {
  await browser.close()
  await server.stop()
}

const outDir = join(ROOT, 'docs', 'perf')
mkdirSync(outDir, { recursive: true })
const out = { step, date: new Date().toISOString(), device: 'Pixel 7 (Chromium)', cpuThrottle: cpu, runs, results }
writeFileSync(join(outDir, `tbt-${step}.json`), JSON.stringify(out, null, 2))
console.log(`→ docs/perf/tbt-${step}.json`)
