#!/usr/bin/env node
// Vérifie qu'un build fait avec VITE_BASE=/cahiers/ fonctionne servi sous
// cette base (liens profonds, navigation, manifest, aucune erreur console) :
//
//   $env:VITE_BASE='/cahiers/'; npm run build; node scripts/check-base.mjs [--base=/cahiers/]
//
// Écrit une capture dans docs/screenshots/B5/.

import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import { chromium } from '@playwright/test'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const base = (process.argv.find((a) => a.startsWith('--base=')) ?? '--base=/cahiers/').slice(7)
const port = 4198

const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'preview', '--port', String(port), '--strictPort', '--base', base], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' })
const origin = `http://localhost:${port}`
const deadline = Date.now() + 30_000
while (Date.now() < deadline) {
  try {
    if ((await fetch(`${origin}${base}`)).ok) break
  } catch {
    // not up yet
  }
  await new Promise((r) => setTimeout(r, 250))
}

const failures = []
const check = (cond, msg) => {
  console.log(`${cond ? 'ok ' : 'KO '} ${msg}`)
  if (!cond) failures.push(msg)
}

try {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  const errors = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('response', (r) => r.status() >= 400 && !r.url().includes('/sw.js') && errors.push(`${r.status()} ${r.url()}`))

  // Deep link served directly (404.html on GitHub Pages, SPA fallback in vite preview).
  const res = await page.goto(`${origin}${base}settings`, { waitUntil: 'networkidle' })
  check(res.ok(), `GET ${base}settings répond ${res.status()}`)
  await page.waitForSelector('h1')
  check((await page.textContent('h1'))?.includes('Réglages'), 'la page Réglages se rend sous la base')

  const manifest = await page.$eval('link[rel="manifest"]', (l) => l.href)
  check(manifest === `${origin}${base}manifest.webmanifest`, `manifest sous la base (${manifest})`)
  const m = await (await fetch(manifest)).json()
  check(m.start_url === base && m.scope === base, `start_url/scope = ${m.start_url} / ${m.scope}`)
  const icon = new URL(m.icons[0].src, manifest).href
  check((await fetch(icon)).ok, `icône du manifest accessible (${icon})`)
  check((await fetch(`${origin}${base}404.html`)).ok, '404.html présent')

  // Navigation stays under the base.
  await page.click('a[href$="/stats"]')
  await page.waitForURL(`**${base}stats`)
  check(page.url() === `${origin}${base}stats`, `navigation interne → ${page.url()}`)
  // react-router writes the basename without its trailing slash; both forms are the app root.
  const root = base.replace(/\/$/, '')
  await page.click(`a[href="${root}"], a[href="${base}"]`)
  await page.waitForURL((u) => u.pathname === root || u.pathname === base)
  check([`${origin}${root}`, `${origin}${base}`].includes(page.url()), `retour au tableau de bord → ${page.url()}`)

  // Service worker registered with the base scope.
  const swScope = await page.evaluate(async () => {
    const regs = await navigator.serviceWorker.getRegistrations()
    return regs.map((r) => r.scope)
  })
  check(swScope.some((s) => s === `${origin}${base}`), `service worker enregistré avec le scope ${swScope.join(', ') || '(aucun)'}`)

  check(errors.length === 0, `aucune erreur console / réseau${errors.length ? ` : ${errors.join(' | ')}` : ''}`)

  await mkdir(resolve(ROOT, 'docs/screenshots/B5'), { recursive: true })
  await page.goto(`${origin}${base}settings`, { waitUntil: 'networkidle' })
  await page.screenshot({ path: resolve(ROOT, 'docs/screenshots/B5/settings-base-cahiers.png') })
  await browser.close()
} finally {
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/f', '/t'])
  else child.kill()
}
console.log(failures.length ? `${failures.length} échec(s)` : 'Tout est bon sous la base ' + base)
process.exit(failures.length ? 1 : 0)
