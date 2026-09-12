// Measures the linter on real batches dropped by the user in
// tests/fixtures/lot-externe/*.txt (raw Claude answers). No threshold: it
// writes tests/fixtures/lot-externe/rapport.md and lets the user count false
// positives and missed defects. Skipped cleanly when the folder holds no .txt.

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseClaudeResponse } from './importClaude'
import { exerciseKeyText, lintBatch, LINT_LABELS, type LintCode } from './lint'
import { exerciseAnswerText, exercisePromptText } from './session'
import type { Exercise, ExerciseData } from '../types'

const DIR = fileURLToPath(new URL('../../tests/fixtures/lot-externe', import.meta.url))
const REPORT = join(DIR, 'rapport.md')

function listBatches(): string[] {
  if (!existsSync(DIR)) return []
  return readdirSync(DIR)
    .filter((f) => f.toLowerCase().endsWith('.txt'))
    .sort()
}

/** Text a reader needs to judge an exercise: what the student sees, then the answer. */
function describeExercise(data: ExerciseData): string {
  const fake = { data, type: data.type } as Exercise
  const prompt = exercisePromptText(fake).replace(/\s+/g, ' ').trim()
  const answer = exerciseAnswerText(fake).replace(/\s+/g, ' ').trim()
  return answer ? `${prompt} → ${answer}` : prompt || exerciseKeyText(data)
}

function report(files: string[]): string {
  const out: string[] = [`# Rapport du linter sur les lots externes`, '', `Généré le ${new Date().toISOString().slice(0, 16).replace('T', ' ')} — ${files.length} fichier(s). Aucun seuil : compte toi-même les faux positifs et les défauts manqués.`, '']
  for (const file of files) {
    const text = readFileSync(join(DIR, file), 'utf8')
    out.push(`## ${file}`, '')
    let parsed: ReturnType<typeof parseClaudeResponse>
    try {
      parsed = parseClaudeResponse(text)
    } catch (e) {
      out.push(`**Illisible** : ${e instanceof Error ? e.message : String(e)}`, '')
      continue
    }
    const reports = lintBatch(
      parsed.exercises.map((e) => e.data),
      { existingKeys: [] },
    )
    const byCode = new Map<LintCode, number>()
    for (const r of reports) for (const i of r.issues) byCode.set(i.code, (byCode.get(i.code) ?? 0) + 1)
    const flagged = reports.filter((r) => r.issues.some((i) => i.severity === 'warn'))
    const infoOnly = reports.filter((r) => r.issues.length && !r.issues.some((i) => i.severity === 'warn'))
    const clean = reports.filter((r) => !r.issues.length)

    out.push(`- Points : ${parsed.points.length} · exercices : ${parsed.exercises.length} · rejetés au parsing : ${parsed.rejected.length} · antislashs réparés : ${parsed.repairs.doubledBackslashes}`)
    out.push(`- Signalés (warn) : ${flagged.length} · info seulement : ${infoOnly.length} · sans remarque : ${clean.length}`, '')
    if (parsed.rejected.length) {
      out.push('### Rejetés au parsing', '')
      for (const r of parsed.rejected) out.push(`- #${r.index + 1} — ${r.reason}`, '', '  ```json', `  ${r.raw}`, '  ```', '')
    }
    out.push('### Par code', '')
    out.push('| Code | Libellé | Sévérité | Occurrences |', '|---|---|---|---|')
    for (const [code, n] of [...byCode.entries()].sort((a, b) => b[1] - a[1])) {
      const severity = reports.flatMap((r) => r.issues).find((i) => i.code === code)?.severity ?? 'warn'
      out.push(`| \`${code}\` | ${LINT_LABELS[code]} | ${severity} | ${n} |`)
    }
    if (!byCode.size) out.push('| — | aucun défaut | | 0 |')
    out.push('', '### Exercices signalés', '')
    if (!flagged.length) out.push('_Aucun._', '')
    for (const r of flagged) {
      const data = parsed.exercises[r.index].data
      const codes = r.issues.map((i) => `\`${i.code}\`${i.severity === 'info' ? ' (info)' : ''}`).join(', ')
      out.push(`- **#${r.index + 1}** (${data.type}) ${codes}`, `  ${describeExercise(data)}`, '')
    }
    out.push('### Exercices non signalés (pour repérer les défauts manqués)', '')
    for (const r of [...infoOnly, ...clean].sort((a, b) => a.index - b.index)) {
      const data = parsed.exercises[r.index].data
      const info = r.issues.length ? ` — info : ${r.issues.map((i) => `\`${i.code}\``).join(', ')}` : ''
      out.push(`- #${r.index + 1} (${data.type})${info} ${describeExercise(data)}`)
    }
    out.push('')
  }
  return out.join('\n')
}

describe('linter on external batches (tests/fixtures/lot-externe)', () => {
  const files = listBatches()
  if (!files.length) {
    it.skip('no .txt batch dropped in tests/fixtures/lot-externe — see its README.md', () => {})
    return
  }
  it(`writes rapport.md for ${files.length} batch(es)`, () => {
    const md = report(files)
    writeFileSync(REPORT, md, 'utf8')
    expect(md).toContain('# Rapport du linter')
    for (const f of files) expect(md).toContain(`## ${f}`)
  })
})
