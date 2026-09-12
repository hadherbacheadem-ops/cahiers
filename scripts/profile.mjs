#!/usr/bin/env node
// CPU profile of a page load (dev server, readable names): prints the functions
// with the most self time. Diagnostic tool for Total Blocking Time.
//
//   node scripts/profile.mjs [/path] [--throttle=4] [--ms=8000]

import { VIEWPORTS, launch, newPage, seed, startServer } from './lib/app.mjs'

const args = process.argv.slice(2)
const path = args.find((a) => !a.startsWith('--')) ?? '/'
const throttle = Number(args.find((a) => a.startsWith('--throttle='))?.slice(11) ?? 4)
const ms = Number(args.find((a) => a.startsWith('--ms='))?.slice(5) ?? 8000)
const background = args.find((a) => a.startsWith('--background='))?.slice(13)

const server = await startServer({ dev: true })
const browser = await launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist'] })
try {
  const { context, page } = await newPage(browser, VIEWPORTS.mobile)
  await seed(page, server.url, { theme: 'dark' })
  if (background) await page.evaluate((b) => window.__cahiers.updateSettings({ background: b === 'auto' ? undefined : b }), background)
  const client = await context.newCDPSession(page)
  await client.send('Emulation.setCPUThrottlingRate', { rate: throttle })
  await client.send('Profiler.enable')
  await client.send('Profiler.setSamplingInterval', { interval: 500 })
  await client.send('Profiler.start')
  await page.goto(server.url + path, { waitUntil: 'networkidle' })
  await page.waitForTimeout(ms)
  const { profile } = await client.send('Profiler.stop')
  const self = new Map()
  const byId = new Map(profile.nodes.map((n) => [n.id, n]))
  const dt = profile.timeDeltas
  const counts = new Map()
  profile.samples.forEach((id, i) => counts.set(id, (counts.get(id) ?? 0) + (dt[i] ?? 0)))
  for (const [id, t] of counts) {
    const n = byId.get(id)
    const f = n.callFrame
    const key = `${f.functionName || '(anonyme)'}  ${f.url.replace(server.url, '').split('?')[0]}:${f.lineNumber + 1}`
    self.set(key, (self.get(key) ?? 0) + t / 1000)
  }
  const total = [...self.values()].reduce((a, b) => a + b, 0)
  console.log(`Profil ${path} (CPU ×${throttle}, ${ms} ms) — ${Math.round(total)} ms échantillonnés`)
  for (const [k, v] of [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18)) console.log(`${String(Math.round(v)).padStart(6)} ms  ${k}`)
  await context.close()
} finally {
  await browser.close()
  await server.stop()
}
