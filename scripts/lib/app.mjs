// Shared helpers for the Playwright-based scripts: start `vite preview` (or
// the dev server), open a page, seed the demo database, switch the theme.

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { buildDemo, DEMO_IDS } from '../seed-demo.mjs'

export { DEMO_IDS }

export const ROOT = fileURLToPath(new URL('../../', import.meta.url))

export const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  tablet: { width: 820, height: 1180 },
  desktop: { width: 1440, height: 900 },
}

export const THEMES = ['dark', 'light']

/** Starts `vite preview` (dist/) or `vite` (dev) and resolves with { url, stop } once it answers. */
export async function startServer({ dev = false, port = dev ? 5199 : 4199 } = {}) {
  const args = dev ? ['vite', '--port', String(port), '--strictPort'] : ['vite', 'preview', '--port', String(port), '--strictPort']
  const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' })
  const url = `http://localhost:${port}`
  const deadline = Date.now() + 30_000
  let lastErr
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) break
    } catch (e) {
      lastErr = e
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  if (Date.now() >= deadline) {
    child.kill()
    throw new Error(`Serveur ${url} injoignable : ${lastErr}`)
  }
  return {
    url,
    stop: () =>
      new Promise((resolve) => {
        child.on('exit', () => resolve())
        if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/f', '/t'])
        else child.kill()
        setTimeout(resolve, 2000)
      }),
  }
}

export async function launch(opts = {}) {
  return chromium.launch({ headless: true, ...opts })
}

/** Loads the demo backup (once per browser context) and applies the theme. */
export async function seed(page, url, { theme = 'dark', now = Date.now() } = {}) {
  await page.goto(url + '/', { waitUntil: 'networkidle' })
  await page.waitForFunction(() => !!window.__cahiers, null, { timeout: 15_000 })
  const count = await page.evaluate(() => window.__cahiers.count())
  if (count === 0) {
    const demo = buildDemo(now)
    await page.evaluate((data) => window.__cahiers.importBackup(data), demo)
  }
  await page.evaluate((t) => window.__cahiers.setTheme(t), theme)
  await page.reload({ waitUntil: 'networkidle' })
  await settle(page)
}

export async function setTheme(page, theme) {
  await page.evaluate((t) => window.__cahiers.setTheme(t), theme)
  await settle(page)
}

/** Waits for fonts, KaTeX and the first animations. */
export async function settle(page, ms = 400) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(ms)
}

export async function newPage(browser, viewport, extra = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: 'fr-FR', timezoneId: 'Europe/Paris', ...extra })
  const page = await context.newPage()
  page.on('pageerror', (e) => console.error('  [pageerror]', e.message))
  return { context, page }
}
