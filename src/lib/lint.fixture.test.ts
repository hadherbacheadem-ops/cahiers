import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseClaudeResponse } from './importClaude'
import { lintAnchor, lintBatch, type LintCode } from './lint'

interface AnnotatedFixture {
  fiche?: string
  points: { id: string; anchor: string; expectedIssues?: LintCode[] }[]
  exercises: ({ expectedIssues?: LintCode[] } & Record<string, unknown>)[]
}

function loadFixture(name: string): AnnotatedFixture {
  return JSON.parse(readFileSync(fileURLToPath(new URL(`../../tests/fixtures/${name}`, import.meta.url)), 'utf8')) as AnnotatedFixture
}

/** Precision / recall over (exercise, code) pairs, warn-level findings only. */
function score(expected: LintCode[][], found: LintCode[][]) {
  let tp = 0
  let fp = 0
  let fn = 0
  const missed: string[] = []
  const spurious: string[] = []
  expected.forEach((exp, i) => {
    const got = new Set(found[i])
    const want = new Set(exp)
    for (const c of got) {
      if (want.has(c)) tp++
      else {
        fp++
        spurious.push(`#${i + 1}:${c}`)
      }
    }
    for (const c of want) {
      if (!got.has(c)) {
        fn++
        missed.push(`#${i + 1}:${c}`)
      }
    }
  })
  return { precision: tp + fp ? tp / (tp + fp) : 1, recall: tp + fn ? tp / (tp + fn) : 1, tp, fp, fn, missed, spurious }
}

describe('linter on a realistic physics batch (tests/fixtures/lot-physique.json)', () => {
  const fixture = loadFixture('lot-physique.json')
  const parsed = parseClaudeResponse(JSON.stringify({ points: fixture.points, exercises: fixture.exercises }))

  it('parses every exercise of the batch', () => {
    expect(fixture.exercises).toHaveLength(40)
    expect(parsed.rejected).toEqual([])
    expect(parsed.exercises).toHaveLength(40)
  })

  it('reaches precision ≥ 0.8 and recall ≥ 0.8 on the annotated defects', () => {
    const reports = lintBatch(
      parsed.exercises.map((e) => e.data),
      { existingKeys: [] },
    )
    const found = reports.map((r) => r.issues.filter((i) => i.severity === 'warn').map((i) => i.code))
    const expected = fixture.exercises.map((e) => e.expectedIssues ?? [])
    const s = score(expected, found)
    // Real figures, reported in DECISIONS.md.
    console.log(`lot-physique: precision ${s.precision.toFixed(2)} (fp ${s.fp}), recall ${s.recall.toFixed(2)} (fn ${s.fn}); missed=${s.missed.join(' ')}; spurious=${s.spurious.join(' ')}`)
    expect(s.recall).toBeGreaterThanOrEqual(0.8)
    expect(s.precision).toBeGreaterThanOrEqual(0.8)
  })

  it('flags the paraphrased anchor and accepts the quoted ones', () => {
    for (const p of fixture.points) {
      const issue = lintAnchor(p.anchor, fixture.fiche ?? '')
      const expectedMissing = (p.expectedIssues ?? []).includes('anchor_missing')
      expect(issue !== null, `point ${p.id}`).toBe(expectedMissing)
    }
  })
})

describe('linter on correct maths exercises (tests/fixtures/lot-maths-corrects.json)', () => {
  const fixture = loadFixture('lot-maths-corrects.json')
  const parsed = parseClaudeResponse(JSON.stringify({ points: fixture.points, exercises: fixture.exercises }))

  it('produces no warn-level finding (info-level ones are tolerated)', () => {
    expect(parsed.rejected).toEqual([])
    expect(parsed.exercises).toHaveLength(15)
    const reports = lintBatch(
      parsed.exercises.map((e) => e.data),
      { existingKeys: [] },
    )
    const warns = reports.flatMap((r) => r.issues.filter((i) => i.severity === 'warn').map((i) => `#${r.index + 1}:${i.code}`))
    expect(warns).toEqual([])
  })
})
