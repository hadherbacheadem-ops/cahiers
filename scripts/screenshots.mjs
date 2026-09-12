#!/usr/bin/env node
// Captures every main page of the app in three widths and two themes, on the
// demo database, into docs/screenshots/<étape>/. Runs against `vite preview`
// (build first) or, with --dev, against the dev server (needed for /design).
//
//   node scripts/screenshots.mjs <étape> [--dev] [--only=dashboard,train-before] [--width=mobile] [--theme=dark]

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_IDS, ROOT, THEMES, VIEWPORTS, launch, newPage, seed, setTheme, settle, startServer } from './lib/app.mjs'

const args = process.argv.slice(2)
const step = args.find((a) => !a.startsWith('--')) ?? 'sans-nom'
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const dev = args.includes('--dev')
const only = flag('only')?.split(',')
const widths = flag('width')?.split(',') ?? Object.keys(VIEWPORTS)
const themes = flag('theme')?.split(',') ?? THEMES

const outDir = join(ROOT, 'docs', 'screenshots', step)
mkdirSync(outDir, { recursive: true })

/** Each page: a path and an optional interaction before the capture. */
const PAGES = [
  { name: 'dashboard', path: '/' },
  { name: 'cahier', path: `/cahier/${DEMO_IDS.cahier}` },
  { name: 'fiche', path: `/cahier/${DEMO_IDS.cahier}/fiche/${DEMO_IDS.fiche}` },
  { name: 'train-before', path: '/train?mode=review&scope=all&types=flashcard', viewportOnly: true },
  {
    name: 'train-after',
    path: '/train?mode=review&scope=all&types=flashcard',
    viewportOnly: true,
    async act(page) {
      await clickIf(page, /^Sûr/)
      const box = page.getByRole('textbox').first()
      if (await box.count()) await box.fill('F = q1 q2 / (4 pi eps0 r^2)')
      await clickIf(page, /Révéler|Voir la réponse|^Valider/)
      await settle(page, 500)
    },
  },
  { name: 'chrono', path: '/train?mode=chrono&scope=all&count=5&seconds=90', viewportOnly: true },
  {
    name: 'results',
    path: `/train?mode=practice&scope=chapitre&id=${DEMO_IDS.fiche}&count=1&types=truefalse`,
    async act(page) {
      // Answer whatever comes until the results screen shows up.
      for (let i = 0; i < 8; i++) {
        if (await page.getByRole('button', { name: /^Retour|^Terminer/ }).count()) break
        await clickIf(page, /^Sûr/)
        if (await clickIf(page, /^Vrai\b/)) {
          await settle(page, 300)
          await clickIf(page, /^Continuer/)
        } else if (await clickIf(page, /Révéler|Voir la réponse|^Valider/)) {
          await settle(page, 300)
          await clickIf(page, /^Bien/)
        } else if (!(await clickIf(page, /^Continuer/))) {
          await clickIf(page, /^Bien|^Su\b/)
        }
        await settle(page, 400)
      }
    },
  },
  { name: 'validate', path: `/cahier/${DEMO_IDS.cahier}/fiche/${DEMO_IDS.ficheWithPending}/valider` },
  { name: 'mindmap', path: `/carte/${DEMO_IDS.mindmap}`, viewportOnly: true },
  { name: 'stats', path: '/stats' },
  { name: 'settings', path: '/settings' },
  ...(dev ? [{ name: 'design', path: '/design' }] : []),
]

async function clickIf(page, re) {
  const btn = page.getByRole('button', { name: re }).first()
  if (await btn.count()) {
    await btn.click()
    await page.waitForTimeout(150)
    return true
  }
  return false
}

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
