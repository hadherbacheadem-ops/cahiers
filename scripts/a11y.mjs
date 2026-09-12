#!/usr/bin/env node
// axe-core on every main page, both themes, mobile and desktop widths.
// Fails (exit 1) on any serious / critical violation. Writes docs/perf/a11y-<étape>.json.
//
//   node scripts/a11y.mjs <étape>

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { DEMO_IDS, ROOT, THEMES, VIEWPORTS, launch, newPage, seed, setTheme, settle, startServer } from './lib/app.mjs'

const step = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'sans-nom'
const outDir = join(ROOT, 'docs', 'perf')
mkdirSync(outDir, { recursive: true })

const PAGES = {
  dashboard: '/',
  cahier: `/cahier/${DEMO_IDS.cahier}`,
  fiche: `/cahier/${DEMO_IDS.cahier}/fiche/${DEMO_IDS.fiche}`,
  train: '/train?mode=review&scope=all',
  validate: `/cahier/${DEMO_IDS.cahier}/fiche/${DEMO_IDS.ficheWithPending}/valider`,
  stats: '/stats',
  settings: '/settings',
}

const server = await startServer()
const browser = await launch()
const report = { step, at: new Date().toISOString(), results: [] }
let blocking = 0
try {
  for (const theme of THEMES) {
    for (const widthName of ['mobile', 'desktop']) {
      const { context, page } = await newPage(browser, VIEWPORTS[widthName])
      await seed(page, server.url, { theme })
      for (const [name, path] of Object.entries(PAGES)) {
        await page.goto(server.url + path, { waitUntil: 'networkidle' })
        await setTheme(page, theme)
        await settle(page, 300)
        const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
        const violations = axe.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 5).map((n) => n.target.join(' ')) }))
        const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
        blocking += serious.length
        report.results.push({ page: name, theme, width: widthName, violations })
        const tag = serious.length ? `✗ ${serious.length} grave(s)` : violations.length ? `~ ${violations.length} mineure(s)` : '✓'
        console.log(`${tag}  ${name} ${widthName} ${theme}${serious.length ? ' — ' + serious.map((v) => `${v.id} (${v.nodes[0]})`).join('; ') : ''}`)
      }
      await context.close()
    }
  }
} finally {
  await browser.close()
  await server.stop()
}
writeFileSync(join(outDir, `a11y-${step}.json`), JSON.stringify(report, null, 2))
console.log(`${blocking} violation(s) sérieuse(s)/critique(s) → docs/perf/a11y-${step}.json`)
process.exitCode = blocking ? 1 : 0
