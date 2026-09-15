#!/usr/bin/env node
// Device matrix (Nuit 2, règle 0.2): every page of the app on six devices across
// WebKit and Chromium, dark and light, portrait (and landscape for the fixed
// layouts), on the demo database. For each combination: console errors and
// uncaught exceptions, horizontal overflow (scrollWidth > innerWidth), a
// screenshot. Writes docs/mobile/matrix/<étape>/{report.json,index.html,*.png}.
//
//   node scripts/mobile-matrix.mjs <étape> [--only=dashboard,fiche] [--devices=iPhone 14,Pixel 7] [--theme=dark] [--no-landscape]
//
// Exit code 1 when any page has an error or an overflow (the night's exit criterion is 0/0).

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, devices, webkit } from '@playwright/test'
import { ROOT, seed, settle, startServer } from './lib/app.mjs'
import { LANDSCAPE_PAGES, PAGES } from './lib/pages.mjs'

const args = process.argv.slice(2)
const step = args.find((a) => !a.startsWith('--')) ?? 'sans-nom'
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const only = flag('only')?.split(',')
const themes = flag('theme')?.split(',') ?? ['dark', 'light']
const withLandscape = !args.includes('--no-landscape')

/** The matrix: descriptor name → engine. Widths: 375, 390, 430, 768 (WebKit) ; 412, 320 (Chromium). */
const DEVICES = [
  { name: 'iPhone SE', engine: 'webkit' },
  { name: 'iPhone 14', engine: 'webkit' },
  { name: 'iPhone 14 Pro Max', engine: 'webkit' },
  { name: 'iPad Mini', engine: 'webkit' },
  { name: 'Pixel 7', engine: 'chromium' },
  { name: 'Galaxy S9+', engine: 'chromium' },
].filter((d) => !flag('devices') || flag('devices').split(',').includes(d.name))

/** Console messages that are noise, not bugs (kept short on purpose: everything else counts). */
const IGNORED = [/Download the React DevTools/, /\[vite\]/]

const outDir = join(ROOT, 'docs', 'mobile', 'matrix', step)
mkdirSync(outDir, { recursive: true })

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const server = await startServer()
const browsers = { chromium: await chromium.launch(), webkit: await webkit.launch() }
const rows = []
const t0 = Date.now()
try {
  for (const device of DEVICES) {
    const browser = browsers[device.engine]
    for (const theme of themes) {
      for (const orientation of withLandscape ? ['portrait', 'landscape'] : ['portrait']) {
        const descriptor = devices[orientation === 'landscape' ? `${device.name} landscape` : device.name]
        if (!descriptor) continue
        const pages = PAGES.filter((p) => (!only || only.includes(p.name)) && (orientation === 'portrait' || LANDSCAPE_PAGES.includes(p.name)))
        if (!pages.length) continue
        // Screenshots at 1× keep the gallery light; the descriptor's own scale factor is tested separately (canvas budget).
        const context = await browser.newContext({ ...descriptor, deviceScaleFactor: 1, colorScheme: theme, locale: 'fr-FR', timezoneId: 'Europe/Paris' })
        const page = await context.newPage()
        const errors = []
        page.on('console', (m) => {
          if (m.type() === 'error' && !IGNORED.some((re) => re.test(m.text()))) errors.push({ kind: 'console', text: m.text().slice(0, 300) })
        })
        page.on('pageerror', (e) => errors.push({ kind: 'exception', text: String(e.message ?? e).slice(0, 300) }))
        await seed(page, server.url, { theme })
        errors.length = 0 // the seed itself is not the page under test
        for (const p of pages) {
          const before = errors.length
          const started = Date.now()
          try {
            await page.goto(server.url + p.path, { waitUntil: 'networkidle' })
            await settle(page, 500)
            if (p.act) await p.act(page)
          } catch (e) {
            errors.push({ kind: 'navigation', text: String(e.message ?? e).slice(0, 300) })
          }
          const metrics = await page.evaluate(() => {
            const doc = document.documentElement
            const overflow = Math.max(doc.scrollWidth, document.body.scrollWidth) - window.innerWidth
            // Who overflows: the widest elements sticking out to the right, for the report.
            const culprits = []
            if (overflow > 1) {
              for (const el of document.querySelectorAll('body *')) {
                const r = el.getBoundingClientRect()
                if (r.right > window.innerWidth + 1 && r.width > 0 && r.width < 20000) {
                  culprits.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(/\s+/).slice(0, 3).join('.') : ''} (+${Math.round(r.right - window.innerWidth)}px)`)
                  if (culprits.length >= 5) break
                }
              }
            }
            return { overflow: Math.max(0, overflow), culprits, innerWidth: window.innerWidth, scrollWidth: Math.max(doc.scrollWidth, document.body.scrollWidth) }
          })
          const file = `${slug(p.name)}--${slug(device.name)}--${orientation}--${theme}.png`
          await page.screenshot({ path: join(outDir, file), fullPage: !p.viewportOnly, animations: 'disabled' }).catch(() => undefined)
          const pageErrors = errors.slice(before)
          rows.push({ page: p.name, device: device.name, engine: device.engine, orientation, theme, width: metrics.innerWidth, overflow: metrics.overflow, culprits: metrics.culprits, errors: pageErrors, ms: Date.now() - started, file })
          const flag = pageErrors.length || metrics.overflow > 1 ? '✗' : '✓'
          console.log(`${flag} ${p.name.padEnd(13)} ${device.name.padEnd(18)} ${orientation.padEnd(9)} ${theme.padEnd(5)} ${pageErrors.length} err  +${metrics.overflow}px`)
        }
        await context.close()
      }
    }
  }
} finally {
  await Promise.all(Object.values(browsers).map((b) => b.close()))
  await server.stop()
}

const bad = rows.filter((r) => r.errors.length || r.overflow > 1)
const summary = { step, at: new Date().toISOString(), durationMs: Date.now() - t0, combinations: rows.length, withErrors: rows.filter((r) => r.errors.length).length, withOverflow: rows.filter((r) => r.overflow > 1).length, devices: DEVICES.map((d) => d.name), themes }
writeFileSync(join(outDir, 'report.json'), JSON.stringify({ summary, rows }, null, 2))

// ---- Gallery -------------------------------------------------------------------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const pageNames = [...new Set(rows.map((r) => r.page))]
const columns = [...new Set(rows.map((r) => `${r.device}|${r.orientation}|${r.theme}`))]
const cell = (r) =>
  r
    ? `<td class="${r.errors.length || r.overflow > 1 ? 'bad' : 'ok'}"><a href="${r.file}"><img loading="lazy" src="${r.file}" alt=""></a><div class="meta">${r.width}px${r.overflow > 1 ? ` · <b>+${r.overflow}px</b>` : ''}${r.errors.length ? ` · <b>${r.errors.length} err</b>` : ''}</div>${r.errors.map((e) => `<div class="err">${esc(e.text)}</div>`).join('')}${r.culprits.map((c) => `<div class="err">${esc(c)}</div>`).join('')}</td>`
    : '<td></td>'
const html = `<!doctype html><meta charset="utf-8"><title>Matrice mobile — ${esc(step)}</title>
<style>body{font:13px system-ui;margin:16px;background:#111;color:#ddd}table{border-collapse:collapse}th,td{border:1px solid #333;padding:4px;vertical-align:top;text-align:left}th{position:sticky;top:0;background:#222}td.ok{background:#0f1f14}td.bad{background:#2a1212}img{width:140px;display:block;border-radius:4px}.meta{color:#aaa;margin-top:2px}.err{color:#f88;max-width:140px;word-break:break-all;font-size:11px}h1{font-size:18px}</style>
<h1>Matrice mobile — ${esc(step)}</h1>
<p>${rows.length} combinaisons · ${summary.withErrors} avec erreurs console · ${summary.withOverflow} avec débordement horizontal · ${Math.round(summary.durationMs / 1000)} s</p>
<table><tr><th>page</th>${columns.map((c) => `<th>${esc(c.replaceAll('|', '<br>'))}</th>`).join('')}</tr>
${pageNames.map((p) => `<tr><th>${esc(p)}</th>${columns.map((c) => cell(rows.find((r) => r.page === p && `${r.device}|${r.orientation}|${r.theme}` === c))).join('')}</tr>`).join('\n')}
</table>`
writeFileSync(join(outDir, 'index.html'), html)

console.log(`\n${rows.length} combinaisons, ${summary.withErrors} avec erreurs, ${summary.withOverflow} avec débordement → ${outDir}`)
if (bad.length) {
  for (const r of bad) console.log(`  ${r.page} / ${r.device} / ${r.orientation} / ${r.theme}: ${r.errors.map((e) => e.text).join(' | ')}${r.overflow > 1 ? ` overflow +${r.overflow}px (${r.culprits.join(', ')})` : ''}`)
  process.exitCode = 1
}
