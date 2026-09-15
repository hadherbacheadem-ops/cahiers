// Lists the elements that stick out of the viewport on the given pages and widths (Nuit 2 helper).
//   node scripts/overflow.mjs settings,fiche 320,390,768 [webkit]
import { chromium, webkit } from '@playwright/test'
import { seed, settle, startServer } from './lib/app.mjs'
import { PAGES } from './lib/pages.mjs'

const names = (process.argv[2] ?? 'settings,fiche').split(',')
const widths = (process.argv[3] ?? '320,390,768').split(',').map(Number)
const engine = process.argv[4] === 'webkit' ? webkit : chromium
const server = await startServer()
const browser = await engine.launch()
for (const w of widths) {
  const context = await browser.newContext({ viewport: { width: w, height: 700 }, deviceScaleFactor: 1, locale: 'fr-FR' })
  const page = await context.newPage()
  await seed(page, server.url)
  for (const name of names) {
    const p = PAGES.find((x) => x.name === name)
    await page.goto(server.url + p.path, { waitUntil: 'networkidle' })
    await settle(page, 600)
    if (p.act) await p.act(page)
    // open every details so folded sections count
    await page.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)))
    await settle(page, 300)
    const rows = await page.evaluate(() => {
      const iw = window.innerWidth
      const out = []
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect()
        const over = Math.round(r.right - iw)
        const left = Math.round(r.left)
        const cs = getComputedStyle(el)
        // Scroll containers whose content is wider than them do not widen the page; a visible one does.
        const inner = cs.overflowX === 'visible' && el.scrollWidth - el.clientWidth > 1 && el.clientWidth > 0 ? el.scrollWidth - el.clientWidth : 0
        if (over > 0 || left < 0 || inner > 0) {
          if (inner > 0) out.push({ over: inner, left, w: Math.round(r.width), tag: el.tagName.toLowerCase() + ' (scrollWidth)', cls: (el.getAttribute('class') ?? '').slice(0, 90), text: (el.textContent ?? '').trim().slice(0, 50) })
          if (over <= 0 && left >= 0) continue
          out.push({ over, left, w: Math.round(r.width), tag: el.tagName.toLowerCase(), cls: (el.getAttribute('class') ?? '').slice(0, 90), text: (el.textContent ?? '').trim().slice(0, 50) })
        }
      }
      return { iw, sw: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), out: out.slice(0, 25) }
    })
    console.log(`\n== ${name} @ ${w}: scrollWidth ${rows.sw} / innerWidth ${rows.iw}`)
    for (const r of rows.out) console.log(`  +${r.over} (w${r.w}, left ${r.left}) <${r.tag} class="${r.cls}"> ${JSON.stringify(r.text)}`)
  }
  await context.close()
}
await browser.close()
await server.stop()
