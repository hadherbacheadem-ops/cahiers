#!/usr/bin/env node
// Measured budgets (never estimated): frame rate of the review session with
// the animated background (desktop, and CPU throttled ×4 to mimic a mid-range
// phone), background frame time, Cumulative Layout Shift on the main pages,
// gzip size of the JS bundles in dist/. Writes docs/perf/<étape>.json.
//
//   node scripts/perf.mjs <étape>

import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { DEMO_IDS, ROOT, VIEWPORTS, launch, newPage, seed, settle, startServer } from './lib/app.mjs'

const step = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'sans-nom'
const outDir = join(ROOT, 'docs', 'perf')
mkdirSync(outDir, { recursive: true })

function median(values) {
  const s = [...values].sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : 0
}

/** Samples requestAnimationFrame deltas for `ms` and returns fps / frame stats. */
async function sampleFrames(page, ms) {
  return page.evaluate(
    (duration) =>
      new Promise((resolve) => {
        const deltas = []
        let last = performance.now()
        const start = last
        function tick(t) {
          deltas.push(t - last)
          last = t
          if (t - start < duration) requestAnimationFrame(tick)
          else resolve(deltas)
        }
        requestAnimationFrame(tick)
      }),
    ms,
  ).then((deltas) => {
    const sorted = [...deltas].sort((a, b) => a - b)
    const med = sorted[Math.floor(sorted.length / 2)] ?? 0
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0
    return { frames: deltas.length, medianFrameMs: +med.toFixed(2), p95FrameMs: +p95.toFixed(2), fpsMedian: med ? +(1000 / med).toFixed(1) : 0, fpsMean: +((deltas.length / (deltas.reduce((a, b) => a + b, 0) / 1000)) || 0).toFixed(1) }
  })
}

/** Background field stats exposed by <DepthField> (A1); null before it exists. */
async function fieldStats(page) {
  return page.evaluate(() => (window.__depthField ? window.__depthField.stats() : null))
}

async function measureCls(page, url) {
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.evaluate(() => {
    window.__cls = 0
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value
    }).observe({ type: 'layout-shift', buffered: true })
  })
  await settle(page, 1500)
  return page.evaluate(() => +window.__cls.toFixed(4))
}

function bundleSizes() {
  const dir = join(ROOT, 'dist', 'assets')
  const files = readdirSync(dir).filter((f) => f.endsWith('.js'))
  const out = {}
  let total = 0
  for (const f of files) {
    const buf = readFileSync(join(dir, f))
    const gz = gzipSync(buf).length
    const key = f.replace(/-[\w-]+\.js$/, '.js')
    out[key] = { raw: statSync(join(dir, f)).size, gzip: gz, sha: createHash('sha1').update(buf).digest('hex').slice(0, 8) }
    if (key.startsWith('index')) total += gz
  }
  return { files: out, mainGzip: total }
}

const server = await startServer()
const browser = await launch()
const result = { step, at: new Date().toISOString(), bundle: bundleSizes(), session: {}, cls: {} }
try {
  const { context, page } = await newPage(browser, VIEWPORTS.desktop)
  await seed(page, server.url, { theme: 'dark' })
  const client = await context.newCDPSession(page)

  for (const [label, rate] of [['desktop', 1], ['throttled4x', 4]]) {
    await client.send('Emulation.setCPUThrottlingRate', { rate })
    await page.goto(server.url + '/train?mode=review&scope=all', { waitUntil: 'networkidle' })
    await settle(page, 800)
    const frames = await sampleFrames(page, 5000)
    const field = await fieldStats(page)
    result.session[label] = { ...frames, field }
    console.log(`${label}: ${frames.fpsMedian} fps médian (frame ${frames.medianFrameMs} ms, p95 ${frames.p95FrameMs} ms)${field ? `, fond ${field.medianMs} ms/frame (${field.particles} particules, ${field.planes} plans)` : ''}`)
  }
  await client.send('Emulation.setCPUThrottlingRate', { rate: 1 })

  const pages = { dashboard: '/', cahier: `/cahier/${DEMO_IDS.cahier}`, fiche: `/cahier/${DEMO_IDS.cahier}/fiche/${DEMO_IDS.fiche}`, train: '/train?mode=review&scope=all', stats: '/stats', settings: '/settings' }
  for (const [name, path] of Object.entries(pages)) {
    result.cls[name] = await measureCls(page, server.url + path)
  }
  console.log('CLS :', JSON.stringify(result.cls))
  console.log(`bundle JS principal : ${(result.bundle.mainGzip / 1024).toFixed(1)} Ko gzip`)
  await context.close()
} finally {
  await browser.close()
  await server.stop()
}
writeFileSync(join(outDir, `${step}.json`), JSON.stringify(result, null, 2))
console.log(`→ docs/perf/${step}.json`)
