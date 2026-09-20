import { describe, expect, it } from 'vitest'
import { parseClaudeResponse, parsePrepaResponse, parsePreparation, toPreparation } from './importClaude'
import { buildPrepaPrompt, prepaSection } from './prepaPrompt'
import { buildPrompt } from './prompt'

const exo = (over: Record<string, unknown> = {}) => ({
  concours: 'CCP',
  annee: 2021,
  epreuve: 'Physique, oral',
  source: 'CCP PSI 2021, oral de physique, exercice 2',
  sourceUrl: 'https://example.org/annale',
  exact: true,
  niveau: 1,
  duree: 20,
  statement: 'Un satellite de masse $m$ décrit une orbite circulaire de rayon $r_0$ autour de la Terre.',
  hints: ['Quelle grandeur se conserve ?', 'Applique le théorème du moment cinétique.', 'Tu obtiens $r_0 = C^2/GM$.'],
  correction: 'Le moment cinétique est conservé, donc $r^2\\dot\\theta = C$.',
  ...over,
})

describe('parsePreparation', () => {
  it('reads kholle and DS, sorted by increasing difficulty', () => {
    const p = parsePreparation({
      kholle: [exo({ concours: 'X-ENS', niveau: 3 }), exo({ concours: 'CCP', niveau: 1 }), exo({ concours: 'Centrale', niveau: 2 })],
      ds: [exo({ concours: 'Centrale', niveau: 2 })],
      note: 'Peu de résultats pour X.',
    })
    expect(p.kholle.map((e) => e.concours)).toEqual(['CCP', 'Centrale', 'X-ENS'])
    expect(p.ds).toHaveLength(1)
    expect(p.note).toBe('Peu de résultats pour X.')
    expect(p.rejected).toEqual([])
    expect(new Set([...p.kholle, ...p.ds].map((e) => e.id)).size).toBe(4)
  })

  it('keeps the year as text, only real links, and defaults exact to false', () => {
    const [a] = parsePreparation({ kholle: [exo({ exact: undefined, sourceUrl: 'javascript:alert(1)' })], ds: [] }).kholle
    expect(a.annee).toBe('2021')
    expect(a.sourceUrl).toBeUndefined()
    expect(a.exact).toBe(false)
    expect(parsePreparation({ kholle: [exo()], ds: [] }).kholle[0].sourceUrl).toBe('https://example.org/annale')
  })

  it('caps the hints at three, and drops an exercise with none or without a statement', () => {
    const p = parsePreparation({ kholle: [exo({ hints: ['a', 'b', 'c', 'd'] }), exo({ hints: [] }), exo({ statement: '' })], ds: [] })
    expect(p.kholle).toHaveLength(1)
    expect(p.kholle[0].hints).toEqual(['a', 'b', 'c'])
    expect(p.rejected).toHaveLength(2)
  })

  it('shows the duration for a kholle only', () => {
    const p = parsePreparation({ kholle: [exo({ duree: '25' })], ds: [exo({ duree: 90 })] })
    expect(p.kholle[0].duree).toBe(25)
    expect(p.ds[0].duree).toBeUndefined()
  })

  it('stores a plain, dated object', () => {
    const s = toPreparation(parsePreparation({ kholle: [exo()], ds: [] }), 42)
    expect(s.generatedAt).toBe(42)
    expect(s.kholle).toHaveLength(1)
  })
})

describe('answers', () => {
  const json = (o: unknown) => '```json\n' + JSON.stringify(o) + '\n```'

  it('rides along with the exercises', () => {
    const r = parseClaudeResponse(json({ points: [], exercises: [], preparation: { kholle: [exo()], ds: [] } }))
    expect(r.prepa?.kholle).toHaveLength(1)
  })

  it('has no preparation when the key is absent or empty', () => {
    expect(parseClaudeResponse(json({ points: [], exercises: [] })).prepa).toBeUndefined()
    expect(parseClaudeResponse(json({ points: [], exercises: [], preparation: { kholle: [], ds: [] } })).prepa).toBeUndefined()
  })

  it('comes alone, with or without the wrapping key', () => {
    expect(parsePrepaResponse(json({ preparation: { kholle: [], ds: [exo()] } })).ds).toHaveLength(1)
    expect(parsePrepaResponse(json({ kholle: [exo()], ds: [] })).kholle).toHaveLength(1)
  })

  it('explains an empty answer with Claude’s note', () => {
    expect(() => parsePrepaResponse(json({ preparation: { kholle: [], ds: [], note: 'Pas d’accès au web.' } }))).toThrow(/Pas d’accès au web/)
    expect(() => parsePrepaResponse(json({ preparation: { kholle: [], ds: [] } }))).toThrow(/Aucun exercice/)
  })

  it('survives LaTeX backslashes written singly', () => {
    const raw = '```json\n{"preparation":{"kholle":[{"concours":"CCP","source":"CCP 2020","niveau":1,"statement":"Calculer $\\dfrac{a}{b}$.","hints":["a","b","c"],"correction":"$\\theta$"}],"ds":[]}}\n```'
    expect(parsePrepaResponse(raw).kholle[0].statement).toContain('\\dfrac')
  })
})

describe('prompts', () => {
  it('names the categories, the honesty rule, the hints and the correction', () => {
    const s = prepaSection('PC')
    for (const w of ['"kholle"', '"ds"', 'JAMAIS inventer', 'EXACTEMENT 3 indices', '"correction"', 'CCP', 'X-ENS', 'PC']) expect(s).toContain(w)
  })

  it('rides along with the exercise prompt only when asked', () => {
    const base = { cahierName: 'Physique', title: 'Mécanique céleste', content: 'Le cours.', types: ['flashcard' as const] }
    expect(buildPrompt(base)).not.toContain('"preparation"')
    const withPrepa = buildPrompt({ ...base, prepaSection: prepaSection() })
    expect(withPrepa).toContain('"preparation"')
    expect(withPrepa.indexOf('Préparation aux kholles')).toBeLessThan(withPrepa.indexOf('## Format de réponse'))
  })

  it('stands alone with the fiche', () => {
    const p = buildPrepaPrompt({ cahierName: 'Physique', title: 'Mécanique céleste', content: 'Le cours de mécanique.', niveau: 'PC' })
    expect(p).toContain('Le cours de mécanique.')
    expect(p).toContain('"preparation"')
    expect(p).not.toContain('"exercises"')
  })
})
