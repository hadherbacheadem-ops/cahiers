#!/usr/bin/env node
// Vérifie un paquet Anki `.apkg` produit par Cahiers (ou par genanki) : ouvre le
// zip, lit `collection.anki2` avec sql.js et contrôle la structure attendue par
// Anki desktop (schéma legacy v11). Usage :
//
//   node scripts/verify-apkg.mjs chemin/vers/export.apkg [--json]
//
// Sortie : une ligne par contrôle (OK / KO), code de retour 1 si un contrôle
// échoue. `--json` imprime le rapport en JSON (utilisé par le test vitest).

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const JSZip = require('jszip')
const initSqlJs = require('sql.js')

const MODEL_KEYS = ['id', 'name', 'type', 'flds', 'tmpls', 'css', 'mod', 'usn', 'sortf', 'did', 'latexPre', 'latexPost', 'req']
const DECK_KEYS = ['id', 'name', 'mod', 'usn', 'desc', 'conf', 'dyn', 'collapsed', 'extendNew', 'extendRev']
const TEMPLATE_KEYS = ['name', 'ord', 'qfmt', 'afmt', 'bqfmt', 'bafmt', 'did']
const FIELD_KEYS = ['name', 'ord', 'sticky', 'rtl', 'font', 'size', 'media']
const FIELD_SEP = '\x1f'

/** Anki `stripHTMLMedia` : balises retirées, entités décodées, blancs repliés. */
export function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Anki `fieldChecksum` : 8 premiers hexadécimaux de sha1(champ dépouillé) en entier. */
export function fieldChecksum(stripped) {
  return parseInt(createHash('sha1').update(stripped, 'utf8').digest('hex').slice(0, 8), 16)
}

/**
 * Vérifie les octets d'un `.apkg`. Retourne { ok, checks: [{name, ok, detail}], summary }.
 * @param {Uint8Array} bytes
 * @param {{ locateFile?: (f: string) => string }} [opts]
 */
export async function verifyApkg(bytes, opts = {}) {
  const checks = []
  const check = (name, ok, detail = '') => {
    checks.push({ name, ok: Boolean(ok), detail })
    return Boolean(ok)
  }
  const summary = { notes: 0, cards: 0, models: 0, decks: 0 }

  const zip = await JSZip.loadAsync(bytes)
  const collection = zip.file('collection.anki2')
  if (!check('zip contient collection.anki2', collection, Object.keys(zip.files).join(', '))) {
    return { ok: false, checks, summary }
  }
  const mediaEntry = zip.file('media')
  if (check('zip contient media', mediaEntry)) {
    const mediaText = await mediaEntry.async('string')
    let media
    try {
      media = JSON.parse(mediaText)
    } catch {
      media = undefined
    }
    check('media est un objet JSON ({} si vide)', media && typeof media === 'object' && !Array.isArray(media), mediaText.slice(0, 80))
    if (media && typeof media === 'object') {
      for (const [idx, name] of Object.entries(media)) {
        check(`fichier média ${idx} (${name}) présent dans le zip`, zip.file(String(idx)))
      }
    }
  }

  const locateFile = opts.locateFile ?? ((f) => fileURLToPath(new URL(`../node_modules/sql.js/dist/${f}`, import.meta.url)))
  const SQL = await initSqlJs({ locateFile })
  const db = new SQL.Database(await collection.async('uint8array'))
  try {
    const one = (sql) => {
      const res = db.exec(sql)
      return res[0]?.values ?? []
    }
    const rows = (sql) => {
      const res = db.exec(sql)[0]
      if (!res) return []
      return res.values.map((v) => Object.fromEntries(res.columns.map((c, i) => [c, v[i]])))
    }

    // ---- col ---------------------------------------------------------------
    const col = rows('SELECT * FROM col')
    check('table col : un seul enregistrement', col.length === 1, `${col.length} ligne(s)`)
    const c = col[0] ?? {}
    check('col.ver = 11 (schéma legacy)', c.ver === 11, `ver=${c.ver}`)
    check('col.crt > 0', Number(c.crt) > 0)

    let models = {}
    let decks = {}
    let conf = {}
    let dconf = {}
    try {
      models = JSON.parse(c.models)
      check('col.models JSON parsable', true)
    } catch (e) {
      check('col.models JSON parsable', false, String(e))
    }
    try {
      decks = JSON.parse(c.decks)
      check('col.decks JSON parsable', true)
    } catch (e) {
      check('col.decks JSON parsable', false, String(e))
    }
    try {
      conf = JSON.parse(c.conf)
      check('col.conf JSON parsable', true)
    } catch (e) {
      check('col.conf JSON parsable', false, String(e))
    }
    try {
      dconf = JSON.parse(c.dconf)
      check('col.dconf JSON parsable avec la configuration 1', dconf && dconf['1'])
    } catch (e) {
      check('col.dconf JSON parsable avec la configuration 1', false, String(e))
    }
    check('col.tags JSON parsable', (() => { try { JSON.parse(c.tags); return true } catch { return false } })())
    check('col.conf.curModel désigne un modèle existant', conf && String(conf.curModel) in models, `curModel=${conf?.curModel}`)

    summary.models = Object.keys(models).length
    summary.decks = Object.keys(decks).length
    check('au moins un modèle', summary.models > 0)
    for (const [key, m] of Object.entries(models)) {
      const missing = MODEL_KEYS.filter((k) => !(k in m))
      check(`modèle ${key} (${m.name}) : clés Anki présentes`, missing.length === 0, missing.length ? `manque ${missing.join(', ')}` : '')
      check(`modèle ${key} : clé JSON = id`, String(m.id) === key, `id=${m.id}`)
      check(`modèle ${key} : type 0 (standard) ou 1 (cloze)`, m.type === 0 || m.type === 1, `type=${m.type}`)
      check(`modèle ${key} : au moins un champ et un template`, Array.isArray(m.flds) && m.flds.length > 0 && Array.isArray(m.tmpls) && m.tmpls.length > 0)
      ;(m.flds ?? []).forEach((f, i) => {
        const miss = FIELD_KEYS.filter((k) => !(k in f))
        check(`modèle ${key} champ ${i} (${f.name}) : clés et ord`, miss.length === 0 && f.ord === i, miss.length ? `manque ${miss.join(', ')}` : `ord=${f.ord}`)
      })
      ;(m.tmpls ?? []).forEach((t, i) => {
        const miss = TEMPLATE_KEYS.filter((k) => !(k in t))
        check(`modèle ${key} template ${i} (${t.name}) : clés et ord`, miss.length === 0 && t.ord === i, miss.length ? `manque ${miss.join(', ')}` : `ord=${t.ord}`)
      })
      check(`modèle ${key} : sortf désigne un champ`, Number.isInteger(m.sortf) && m.sortf >= 0 && m.sortf < (m.flds?.length ?? 0))
      if (m.type === 1) {
        check(`modèle cloze ${key} : le template utilise {{cloze:…}}`, (m.tmpls ?? []).every((t) => /\{\{cloze:/.test(t.qfmt)))
      }
    }

    check('deck 1 (Default) présent', decks['1'])
    for (const [key, d] of Object.entries(decks)) {
      const missing = DECK_KEYS.filter((k) => !(k in d))
      check(`deck ${key} (${d.name}) : clés Anki présentes`, missing.length === 0, missing.length ? `manque ${missing.join(', ')}` : '')
      check(`deck ${key} : clé JSON = id`, String(d.id) === key, `id=${d.id}`)
      check(`deck ${key} : conf désigne une configuration existante`, d.dyn === 1 || (dconf && String(d.conf) in dconf), `conf=${d.conf}`)
      // Every ancestor of `A::B::C` must exist, otherwise Anki shows an orphan deck.
      const parts = String(d.name).split('::')
      for (let i = 1; i < parts.length; i++) {
        const parent = parts.slice(0, i).join('::')
        check(`deck ${key} : parent « ${parent} » présent`, Object.values(decks).some((x) => x.name === parent))
      }
    }

    // ---- notes -------------------------------------------------------------
    const notes = rows('SELECT id, guid, mid, usn, tags, flds, sfld, csum FROM notes')
    summary.notes = notes.length
    check('au moins une note', notes.length > 0)
    const guids = new Set()
    for (const n of notes) {
      const model = models[String(n.mid)]
      if (!check(`note ${n.id} : mid connu`, model, `mid=${n.mid}`)) continue
      const fields = String(n.flds).split(FIELD_SEP)
      check(`note ${n.id} : ${model.flds.length} champs séparés par \\x1f`, fields.length === model.flds.length, `${fields.length} champ(s)`)
      const sortField = fields[model.sortf] ?? ''
      const stripped = stripHtml(sortField)
      check(`note ${n.id} : sfld renseigné`, String(n.sfld).trim().length > 0, `sfld=« ${String(n.sfld).slice(0, 40)} »`)
      check(`note ${n.id} : sfld = champ de tri dépouillé`, String(n.sfld) === stripped, `attendu « ${stripped.slice(0, 40)} »`)
      check(`note ${n.id} : csum = sha1 du champ de tri dépouillé`, Number(n.csum) === fieldChecksum(stripped), `csum=${n.csum} attendu ${fieldChecksum(stripped)}`)
      check(`note ${n.id} : guid non vide et unique`, n.guid && !guids.has(n.guid))
      guids.add(n.guid)
      check(`note ${n.id} : tags entourés d'espaces`, /^ .* $/.test(String(n.tags)) || String(n.tags) === '', `tags=« ${n.tags} »`)
      if (model.type === 1) {
        check(`note ${n.id} : cloze avec au moins un {{cN::…}}`, /\{\{c\d+::/.test(fields[0]))
      }
    }

    // ---- cards -------------------------------------------------------------
    const cards = rows('SELECT id, nid, did, ord, type, queue, due FROM cards')
    summary.cards = cards.length
    check('au moins une carte', cards.length > 0)
    const noteById = new Map(notes.map((n) => [n.id, n]))
    const cardsPerNote = new Map()
    for (const card of cards) {
      const note = noteById.get(card.nid)
      if (!check(`carte ${card.id} : note existante`, note, `nid=${card.nid}`)) continue
      const model = models[String(note.mid)]
      if (model.type === 1) {
        const ords = new Set([...String(note.flds).matchAll(/\{\{c(\d+)::/g)].map((m) => Number(m[1]) - 1))
        check(`carte ${card.id} : ord ${card.ord} correspond à un cN de la note cloze`, ords.has(card.ord), `ords=${[...ords].join(',')}`)
      } else {
        check(`carte ${card.id} : ord ${card.ord} correspond à un template`, card.ord >= 0 && card.ord < model.tmpls.length)
      }
      check(`carte ${card.id} : deck existant`, String(card.did) in decks, `did=${card.did}`)
      check(`carte ${card.id} : nouvelle (type 0, queue 0 ou -1)`, card.type === 0 && (card.queue === 0 || card.queue === -1))
      cardsPerNote.set(card.nid, (cardsPerNote.get(card.nid) ?? 0) + 1)
    }
    for (const n of notes) {
      check(`note ${n.id} : au moins une carte`, (cardsPerNote.get(n.id) ?? 0) > 0)
    }
  } finally {
    db.close()
  }

  return { ok: checks.every((c) => c.ok), checks, summary }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === (await import('node:path')).resolve(process.argv[1])
if (isMain) {
  const args = process.argv.slice(2)
  const json = args.includes('--json')
  const file = args.find((a) => !a.startsWith('--'))
  if (!file) {
    console.error('Usage : node scripts/verify-apkg.mjs <fichier.apkg> [--json]')
    process.exitCode = 2
  } else {
    await run(file, json, args.includes('--verbose'))
  }
}

async function run(file, json, verbose) {
  const bytes = new Uint8Array(await readFile(file))
  const report = await verifyApkg(bytes)
  if (json) {
    console.log(JSON.stringify(report))
  } else {
    for (const c of report.checks) {
      if (!c.ok || verbose) console.log(`${c.ok ? 'OK ' : 'KO '} ${c.name}${c.detail ? ` — ${c.detail}` : ''}`)
    }
    const failed = report.checks.filter((c) => !c.ok).length
    console.log(`${report.ok ? 'OK' : 'KO'} : ${report.checks.length} contrôles, ${failed} échec(s) ; ${report.summary.notes} notes, ${report.summary.cards} cartes, ${report.summary.models} modèles, ${report.summary.decks} decks`)
  }
  // Not process.exit(): sql.js still owns handles at this point and Node on
  // Windows aborts with a libuv assertion when exit() races their closing.
  process.exitCode = report.ok ? 0 : 1
}
