#!/usr/bin/env node
// PC → mobile parity (Nuit 2, M0): loads every route at 1440 px (Chromium) and on
// an iPhone 14 (WebKit, 390 px) with the demo database, opens the « ⋯ » menus,
// tabs and <details>, and diffs the set of actions really usable on each: an
// action is a `data-action` (or, failing that, the accessible name) of a
// button / link / menu item that is rendered, visible, not disabled, and on
// mobile at least 44 px on its shortest side. Writes docs/mobile/parite.md and
// docs/mobile/parite.json. Exit 1 when a PC action has no mobile counterpart.
//
//   node scripts/parity.mjs [--only=dashboard,fiche]

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, devices, webkit } from '@playwright/test'
import { ROOT, seed, settle, startServer } from './lib/app.mjs'
import { PAGES } from './lib/pages.mjs'

const args = process.argv.slice(2)
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const only = flag('only')?.split(',')

/** PC-only actions that are deliberately different on mobile, with their equivalent (kept in the report). */
const EQUIVALENTS = JSON.parse(readFileSync(join(ROOT, 'scripts', 'lib', 'parity-equivalents.json'), 'utf8'))
/** Keys starting with ^ are regular expressions (content-named actions such as mind map nodes). */
function equivalent(name) {
  if (EQUIVALENTS[name]) return EQUIVALENTS[name]
  for (const [k, v] of Object.entries(EQUIVALENTS)) if (k.startsWith('^') && new RegExp(k).test(name)) return v
  return undefined
}

const MIN_TARGET = 44

/** Runs in the page: every actionable element with its state. */
const COLLECT = (minTarget) => {
  const slug = (s) =>
    (s ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/·.*$/, '')
      .replace(/\(.*?\)/g, '')
      .replace(/\d+/g, '')
      .replace(/[^a-z]+/g, '-')
      .replace(/^-|-$/g, '')
  const out = []
  const seen = new Set()
  const els = document.querySelectorAll('button, a[href], [role="button"], [role="menuitem"], [role="tab"], summary, input[type="checkbox"], input[type="radio"], select')
  for (const el of els) {
    const explicit = el.getAttribute('data-action')
    const label = el.getAttribute('aria-label') || el.getAttribute('title') || (el.tagName === 'SELECT' || el.tagName === 'INPUT' ? document.querySelector(`label[for="${el.id}"]`)?.textContent : null) || el.textContent
    const name = explicit || slug(label)
    if (!name) continue
    const key = `${name}`
    if (seen.has(key)) continue
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    const hidden = cs.display === 'none' || cs.visibility === 'hidden' || cs.pointerEvents === 'none' || r.width === 0 || r.height === 0 || el.closest('[aria-hidden="true"]') !== null
    const disabled = el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true'
    const offscreen = r.right <= 0 || r.left >= window.innerWidth
    const size = Math.round(Math.min(r.width, r.height))
    seen.add(key)
    out.push({ name, explicit: !!explicit, tag: el.tagName.toLowerCase(), hidden, disabled, offscreen, size, small: size < minTarget })
  }
  return out
}

async function collectAll(page, minTarget) {
  const found = new Map()
  const merge = (list) => {
    for (const a of list) {
      const prev = found.get(a.name)
      // Keep the best state seen (a menu item becomes visible once its menu is open).
      if (!prev || (prev.hidden && !a.hidden)) found.set(a.name, a)
    }
  }
  merge(await page.evaluate(COLLECT, minTarget))
  // Open every <details>, tab and « ⋯ » menu, collecting after each.
  await page.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)))
  await page.waitForTimeout(100)
  merge(await page.evaluate(COLLECT, minTarget))
  const openers = page.locator('[aria-haspopup="menu"], [data-action$="menu"], [aria-label="Plus d’actions"], [aria-label="Plus d\'actions"]')
  const n = await openers.count()
  for (let i = 0; i < n; i++) {
    const o = openers.nth(i)
    try {
      if (!(await o.isVisible())) continue
      await o.click({ timeout: 2000 })
      await page.waitForTimeout(150)
      merge(await page.evaluate(COLLECT, minTarget))
      await page.keyboard.press('Escape')
      await page.mouse.click(2, 2).catch(() => undefined)
      await page.waitForTimeout(100)
    } catch {
      // A menu that will not open is itself a finding: it stays absent from the set.
    }
  }
  const tabs = page.locator('[role="tab"]')
  const tn = await tabs.count()
  for (let i = 0; i < tn; i++) {
    try {
      await tabs.nth(i).click({ timeout: 1500 })
      await page.waitForTimeout(150)
      merge(await page.evaluate(COLLECT, minTarget))
    } catch {
      /* ignore */
    }
  }
  return found
}

const server = await startServer()
const pc = await chromium.launch()
const mobile = await webkit.launch()
const result = {}
try {
  const pcCtx = await pc.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'fr-FR' })
  const pcPage = await pcCtx.newPage()
  await seed(pcPage, server.url)
  const mCtx = await mobile.newContext({ ...devices['iPhone 14'], deviceScaleFactor: 1, locale: 'fr-FR' })
  const mPage = await mCtx.newPage()
  await seed(mPage, server.url)
  for (const p of PAGES) {
    if (only && !only.includes(p.name)) continue
    const per = {}
    for (const [label, page, minTarget] of [
      ['pc', pcPage, 0],
      ['mobile', mPage, MIN_TARGET],
    ]) {
      await page.goto(server.url + p.path, { waitUntil: 'networkidle' })
      await settle(page, 400)
      if (p.act) await p.act(page)
      per[label] = await collectAll(page, minTarget)
    }
    result[p.name] = per
    const pcNames = [...per.pc.values()].filter((a) => !a.hidden && !a.disabled).map((a) => a.name)
    const missing = pcNames.filter((n) => {
      const m = per.mobile.get(n)
      return (!m || m.hidden || m.disabled || m.offscreen) && !equivalent(n)
    })
    const small = [...per.mobile.values()].filter((a) => !a.hidden && !a.disabled && a.small && !equivalent(a.name)).map((a) => `${a.name} (${a.size}px)`)
    console.log(`${p.name.padEnd(13)} PC ${String(pcNames.length).padStart(3)} · mobile ${String([...per.mobile.values()].filter((a) => !a.hidden && !a.disabled).length).padStart(3)} · manquantes ${missing.length}${missing.length ? ': ' + missing.join(', ') : ''}${small.length ? ` · < 44px: ${small.join(', ')}` : ''}`)
  }
} finally {
  await pc.close()
  await mobile.close()
  await server.stop()
}

// ---- Report --------------------------------------------------------------------------
mkdirSync(join(ROOT, 'docs', 'mobile'), { recursive: true })
const lines = ['# Parité PC → mobile', '', `Généré par \`scripts/parity.mjs\` le ${new Date().toLocaleString('fr-FR')}. PC = Chromium 1440 px ; mobile = iPhone 14 WebKit 390 px. Une action compte comme couverte sur mobile si elle est rendue, visible, active et d’au moins 44 px de côté ; « équivalent » = choix délibéré documenté dans \`scripts/lib/parity-equivalents.json\`.`, '']
let totalPc = 0
let totalCovered = 0
let totalMissing = 0
const untagged = new Set()
const smallAll = []
for (const [route, per] of Object.entries(result)) {
  const names = [...new Set([...per.pc.keys(), ...per.mobile.keys()])].sort()
  lines.push(`## ${route}`, '', '| action | PC | mobile | note |', '|---|---|---|---|')
  for (const n of names) {
    const a = per.pc.get(n)
    const b = per.mobile.get(n)
    const onPc = !!a && !a.hidden && !a.disabled
    const onMobile = !!b && !b.hidden && !b.disabled && !b.offscreen
    if (a && !a.explicit) untagged.add(n)
    if (b && !b.explicit) untagged.add(n)
    let note = ''
    if (onPc) totalPc++
    if (onPc && onMobile) totalCovered++
    if (onPc && !onMobile) {
      if (equivalent(n)) {
        note = `équivalent : ${equivalent(n)}`
        totalCovered++
      } else {
        note = '**manquante**'
        totalMissing++
      }
    }
    if (onMobile && b.small) {
      note += `${note ? ' · ' : ''}cible ${b.size} px`
      if (!equivalent(n)) smallAll.push(`${route}/${n} (${b.size} px)`)
    }
    if (!onPc && onMobile) note = 'mobile seulement'
    lines.push(`| ${n} | ${onPc ? '✓' : a ? (a.disabled ? 'désactivée' : '–') : '–'} | ${onMobile ? '✓' : b ? (b.disabled ? 'désactivée' : '✗') : '✗'} | ${note} |`)
  }
  lines.push('')
}
lines.splice(3, 0, `**Actions PC : ${totalPc} · couvertes sur mobile : ${totalCovered} · manquantes : ${totalMissing} · cibles < 44 px sur mobile : ${smallAll.length} · sans \`data-action\` explicite : ${untagged.size}**`, '')
if (smallAll.length) lines.push('## Cibles trop petites sur mobile', '', ...smallAll.map((s) => `- ${s}`), '')
if (untagged.size) lines.push('## Éléments sans `data-action` (nommés par leur libellé)', '', ...[...untagged].sort().map((s) => `- ${s}`), '')
writeFileSync(join(ROOT, 'docs', 'mobile', 'parite.md'), lines.join('\n'))
writeFileSync(join(ROOT, 'docs', 'mobile', 'parite.json'), JSON.stringify(Object.fromEntries(Object.entries(result).map(([k, v]) => [k, { pc: [...v.pc.values()], mobile: [...v.mobile.values()] }])), null, 2))
console.log(`\nPC ${totalPc} · couvertes ${totalCovered} · manquantes ${totalMissing} · < 44 px ${smallAll.length} · sans data-action ${untagged.size} → docs/mobile/parite.md`)
process.exitCode = totalMissing ? 1 : 0
