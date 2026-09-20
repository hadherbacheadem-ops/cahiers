// Anki .apkg exporter. Builds a real Anki package in memory: a zip holding
// `collection.anki2` (SQLite, legacy schema version 11 — the one genanki writes,
// readable by Anki desktop 2.1+, 23.x and 24.x) and an empty `media` map.
//
// sql.js needs its `sql-wasm.wasm`. Pass `locateSqlWasm`:
//   - browser (Vite): `import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url'`
//     then `buildApkg({ ..., locateSqlWasm: () => sqlWasmUrl })`
//   - Node / vitest: `fileURLToPath(new URL('../../node_modules/sql.js/dist/sql-wasm.wasm', import.meta.url))`
// The default `(f) => f` lets sql.js fetch the file relative to the page, which
// only works in dev when the wasm happens to be served at the root.

import initSqlJs from 'sql.js'
import { reactionLabel } from './reactionTypes'
import JSZip from 'jszip'
import { blankMathFlags, parseCloze } from './cloze'
import type { Exercise, ExerciseData } from '../types'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ApkgInput {
  /** Default deck, e.g. "Cahiers::Physique::Gauss". `::` nests decks. */
  deckName: string
  /** Only flashcard / cloze / mcq / truefalse / match / order / demonstration / rappel_libre are exported. */
  exercises: Exercise[]
  /** Optional per-exercise deck name (e.g. `Cahiers::<cahier>::<fiche>`); falls back on `deckName`. */
  deckFor?: (e: Exercise) => string
  /** Passed to sql.js `locateFile`; must resolve `sql-wasm.wasm` (see the header comment). */
  locateSqlWasm?: (file: string) => string
}

export interface ApkgResult {
  blob: Blob
  notes: number
  cards: number
  skipped: number
}

/** Stable notetype ids (must never change: Anki matches notetypes on import by id). */
export const MODEL_ID_BASIC = 1607392319
export const MODEL_ID_CLOZE = 1607392320

export const MODEL_NAME_BASIC = 'Cahiers Basic'
export const MODEL_NAME_CLOZE = 'Cahiers Cloze'

const FIELD_SEP = '\x1f'

export async function buildApkg(input: ApkgInput): Promise<ApkgResult> {
  const locateFile = input.locateSqlWasm ?? ((f: string) => f)
  const SQL = await initSqlJs({ locateFile })
  const db = new SQL.Database()
  try {
    // ---- Collect notes -----------------------------------------------------
    const specs: NoteSpec[] = []
    let skipped = 0
    for (const e of input.exercises) {
      const deck = input.deckFor?.(e) ?? input.deckName
      const notes = notesFor(e, deck)
      if (notes.length === 0) skipped++
      specs.push(...notes)
    }

    // ---- Decks (with every ancestor, so `A::B::C` imports cleanly) ----------
    const deckNames = new Set<string>([input.deckName])
    for (const s of specs) deckNames.add(s.deck)
    const decks: Record<string, unknown> = { '1': deckJson(1, 'Default') }
    for (const name of deckNames) {
      const parts = name.split('::').map((p) => p.trim()).filter(Boolean)
      for (let i = 1; i <= parts.length; i++) {
        const partial = parts.slice(0, i).join('::')
        const id = deckId(partial)
        decks[String(id)] = deckJson(id, partial)
      }
    }

    // ---- Collection row ----------------------------------------------------
    const nowMs = Date.now()
    const nowS = Math.floor(nowMs / 1000)
    const crt = todayAt4amSeconds()
    const models = {
      [String(MODEL_ID_BASIC)]: basicModel(nowS),
      [String(MODEL_ID_CLOZE)]: clozeModel(nowS),
    }

    db.run(SCHEMA)

    // ---- Notes and cards ---------------------------------------------------
    let noteCount = 0
    let cardCount = 0
    let due = 1
    const noteStmt = db.prepare('INSERT INTO notes VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    const cardStmt = db.prepare('INSERT INTO cards VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    try {
      for (let i = 0; i < specs.length; i++) {
        const s = specs[i]
        const nid = nowMs + i
        const guid = await guidFor(s.guidKey)
        const sfld = stripHtml(s.fields[0])
        const csum = await fieldChecksum(sfld)
        const tags = normaliseTags(s.tags)
        noteStmt.run([nid, guid, s.mid, nowS, -1, tags, s.fields.join(FIELD_SEP), sfld, csum, 0, ''])
        noteCount++
        const did = deckId(normaliseDeckName(s.deck))
        for (const ord of s.cardOrds) {
          const cid = nowMs + 1_000_000 + cardCount
          // id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags, data
          cardStmt.run([cid, nid, did, ord, nowS, -1, 0, 0, due++, 0, 0, 0, 0, 0, 0, 0, 0, ''])
          cardCount++
        }
      }
    } finally {
      noteStmt.free()
      cardStmt.free()
    }

    const conf = {
      activeDecks: [1],
      addToCur: true,
      collapseTime: 1200,
      curDeck: 1,
      curModel: String(MODEL_ID_BASIC),
      dueCounts: true,
      estTimes: true,
      newBury: true,
      newSpread: 0,
      nextPos: due,
      sortBackwards: false,
      sortType: 'noteFld',
      timeLim: 0,
    }
    db.run('INSERT INTO col VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', [
      1,
      crt,
      nowMs,
      nowMs,
      11,
      0,
      0,
      0,
      JSON.stringify(conf),
      JSON.stringify(models),
      JSON.stringify(decks),
      JSON.stringify(DCONF),
      '{}',
    ])

    // ---- Zip ---------------------------------------------------------------
    const bytes = db.export()
    const zip = new JSZip()
    zip.file('collection.anki2', bytes)
    zip.file('media', '{}')
    const out = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
    const blob = new Blob([out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer], { type: 'application/apkg' })
    return { blob, notes: noteCount, cards: cardCount, skipped }
  } finally {
    db.close()
  }
}

// ---------------------------------------------------------------------------
// Text conversion (exported for tests)
// ---------------------------------------------------------------------------

/**
 * Light markdown → Anki HTML: `$…$` → `\(…\)`, `$$…$$` → `\[…\]`, `**x**` → <b>,
 * `*x*` → <i>, newlines → <br>. `<` and `&` are escaped everywhere (MathJax
 * reads the DOM text, so `\(a &lt; b\)` renders fine); `\ce{…}` is left alone.
 */
export function toAnkiHtml(markdownish: string): string {
  const math: string[] = []
  // Protect math first so `*` and `_` inside formulas are never touched.
  const protectedText = markdownish.replace(/\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g, (_m, block: string | undefined, inline: string | undefined) => {
    const idx = math.length
    if (block !== undefined) math.push(`\\[${escapeHtml(block)}\\]`)
    else math.push(`\\(${escapeHtml(inline ?? '')}\\)`)
    return `\uE000${idx}\uE001`
  })
  let html = escapeHtml(protectedText)
  html = html.replace(/\*\*([^*\n]+?)\*\*/g, '<b>$1</b>')
  html = html.replace(/(^|[^*\w])\*([^*\n]+?)\*(?!\w)/g, '$1<i>$2</i>')
  html = html.replace(/\r?\n/g, '<br>')
  return html.replace(/\uE000(\d+)\uE001/g, (_m, i: string) => math[Number(i)])
}

/**
 * Cahiers cloze → Anki cloze: `{{a|b}}` → `{{c1::a}}` (first variant only),
 * numbered c1, c2… in order. `{{$x$}}` → `{{c1::\(x\)}}`. A blank sitting inside
 * `$…$` is emitted raw so it stays inside the formula's `\(…\)`.
 */
export function clozeToAnki(text: string): string {
  const mathFlags = blankMathFlags(text)
  const segments = parseCloze(text)
  const blanks: string[] = []
  let protectedText = ''
  for (const seg of segments) {
    if (seg.kind === 'text') {
      protectedText += seg.value
    } else {
      const answer = seg.answers[0] ?? ''
      // Inside a formula the blank is already math: no delimiters, only escaping.
      const inner = mathFlags[seg.index] ? escapeHtml(answer) : toAnkiHtml(answer)
      blanks.push(`{{c${seg.index + 1}::${inner}}}`)
      protectedText += `\uE002${seg.index}\uE003`
    }
  }
  const html = toAnkiHtml(protectedText)
  return html.replace(/\uE002(\d+)\uE003/g, (_m, i: string) => blanks[Number(i)])
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
}

/** Anki's `stripHTMLMedia` equivalent, used for the sort field and the checksum. */
function stripHtml(html: string): string {
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

// ---------------------------------------------------------------------------
// Exercise → notes
// ---------------------------------------------------------------------------

interface NoteSpec {
  mid: number
  fields: string[]
  tags: string[]
  deck: string
  /** Template ordinals to create a card for (Basic: [0]; Cloze: one per cloze number). */
  cardOrds: number[]
  /** Deterministic source of the GUID (exercise id, plus pair index for match). */
  guidKey: string
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

function basic(e: Exercise, deck: string, front: string, back: string, extra = '', guidKey = e.id): NoteSpec {
  return { mid: MODEL_ID_BASIC, fields: [front, back, extra], tags: e.tags, deck, cardOrds: [0], guidKey }
}

function notesFor(e: Exercise, deck: string): NoteSpec[] {
  const d: ExerciseData = e.data
  switch (d.type) {
    case 'flashcard':
      return [basic(e, deck, toAnkiHtml(d.question), toAnkiHtml(d.answer), d.hint ? toAnkiHtml(d.hint) : '')]

    case 'cloze': {
      const text = clozeToAnki(d.text)
      const ords = [...new Set([...text.matchAll(/\{\{c(\d+)::/g)].map((m) => Number(m[1]) - 1))].sort((a, b) => a - b)
      if (ords.length === 0) return []
      return [{ mid: MODEL_ID_CLOZE, fields: [text, ''], tags: e.tags, deck, cardOrds: ords, guidKey: e.id }]
    }

    case 'mcq': {
      const choices = d.choices.map((c, i) => `${LETTERS[i] ?? i + 1}. ${toAnkiHtml(c)}`)
      const front = `${toAnkiHtml(d.question)}<br><br>${choices.join('<br>')}`
      const back = d.correct
        .filter((i) => i >= 0 && i < d.choices.length)
        .map((i) => choices[i])
        .join('<br>')
      const extraParts: string[] = []
      if (d.explanation) extraParts.push(toAnkiHtml(d.explanation))
      d.distractorReasons?.forEach((r, i) => {
        if (r && r.trim()) extraParts.push(`${LETTERS[i] ?? i + 1} : ${toAnkiHtml(r)}`)
      })
      return [basic(e, deck, front, back, extraParts.join('<br>'))]
    }

    case 'truefalse': {
      const front = `${toAnkiHtml(d.statement)}<br><br>Vrai ou faux ?`
      let back = d.answer ? 'Vrai' : 'Faux'
      if (!d.answer && d.correctedStatement) back += `<br>${toAnkiHtml(d.correctedStatement)}`
      return [basic(e, deck, front, back, d.explanation ? toAnkiHtml(d.explanation) : '')]
    }

    case 'match': {
      const extra = d.instruction ? toAnkiHtml(d.instruction) : ''
      return d.pairs.map((p, i) => basic(e, deck, toAnkiHtml(p.left), toAnkiHtml(p.right), extra, `${e.id}::${i}`))
    }

    case 'order': {
      // Items are stored in the correct order: showing them as-is would give the
      // answer away, so the front lists them alphabetically.
      const shown = [...d.items].sort((a, b) => a.localeCompare(b, 'fr'))
      const front = `${toAnkiHtml(d.instruction)}<br><br>Remets dans l'ordre : ${shown.map(toAnkiHtml).join(' · ')}`
      const back = d.items.map((it, i) => `${i + 1}. ${toAnkiHtml(it)}`).join('<br>')
      return [basic(e, deck, front, back)]
    }

    case 'demonstration': {
      const front = `${toAnkiHtml(d.title)}<br>${toAnkiHtml(d.statement)}`
      const back = d.steps
        .map((s, i) => {
          const why = s.why ? ` <span class="extra">— ${toAnkiHtml(s.why)}</span>` : ''
          return `${i + 1}. ${toAnkiHtml(s.text)}${why}`
        })
        .join('<br>')
      return [basic(e, deck, front, back)]
    }

    case 'mecanisme': {
      const front = `${toAnkiHtml(d.title)}<br>${toAnkiHtml(d.statement)}<br><br>Type de réaction de chaque étape :`
      const back = d.steps.map((s, i) => `${i + 1}. ${toAnkiHtml(s.text)} → <b>${reactionLabel(s.answer)}</b>${s.explanation ? ` <span class="extra">— ${toAnkiHtml(s.explanation)}</span>` : ''}`).join('<br>')
      return [basic(e, deck, front, back)]
    }

    case 'rappel_libre': {
      const front = `Rappel libre : ${toAnkiHtml(d.topic)}`
      const back = `<ul>${d.checklist.map((c) => `<li>${toAnkiHtml(c.text)}</li>`).join('')}</ul>`
      return [basic(e, deck, front, back)]
    }

    default:
      return []
  }
}

/** Anki stores tags as ` a b ` (space-padded); spaces inside a tag become `_`. */
function normaliseTags(tags: string[]): string {
  const set = new Set<string>()
  for (const t of [...tags, 'cahiers']) {
    const clean = t.trim().replace(/\s+/g, '_')
    if (clean) set.add(clean)
  }
  return ` ${[...set].join(' ')} `
}

function normaliseDeckName(name: string): string {
  return name
    .split('::')
    .map((p) => p.trim())
    .filter(Boolean)
    .join('::')
}

// ---------------------------------------------------------------------------
// Ids, GUIDs and checksums
// ---------------------------------------------------------------------------

/** 32-bit FNV-1a of the deck name, kept away from 0 and 1 (the Default deck). */
export function deckId(name: string): number {
  let h = 0x811c9dc5
  for (const byte of new TextEncoder().encode(normaliseDeckName(name))) {
    h ^= byte
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h < 2 ? h + 2 : h
}

const BASE91 = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%&()*+,-./:;<=>?@[]^_`{|}~'

/**
 * Deterministic GUID, genanki's `guid_for` scheme: base91 of the first 64 bits
 * of sha256(key). genanki hashes the note's fields joined by `__`; we hash the
 * exercise id so that editing an exercise keeps its Anki note on re-import.
 */
export async function guidFor(key: string): Promise<string> {
  const hex = await sha256Hex(key)
  let n = BigInt('0x' + hex.slice(0, 16))
  let out = ''
  while (n > 0n) {
    out = BASE91[Number(n % 91n)] + out
    n /= 91n
  }
  return out || 'a'
}

/** Anki `fieldChecksum`: first 8 hex digits of sha1(stripped sort field) as an integer. */
export async function fieldChecksum(strippedField: string): Promise<number> {
  const hex = await sha1Hex(strippedField)
  return parseInt(hex.slice(0, 8), 16)
}

/** sha1 hex of the UTF-8 text, via WebCrypto when available, else the pure-JS fallback. */
export async function sha1Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const subtle = globalThis.crypto?.subtle
  if (subtle) {
    try {
      const buf = await subtle.digest('SHA-1', bytes)
      return toHex(new Uint8Array(buf))
    } catch {
      // Fall through (e.g. SHA-1 disabled by policy).
    }
  }
  return sha1HexSync(text)
}

/** sha256 hex of the UTF-8 text, via WebCrypto when available, else the pure-JS fallback. */
export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const subtle = globalThis.crypto?.subtle
  if (subtle) {
    try {
      const buf = await subtle.digest('SHA-256', bytes)
      return toHex(new Uint8Array(buf))
    } catch {
      // Fall through (insecure context, e.g. the PWA opened from file://).
    }
  }
  return sha256HexSync(text)
}

const K256 = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]

/** Pure-JS sha256 (FIPS 180-4), used when `crypto.subtle` is unavailable. */
export function sha256HexSync(text: string): string {
  const msg = new TextEncoder().encode(text)
  const ml = msg.length
  const total = Math.ceil((ml + 9) / 64) * 64
  const padded = new Uint8Array(total)
  padded.set(msg)
  padded[ml] = 0x80
  const dv = new DataView(padded.buffer)
  const bits = ml * 8
  dv.setUint32(total - 8, Math.floor(bits / 0x100000000))
  dv.setUint32(total - 4, bits >>> 0)

  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]
  const w = new Uint32Array(64)
  const rotr = (x: number, n: number) => ((x >>> n) | (x << (32 - n))) >>> 0

  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4)
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
    }
    let [a, b, c, d, e, f, g, hh] = h
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const t1 = (hh + S1 + ch + K256[i] + w[i]) >>> 0
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const t2 = (S0 + maj) >>> 0
      hh = g
      g = f
      f = e
      e = (d + t1) >>> 0
      d = c
      c = b
      b = a
      a = (t1 + t2) >>> 0
    }
    h[0] = (h[0] + a) >>> 0
    h[1] = (h[1] + b) >>> 0
    h[2] = (h[2] + c) >>> 0
    h[3] = (h[3] + d) >>> 0
    h[4] = (h[4] + e) >>> 0
    h[5] = (h[5] + f) >>> 0
    h[6] = (h[6] + g) >>> 0
    h[7] = (h[7] + hh) >>> 0
  }
  const out = new Uint8Array(32)
  const odv = new DataView(out.buffer)
  h.forEach((v, i) => odv.setUint32(i * 4, v))
  return toHex(out)
}

/** Pure-JS sha1 (RFC 3174), used when `crypto.subtle` is unavailable. */
export function sha1HexSync(text: string): string {
  const msg = new TextEncoder().encode(text)
  const ml = msg.length
  const total = Math.ceil((ml + 9) / 64) * 64
  const padded = new Uint8Array(total)
  padded.set(msg)
  padded[ml] = 0x80
  const dv = new DataView(padded.buffer)
  const bits = ml * 8
  dv.setUint32(total - 8, Math.floor(bits / 0x100000000))
  dv.setUint32(total - 4, bits >>> 0)

  let h0 = 0x67452301
  let h1 = 0xefcdab89
  let h2 = 0x98badcfe
  let h3 = 0x10325476
  let h4 = 0xc3d2e1f0
  const w = new Uint32Array(80)
  const rotl = (x: number, n: number) => ((x << n) | (x >>> (32 - n))) >>> 0

  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4)
    for (let i = 16; i < 80; i++) w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1)
    let a = h0
    let b = h1
    let c = h2
    let d = h3
    let e = h4
    for (let i = 0; i < 80; i++) {
      let f: number
      let k: number
      if (i < 20) {
        f = (b & c) | (~b & d)
        k = 0x5a827999
      } else if (i < 40) {
        f = b ^ c ^ d
        k = 0x6ed9eba1
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d)
        k = 0x8f1bbcdc
      } else {
        f = b ^ c ^ d
        k = 0xca62c1d6
      }
      const temp = (rotl(a, 5) + (f >>> 0) + e + k + w[i]) >>> 0
      e = d
      d = c
      c = rotl(b, 30)
      b = a
      a = temp
    }
    h0 = (h0 + a) >>> 0
    h1 = (h1 + b) >>> 0
    h2 = (h2 + c) >>> 0
    h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0
  }
  const out = new Uint8Array(20)
  const odv = new DataView(out.buffer)
  odv.setUint32(0, h0)
  odv.setUint32(4, h1)
  odv.setUint32(8, h2)
  odv.setUint32(12, h3)
  odv.setUint32(16, h4)
  return toHex(out)
}

function toHex(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += b.toString(16).padStart(2, '0')
  return s
}

function todayAt4amSeconds(): number {
  const d = new Date()
  d.setHours(4, 0, 0, 0)
  return Math.floor(d.getTime() / 1000)
}

// ---------------------------------------------------------------------------
// Anki JSON blobs (col.models / col.decks / col.dconf)
// ---------------------------------------------------------------------------

const LATEX_PRE =
  '\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n'
const LATEX_POST = '\\end{document}'

const CSS = '.card { font-family: arial; font-size: 20px; text-align: center; } .extra { color: #666; font-size: 15px }'

function field(name: string, ord: number) {
  return { name, ord, sticky: false, rtl: false, font: 'Arial', size: 20, media: [] as string[] }
}

function template(name: string, ord: number, qfmt: string, afmt: string) {
  // `bfont` / `bsize` are what genanki writes too (browser font, unused by us).
  return { name, ord, qfmt, afmt, bqfmt: '', bafmt: '', did: null as number | null, bfont: '', bsize: 0 }
}

function basicModel(mod: number) {
  return {
    // genanki serialises the model id as a string; Anki accepts both.
    id: String(MODEL_ID_BASIC),
    name: MODEL_NAME_BASIC,
    type: 0,
    mod,
    usn: -1,
    sortf: 0,
    did: 1,
    tmpls: [template('Carte 1', 0, '{{Front}}', '{{FrontSide}}<hr id=answer>{{Back}}<br><span class="extra">{{Extra}}</span>')],
    flds: [field('Front', 0), field('Back', 1), field('Extra', 2)],
    css: CSS,
    latexPre: LATEX_PRE,
    latexPost: LATEX_POST,
    latexsvg: false,
    req: [[0, 'any', [0]]],
    tags: [],
    vers: [],
  }
}

function clozeModel(mod: number) {
  return {
    id: String(MODEL_ID_CLOZE),
    name: MODEL_NAME_CLOZE,
    type: 1,
    mod,
    usn: -1,
    sortf: 0,
    did: 1,
    tmpls: [template('Cloze', 0, '{{cloze:Text}}', '{{cloze:Text}}<br><span class="extra">{{Extra}}</span>')],
    flds: [field('Text', 0), field('Extra', 1)],
    css: CSS + ' .cloze { font-weight: bold; color: blue; }',
    latexPre: LATEX_PRE,
    latexPost: LATEX_POST,
    latexsvg: false,
    req: [[0, 'all', [0]]],
    tags: [],
    vers: [],
  }
}

function deckJson(id: number, name: string) {
  return {
    id,
    name,
    desc: '',
    dyn: 0,
    conf: 1,
    collapsed: false,
    // genanki: 10 on the Default deck, 0 on user decks.
    extendNew: id === 1 ? 10 : 0,
    extendRev: 50,
    lrnToday: [0, 0],
    newToday: [0, 0],
    revToday: [0, 0],
    timeToday: [0, 0],
    mod: Math.floor(Date.now() / 1000),
    usn: -1,
  }
}

const DCONF = {
  '1': {
    id: 1,
    name: 'Default',
    autoplay: true,
    maxTaken: 60,
    mod: 0,
    replayq: true,
    timer: 0,
    usn: 0,
    new: { bury: true, delays: [1, 10], initialFactor: 2500, ints: [1, 4, 7], order: 1, perDay: 20, separate: true },
    rev: { bury: true, ease4: 1.3, fuzz: 0.05, ivlFct: 1, maxIvl: 36500, minSpace: 1, perDay: 100 },
    lapse: { delays: [10], leechAction: 0, leechFails: 8, minInt: 1, mult: 0 },
  },
}

// ---------------------------------------------------------------------------
// Schema (Anki 2.1 legacy, version 11 — identical to genanki's)
// ---------------------------------------------------------------------------

const SCHEMA = `
CREATE TABLE col (
  id integer primary key,
  crt integer not null,
  mod integer not null,
  scm integer not null,
  ver integer not null,
  dty integer not null,
  usn integer not null,
  ls integer not null,
  conf text not null,
  models text not null,
  decks text not null,
  dconf text not null,
  tags text not null
);
CREATE TABLE notes (
  id integer primary key,
  guid text not null,
  mid integer not null,
  mod integer not null,
  usn integer not null,
  tags text not null,
  flds text not null,
  sfld integer not null,
  csum integer not null,
  flags integer not null,
  data text not null
);
CREATE TABLE cards (
  id integer primary key,
  nid integer not null,
  did integer not null,
  ord integer not null,
  mod integer not null,
  usn integer not null,
  type integer not null,
  queue integer not null,
  due integer not null,
  ivl integer not null,
  factor integer not null,
  reps integer not null,
  lapses integer not null,
  left integer not null,
  odue integer not null,
  odid integer not null,
  flags integer not null,
  data text not null
);
CREATE TABLE revlog (
  id integer primary key,
  cid integer not null,
  usn integer not null,
  ease integer not null,
  ivl integer not null,
  lastIvl integer not null,
  factor integer not null,
  time integer not null,
  type integer not null
);
CREATE TABLE graves (
  usn integer not null,
  oid integer not null,
  type integer not null
);
CREATE INDEX ix_notes_usn ON notes (usn);
CREATE INDEX ix_cards_usn ON cards (usn);
CREATE INDEX ix_revlog_usn ON revlog (usn);
CREATE INDEX ix_cards_nid ON cards (nid);
CREATE INDEX ix_cards_sched ON cards (did, queue, due);
CREATE INDEX ix_revlog_cid ON revlog (cid);
CREATE INDEX ix_notes_csum ON notes (csum);
`
