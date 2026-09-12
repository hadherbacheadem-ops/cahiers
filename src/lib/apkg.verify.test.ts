import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildApkg, guidFor, sha256Hex, sha256HexSync } from './apkg'
import type { Exercise, ExerciseData } from '../types'

const wasmPath = fileURLToPath(new URL('../../node_modules/sql.js/dist/sql-wasm.wasm', import.meta.url))
const scriptPath = fileURLToPath(new URL('../../scripts/verify-apkg.mjs', import.meta.url))

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

/** One exercise of every exported type, with LaTeX and HTML-sensitive characters. */
const exercises: Exercise[] = [
  ex('fc-1', { type: 'flashcard', question: 'Énergie cinétique ?', answer: '$E_c = \\dfrac{1}{2} m v^2$', hint: 'a < b & c' }, ['mécanique']),
  ex('cl-1', { type: 'cloze', text: 'Le théorème de Gauss : {{$\\Phi = Q_{int}/\\varepsilon_0$}} ; il s\'applique aux {{distributions symétriques|symétries}}.' }, ['gauss']),
  ex('mcq-1', { type: 'mcq', question: 'Unité du champ **E** ?', choices: ['V/m', 'T', 'N/C', 'Wb'], correct: [0, 2], explanation: 'Deux écritures.', distractorReasons: ['', 'Tesla : champ B', '', 'Weber : flux'] }),
  ex('tf-1', { type: 'truefalse', statement: 'Le flux est nul dans un conducteur.', answer: false, correctedStatement: 'Le champ est nul dans un conducteur.' }),
  ex('m-1', { type: 'match', instruction: 'Associer', pairs: [{ left: 'E', right: 'V/m' }, { left: 'B', right: 'T' }] }),
  ex('o-1', { type: 'order', instruction: 'Étapes', items: ['Choisir la surface', 'Calculer le flux', 'Appliquer Gauss'] }),
  ex('d-1', { type: 'demonstration', title: 'Champ d’une sphère', statement: 'Montrer que $E = kQ/r^2$', steps: [{ text: 'Symétrie sphérique', why: 'invariances' }, { text: 'Gauss sur une sphère' }] }),
  ex('r-1', { type: 'rappel_libre', topic: 'Le théorème de Gauss', checklist: [{ text: 'flux' }, { text: 'charge intérieure' }] }),
]

interface Report {
  ok: boolean
  checks: { name: string; ok: boolean; detail: string }[]
  summary: { notes: number; cards: number; models: number; decks: number }
}

describe('scripts/verify-apkg.mjs', () => {
  it('validates a package holding every exported exercise type', async () => {
    const result = await buildApkg({
      deckName: 'Cahiers::Physique',
      exercises,
      deckFor: (e) => (e.tags.includes('gauss') ? 'Cahiers::Physique::Gauss' : 'Cahiers::Physique'),
      locateSqlWasm: () => wasmPath,
    })
    const dir = mkdtempSync(join(tmpdir(), 'cahiers-apkg-'))
    const file = join(dir, 'verify.apkg')
    writeFileSync(file, new Uint8Array(await result.blob.arrayBuffer()))

    const stdout = execFileSync(process.execPath, [scriptPath, file, '--json'], { encoding: 'utf8' })
    const report = JSON.parse(stdout) as Report
    const failed = report.checks.filter((c) => !c.ok).map((c) => `${c.name}${c.detail ? ` — ${c.detail}` : ''}`)
    expect(failed).toEqual([])
    expect(report.ok).toBe(true)
    // 1 + 1 + 1 + 1 + 2 (match) + 1 + 1 + 1 notes ; the two-blank cloze makes 2 cards.
    expect(report.summary).toEqual({ notes: 9, cards: 10, models: 2, decks: 4 })
    expect(report.checks.length).toBeGreaterThan(50)
  })

  it('fails (exit code 1) on a broken package', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cahiers-apkg-'))
    const file = join(dir, 'broken.apkg')
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()
    zip.file('media', '{}')
    writeFileSync(file, await zip.generateAsync({ type: 'uint8array' }))
    let status = 0
    try {
      execFileSync(process.execPath, [scriptPath, file], { encoding: 'utf8', stdio: 'pipe' })
    } catch (e) {
      status = (e as { status: number }).status
    }
    expect(status).toBe(1)
  })
})

describe('guid (genanki scheme)', () => {
  it('matches genanki: base91 of the first 64 bits of sha256', async () => {
    // Computed with genanki.util.guid_for('fc-1') → sha256('fc-1')[:8] as int → base91.
    const hex = await sha256Hex('fc-1')
    expect(hex).toBe(sha256HexSync('fc-1'))
    let n = BigInt('0x' + hex.slice(0, 16))
    const table = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%&()*+,-./:;<=>?@[]^_`{|}~'
    let expected = ''
    while (n > 0n) {
      expected = table[Number(n % 91n)] + expected
      n /= 91n
    }
    expect(await guidFor('fc-1')).toBe(expected)
  })

  it('sha256 fallback agrees with WebCrypto on known vectors', async () => {
    expect(sha256HexSync('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(sha256HexSync('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    const long = 'é'.repeat(200) + 'x'.repeat(70)
    expect(sha256HexSync(long)).toBe(await sha256Hex(long))
  })
})
