#!/usr/bin/env node
// Compose des images « avant | après » côte à côte à partir de deux dossiers de
// captures, sans bibliothèque d'image : une page HTML avec les deux <img> est
// rendue par Chromium (Playwright) puis capturée.
//
//   node scripts/avant-apres.mjs <avant> <après> <page>[,<page>…] [--viewport=mobile,desktop] [--theme=dark]
//   ex. node scripts/avant-apres.mjs 00-avant fin dashboard,train,chapitre,settings
//
// Sortie : docs/screenshots/avant-apres/<page>-<viewport>-<theme>.png

import { mkdir, readFile, access } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'
import { ROOT } from './lib/app.mjs'

const args = process.argv.slice(2)
const positional = args.filter((a) => !a.startsWith('--'))
const opt = (name, def) => (args.find((a) => a.startsWith(`--${name}=`)) ?? `--${name}=${def}`).split('=')[1]
const [before, after, pagesArg] = positional
if (!before || !after || !pagesArg) {
  console.error('usage : node scripts/avant-apres.mjs <avant> <après> <page,page,…> [--viewport=mobile,desktop] [--theme=dark]')
  process.exit(1)
}
const pages = pagesArg.split(',')
const viewports = opt('viewport', 'mobile,desktop').split(',')
const themes = opt('theme', 'dark').split(',')
const outDir = resolve(ROOT, 'docs/screenshots/avant-apres')
await mkdir(outDir, { recursive: true })

const exists = (p) =>
  access(p).then(
    () => true,
    () => false,
  )
const dataUrl = async (p) => `data:image/png;base64,${(await readFile(p)).toString('base64')}`

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })
try {
  for (const name of pages) {
    for (const vp of viewports) {
      for (const theme of themes) {
        const file = `${name}-${vp}-${theme}.png`
        const a = resolve(ROOT, 'docs/screenshots', before, file)
        const b = resolve(ROOT, 'docs/screenshots', after, file)
        if (!(await exists(a)) || !(await exists(b))) {
          console.warn(`manque ${file} dans ${before} ou ${after}`)
          continue
        }
        // Each column is scaled to a fixed width; the page grows with the taller image.
        const colWidth = vp === 'mobile' ? 390 : 720
        const html = `<!doctype html><meta charset="utf-8"><style>
          body{margin:0;background:#1a1a1a;font:600 14px system-ui;color:#ddd}
          .wrap{display:flex;gap:16px;padding:16px;width:max-content}
          figure{margin:0;display:flex;flex-direction:column;gap:8px}
          figcaption{text-transform:uppercase;letter-spacing:.08em;font-size:12px}
          img{width:${colWidth}px;display:block;border-radius:6px;box-shadow:0 2px 12px rgba(0,0,0,.5)}
        </style><div class="wrap">
          <figure><figcaption>Avant · ${before}</figcaption><img src="${await dataUrl(a)}"></figure>
          <figure><figcaption>Après · ${after}</figcaption><img src="${await dataUrl(b)}"></figure>
        </div>`
        await page.setContent(html)
        await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0))
        const wrap = await page.$('.wrap')
        await wrap.screenshot({ path: resolve(outDir, file) })
        console.log(`avant-apres/${file}`)
      }
    }
  }
} finally {
  await browser.close()
}
