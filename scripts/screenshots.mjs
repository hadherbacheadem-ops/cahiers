#!/usr/bin/env node
// Captures every main page of the app in three widths and two themes, on the
// demo database, into docs/screenshots/<étape>/. Runs against `vite preview`
// (build first) or, with --dev, against the dev server (needed for /design).
//
//   node scripts/screenshots.mjs <étape> [--dev] [--only=dashboard,train-before] [--width=mobile] [--theme=dark]

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, THEMES, VIEWPORTS, launch, newPage, seed, setTheme, settle, startServer } from './lib/app.mjs'
import { PAGES as MAIN_PAGES } from './lib/pages.mjs'

const args = process.argv.slice(2)
const step = args.find((a) => !a.startsWith('--')) ?? 'sans-nom'
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const dev = args.includes('--dev')
const only = flag('only')?.split(',')
const widths = flag('width')?.split(',') ?? Object.keys(VIEWPORTS)
const themes = flag('theme')?.split(',') ?? THEMES

const outDir = join(ROOT, 'docs', 'screenshots', step)
mkdirSync(outDir, { recursive: true })

const PAGES = [...MAIN_PAGES, ...(dev ? [{ name: 'design', path: '/design' }] : [])]

const server = await startServer({ dev })
const browser = await launch()
let shots = 0
try {
  for (const theme of themes) {
    for (const widthName of widths) {
      const viewport = VIEWPORTS[widthName]
      const { context, page } = await newPage(browser, viewport)
      await seed(page, server.url, { theme })
      for (const p of PAGES) {
        if (only && !only.includes(p.name)) continue
        await page.goto(server.url + p.path, { waitUntil: 'networkidle' })
        await settle(page, 500)
        if (p.act) await p.act(page)
        await setTheme(page, theme)
        const file = join(outDir, `${p.name}-${widthName}-${theme}.png`)
        await page.screenshot({ path: file, fullPage: !p.viewportOnly, animations: 'disabled' })
        shots++
      }
      await context.close()
    }
  }
  console.log(`${shots} captures dans ${outDir}`)
} finally {
  await browser.close()
  await server.stop()
}
