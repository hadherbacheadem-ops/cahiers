import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import initSqlJs from 'sql.js'
import { buildApkg, clozeToAnki, MODEL_ID_BASIC, MODEL_ID_CLOZE, sha1Hex, sha1HexSync, toAnkiHtml } from './apkg'
import type { Exercise, ExerciseData } from '../types'

const wasmPath = fileURLToPath(new URL('../../node_modules/sql.js/dist/sql-wasm.wasm', import.meta.url))
const locateSqlWasm = () => wasmPath

function ex(id: string, data: ExerciseData, tags: string[] = []): Exercise {
  return {
    id,
    chapitreId: 'ch1',
    cahierId: 'ca1',
    pointId: null,
    type: data.type,
    data,
    difficulty: 2,
    tags,
    status: 'active',
    origin: 'claude',
    fsrs: { due: 0, stability: 0, difficulty: 0, elapsed_days: 0, scheduled_days: 0, learning_steps: 0, reps: 0, lapses: 0, state: 0 },
    createdAt: 0,
    updatedAt: 0,
  }
}

const exercises: Exercise[] = [
  ex('fc-1', { type: 'flashcard', question: 'Énoncé du théorème de Gauss ?', answer: '$\\Phi = Q_{int}/\\varepsilon_0$', hint: 'flux' }, ['gauss', 'électrostatique']),
  ex('cl-1', { type: 'cloze', text: 'La {{mitochondrie|mito}} produit {{ATP|adénosine triphosphate}}.' }, ['bio cell']),
  ex('mcq-1', { type: 'mcq', question: 'Unité du champ E ?', choices: ['V/m', 'T', 'N/C', 'Wb'], correct: [0, 2], explanation: 'Deux écritures équivalentes.', distractorReasons: ['', 'Tesla : champ B', '', 'Weber : flux'] }),
  ex('tf-1', { type: 'truefalse', statement: 'Le flux est nul dans un conducteur.', answer: false, explanation: 'Champ nul, pas flux.', correctedStatement: 'Le champ est nul dans un conducteur.' }),
  ex('m-1', { type: 'match', instruction: 'Associer', pairs: [{ left: 'E', right: 'V/m' }, { left: 'B', right: 'T' }, { left: 'Φ', right: 'Wb' }] }),
  ex('o-1', { type: 'order', instruction: 'Étapes', items: ['Choisir la surface', 'Calculer le flux', 'Appliquer Gauss'] }),
  ex('d-1', { type: 'demonstration', title: 'Champ d’une sphère', statement: 'Montrer que E = kQ/r²', steps: [{ text: 'Symétrie sphérique', why: 'invariances' }, { text: 'Gauss sur une sphère' }] }),
  ex('r-1', { type: 'rappel_libre', topic: 'Le théorème de Gauss', checklist: [{ text: 'flux' }, { text: 'charge intérieure' }] }),
  ex('ct-1', { type: 'carte_trous', mindmapId: 'mm', variant: 'trous' }),
]

// 1 + 1 + 1 + 1 + 3 (match) + 1 + 1 + 1 = 10 notes, carte_trous skipped.
const EXPECTED_NOTES = 10
// 2-blank cloze → 2 cards.
const EXPECTED_CARDS = EXPECTED_NOTES + 1

interface NoteRow {
  guid: string
  mid: number
  tags: string
  flds: string
}

async function openCollection(blob: Blob) {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  const entry = zip.file('collection.anki2')
  expect(entry).toBeTruthy()
  expect(await zip.file('media')?.async('string')).toBe('{}')
  const bytes = await entry!.async('uint8array')
  const SQL = await initSqlJs({ locateFile: locateSqlWasm })
  return new SQL.Database(bytes)
}

describe('buildApkg', () => {
  it('produces a valid legacy Anki collection', async () => {
    const result = await buildApkg({ deckName: 'Cahiers::Physique::Gauss', exercises, locateSqlWasm })
    expect(result.notes).toBe(EXPECTED_NOTES)
    expect(result.cards).toBe(EXPECTED_CARDS)
    expect(result.skipped).toBe(1)
    expect(result.blob.size).toBeGreaterThan(0)

    const db = await openCollection(result.blob)
    try {
      expect(db.exec('SELECT ver FROM col')[0].values[0][0]).toBe(11)
      expect(db.exec('SELECT crt FROM col')[0].values[0][0]).toBeGreaterThan(0)

      const modelsJson = db.exec('SELECT models FROM col')[0].values[0][0] as string
      const models = JSON.parse(modelsJson) as Record<string, { name: string; type: number; flds: unknown[]; tmpls: unknown[] }>
      expect(Object.keys(models)).toHaveLength(2)
      expect(models[String(MODEL_ID_BASIC)].name).toBe('Cahiers Basic')
      expect(models[String(MODEL_ID_BASIC)].type).toBe(0)
      expect(models[String(MODEL_ID_BASIC)].flds).toHaveLength(3)
      expect(models[String(MODEL_ID_CLOZE)].name).toBe('Cahiers Cloze')
      expect(models[String(MODEL_ID_CLOZE)].type).toBe(1)
      expect(models[String(MODEL_ID_CLOZE)].flds).toHaveLength(2)

      const decks = JSON.parse(db.exec('SELECT decks FROM col')[0].values[0][0] as string) as Record<string, { name: string }>
      const deckNames = Object.values(decks).map((d) => d.name)
      expect(deckNames).toEqual(expect.arrayContaining(['Default', 'Cahiers', 'Cahiers::Physique', 'Cahiers::Physique::Gauss']))

      expect(db.exec('SELECT count(*) FROM notes')[0].values[0][0]).toBe(EXPECTED_NOTES)
      expect(db.exec('SELECT count(*) FROM cards')[0].values[0][0]).toBe(EXPECTED_CARDS)

      const rows = db.exec('SELECT guid, mid, tags, flds FROM notes')[0].values.map(
        ([guid, mid, tags, flds]) => ({ guid, mid, tags, flds }) as NoteRow,
      )
      for (const r of rows) {
        const fieldCount = models[String(r.mid)].flds.length
        expect(r.flds.split('\x1f')).toHaveLength(fieldCount)
        expect(r.tags.split(' ')).toContain('cahiers')
      }
      const clozeRow = rows.find((r) => r.mid === MODEL_ID_CLOZE)!
      expect(clozeRow.flds).toContain('{{c1::mitochondrie}}')
      expect(clozeRow.flds).toContain('{{c2::ATP}}')
      expect(clozeRow.tags).toContain('bio_cell')
      const clozeCards = db.exec('SELECT ord FROM cards WHERE nid = (SELECT id FROM notes WHERE mid = ?) ORDER BY ord', [MODEL_ID_CLOZE])[0].values
      expect(clozeCards.map((v) => v[0])).toEqual([0, 1])

      const flashRow = rows.find((r) => r.flds.startsWith('Énoncé'))!
      expect(flashRow.tags).toContain('électrostatique')
      expect(flashRow.flds.split('\x1f')[1]).toContain('\\(\\Phi = Q_{int}/\\varepsilon_0\\)')

      // All cards new, deck = the requested one, due = increasing positions.
      const cards = db.exec('SELECT type, queue, due, did FROM cards ORDER BY due')[0].values
      expect(cards.every((c) => c[0] === 0 && c[1] === 0)).toBe(true)
      expect(cards.map((c) => c[2])).toEqual(cards.map((_, i) => i + 1))
      expect(new Set(cards.map((c) => c[3])).size).toBe(1)
      const deckId = cards[0][3] as number
      expect(decks[String(deckId)].name).toBe('Cahiers::Physique::Gauss')

      // Match: 3 notes with the instruction as Extra.
      const matchRows = rows.filter((r) => r.flds.endsWith('\x1fAssocier'))
      expect(matchRows).toHaveLength(3)

      // Order: front is alphabetical, back is numbered in the stored order.
      const orderRow = rows.find((r) => r.flds.startsWith('Étapes'))!
      const [front, back] = orderRow.flds.split('\x1f')
      expect(front).toContain('Appliquer Gauss · Calculer le flux · Choisir la surface')
      expect(back).toBe('1. Choisir la surface<br>2. Calculer le flux<br>3. Appliquer Gauss')

      // MCQ letters.
      const mcqRow = rows.find((r) => r.flds.startsWith('Unité'))!
      const mcq = mcqRow.flds.split('\x1f')
      expect(mcq[0]).toContain('A. V/m<br>B. T<br>C. N/C<br>D. Wb')
      expect(mcq[1]).toBe('A. V/m<br>C. N/C')
      expect(mcq[2]).toContain('B : Tesla')

      // Vrai/Faux with corrected statement.
      const tfRow = rows.find((r) => r.flds.startsWith('Le flux'))!
      expect(tfRow.flds.split('\x1f')[1]).toBe('Faux<br>Le champ est nul dans un conducteur.')
    } finally {
      db.close()
    }
  })

  it('yields identical guids across exports', async () => {
    const a = await buildApkg({ deckName: 'Cahiers::Test', exercises, locateSqlWasm })
    const b = await buildApkg({ deckName: 'Cahiers::Test', exercises, locateSqlWasm })
    const dbA = await openCollection(a.blob)
    const dbB = await openCollection(b.blob)
    try {
      const guids = (db: typeof dbA) => db.exec('SELECT guid FROM notes ORDER BY guid')[0].values.map((v) => v[0])
      const ga = guids(dbA)
      const gb = guids(dbB)
      expect(ga).toEqual(gb)
      expect(new Set(ga).size).toBe(EXPECTED_NOTES)
    } finally {
      dbA.close()
      dbB.close()
    }
  })

  it('honours deckFor per exercise and creates the ancestors', async () => {
    const r = await buildApkg({
      deckName: 'Cahiers',
      exercises: exercises.slice(0, 2),
      deckFor: (e) => (e.id === 'fc-1' ? 'Cahiers::SVT::Cellule' : 'Cahiers::Physique::Gauss'),
      locateSqlWasm,
    })
    const db = await openCollection(r.blob)
    try {
      const decks = JSON.parse(db.exec('SELECT decks FROM col')[0].values[0][0] as string) as Record<string, { name: string }>
      const names = Object.values(decks).map((d) => d.name)
      expect(names).toEqual(expect.arrayContaining(['Cahiers::SVT', 'Cahiers::SVT::Cellule', 'Cahiers::Physique', 'Cahiers::Physique::Gauss']))
      expect(new Set(db.exec('SELECT did FROM cards')[0].values.map((v) => v[0])).size).toBe(2)
    } finally {
      db.close()
    }
  })
})

describe('toAnkiHtml', () => {
  it('converts math, bold and line breaks', () => {
    const html = toAnkiHtml('Soit $E = mc^2$ et **gras**\nsuite')
    expect(html).toContain('\\(E = mc^2\\)')
    expect(html).toContain('<b>gras</b>')
    expect(html).toContain('<br>')
    expect(html).toBe('Soit \\(E = mc^2\\) et <b>gras</b><br>suite')
  })

  it('handles display math, italics, escaping and \\ce', () => {
    expect(toAnkiHtml('$$\\int_0^1 x\\,dx$$')).toBe('\\[\\int_0^1 x\\,dx\\]')
    expect(toAnkiHtml('un *mot* ici')).toBe('un <i>mot</i> ici')
    expect(toAnkiHtml('a < b & c')).toBe('a &lt; b &amp; c')
    expect(toAnkiHtml('$\\ce{H2O}$')).toBe('\\(\\ce{H2O}\\)')
    expect(toAnkiHtml('$a*b*c$')).toBe('\\(a*b*c\\)')
  })
})

describe('clozeToAnki', () => {
  it('numbers blanks and keeps only the first variant', () => {
    expect(clozeToAnki('La {{mitochondrie|mito}} produit {{$ATP$}}')).toBe('La {{c1::mitochondrie}} produit {{c2::\\(ATP\\)}}')
  })

  it('keeps a blank inside a formula inside the math delimiters', () => {
    expect(clozeToAnki('On a $E = {{mc^2}}$.')).toBe('On a \\(E = {{c1::mc^2}}\\).')
  })
})

describe('sha1', () => {
  it('pure-JS fallback matches the known vector and WebCrypto', async () => {
    expect(sha1HexSync('abc')).toBe('a9993e364706816aba3e25717850c26c9cd0d89d')
    expect(sha1HexSync('')).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709')
    const long = 'é'.repeat(200) + 'The quick brown fox jumps over the lazy dog'
    expect(sha1HexSync(long)).toBe(await sha1Hex(long))
  })
})
